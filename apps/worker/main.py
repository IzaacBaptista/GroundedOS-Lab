"""
GroundedOS Worker — real BullMQ consumer.

Consumes jobs from the ``groundedos-phase6-jobs`` queue published by the
Node.js API.  Implements:
  - ack/fail semantics with exponential backoff retry (via BullMQ)
  - idempotency guard (Redis Set of completed job IDs)
  - OTel trace propagation from API enqueue span
  - graceful shutdown on SIGTERM / SIGINT
"""
from __future__ import annotations

import asyncio
import logging
import os
import signal
import sys
from typing import Any

import redis.asyncio as aioredis

from idempotency import IdempotencyGuard
from job_types import JobPayload, parse_payload
from otel_setup import configure_otel, extract_context_from_job, get_tracer

logger = logging.getLogger(__name__)

QUEUE_NAME = "groundedos-phase6-jobs"
DLQ_NAME = "groundedos-phase6-jobs-dlq"

# Retry policy: up to 5 attempts, exponential backoff starting at 2 s.
MAX_ATTEMPTS = 5
BACKOFF_BASE_SECONDS = 2.0
BACKOFF_JITTER_SECONDS = 0.5

# Use the official bullmq Python package when available; otherwise fall back
# to a direct Redis polling loop that speaks the same wire protocol.
_BULLMQ_AVAILABLE = False
try:
    from bullmq import Worker as BullMQWorker  # type: ignore[import]
    _BULLMQ_AVAILABLE = True
except ImportError:
    pass


# ---------------------------------------------------------------------------
# Job processors
# ---------------------------------------------------------------------------


async def process_phase5_experiment(payload: Any, job_id: str) -> dict:
    track = payload.track
    logger.info("[worker] running phase5 experiment track=%s job=%s", track, job_id)

    experiment_map = {
        "quantization": ["python", "experiments/quantization/run.py"],
        "lora": ["python", "experiments/lora/run.py"],
        "fine-tuning": ["python", "experiments/fine_tuning/run.py"],
        "distillation": ["python", "experiments/distillation/run.py"],
    }
    cmd = experiment_map.get(track)
    if cmd is None:
        raise ValueError(f"Unknown experiment track: {track!r}")

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        raise RuntimeError(
            f"Experiment {track!r} failed (exit {proc.returncode}): {stderr.decode()[:500]}"
        )

    return {"track": track, "stdout": stdout.decode()[:2000]}


async def process_model_benchmark(payload: Any, job_id: str) -> dict:
    providers = payload.providers
    logger.info("[worker] running model benchmark providers=%s job=%s", providers, job_id)

    proc = await asyncio.create_subprocess_exec(
        "python",
        "experiments/benchmark_models.py",
        "--providers",
        ",".join(providers),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        raise RuntimeError(
            f"Model benchmark failed (exit {proc.returncode}): {stderr.decode()[:500]}"
        )

    return {"providers": providers, "stdout": stdout.decode()[:2000]}


async def dispatch(payload: JobPayload, job_id: str) -> dict:
    """Route a validated payload to the correct processor."""
    if payload.type == "phase5-experiment":
        return await process_phase5_experiment(payload, job_id)
    if payload.type == "model-benchmark":
        return await process_model_benchmark(payload, job_id)
    raise ValueError(f"No processor for job type: {payload.type!r}")


# ---------------------------------------------------------------------------
# BullMQ-backed consumer (preferred path)
# ---------------------------------------------------------------------------


async def run_bullmq_consumer(redis_url: str, guard: IdempotencyGuard) -> None:
    """Use the official bullmq Python package to consume jobs."""
    tracer = get_tracer()

    async def process_job(job, job_token):  # noqa: ANN001
        job_id = str(job.id)
        job_data: dict = job.data or {}
        parent_ctx = extract_context_from_job(job_data)

        with tracer.start_as_current_span("worker.process_job", context=parent_ctx) as span:
            span.set_attribute("job.id", job_id)
            span.set_attribute("job.name", job.name)

            if await guard.is_already_processed(job_id):
                logger.info("[worker] duplicate delivery ignored job=%s", job_id)
                return {"skipped": True, "reason": "already_processed"}

            try:
                payload = parse_payload(job_data)
                result = await dispatch(payload, job_id)
                await guard.mark_processed(job_id)
                logger.info("[worker] completed job=%s", job_id)
                return result
            except Exception as exc:
                span.record_exception(exc)
                logger.error("[worker] job=%s failed: %s", job_id, exc)
                raise

    worker = BullMQWorker(
        QUEUE_NAME,
        process_job,
        {"connection": {"url": redis_url}, "concurrency": 2},
    )

    logger.info("[worker] BullMQ consumer listening on queue=%s", QUEUE_NAME)

    stop_event = asyncio.Event()

    def _handle_signal(*_):
        logger.info("[worker] shutdown signal received")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _handle_signal)

    await stop_event.wait()
    logger.info("[worker] draining in-flight jobs…")
    await worker.close()
    logger.info("[worker] shutdown complete")


# ---------------------------------------------------------------------------
# Fallback polling consumer (no bullmq package)
# ---------------------------------------------------------------------------


async def run_polling_consumer(redis_url: str, guard: IdempotencyGuard) -> None:
    """
    Minimal polling consumer that speaks BullMQ's Redis wire protocol.

    BullMQ stores waiting jobs in a Redis list ``bull:<queue>:wait``.
    This consumer uses BRPOPLPUSH to atomically move a job ID from the
    waiting list to an active list, then fetches the job hash.

    This is intentionally simple — install the bullmq Python package
    for production use.
    """
    import json

    tracer = get_tracer()
    client = aioredis.from_url(redis_url, decode_responses=True)
    wait_key = f"bull:{QUEUE_NAME}:wait"
    active_key = f"bull:{QUEUE_NAME}:active"

    logger.info("[worker] polling consumer listening on queue=%s (fallback mode)", QUEUE_NAME)

    stop_event = asyncio.Event()

    def _handle_signal(*_):
        logger.info("[worker] shutdown signal received")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _handle_signal)

    while not stop_event.is_set():
        try:
            result = await client.brpoplpush(wait_key, active_key, timeout=2)
            if result is None:
                continue

            job_id = result
            job_key = f"bull:{QUEUE_NAME}:{job_id}"
            raw = await client.hgetall(job_key)

            if not raw:
                logger.warning("[worker] job hash missing for id=%s; skipping", job_id)
                await client.lrem(active_key, 1, job_id)
                continue

            attempts_made = int(raw.get("attemptsMade", "0"))
            data: dict = json.loads(raw.get("data", "{}"))
            job_name: str = raw.get("name", "unknown")
            parent_ctx = extract_context_from_job(data)

            with tracer.start_as_current_span("worker.process_job", context=parent_ctx) as span:
                span.set_attribute("job.id", job_id)
                span.set_attribute("job.name", job_name)

                if await guard.is_already_processed(job_id):
                    logger.info("[worker] duplicate delivery ignored job=%s", job_id)
                    await _ack(client, job_id, active_key)
                    continue

                try:
                    payload = parse_payload(data)
                    result_value = await dispatch(payload, job_id)
                    await guard.mark_processed(job_id)
                    await _ack(client, job_id, active_key, result=result_value)
                    logger.info("[worker] completed job=%s", job_id)
                except Exception as exc:
                    span.record_exception(exc)
                    logger.error("[worker] job=%s error: %s", job_id, exc)
                    await _fail(
                        client,
                        job_id,
                        active_key,
                        reason=str(exc),
                        attempts_made=attempts_made,
                        max_attempts=MAX_ATTEMPTS,
                        queue_name=QUEUE_NAME,
                        dlq_name=DLQ_NAME,
                    )

        except asyncio.CancelledError:
            break
        except Exception as exc:  # noqa: BLE001
            logger.error("[worker] consumer loop error: %s", exc)
            await asyncio.sleep(1)

    await client.aclose()
    logger.info("[worker] polling consumer shutdown complete")


async def _ack(
    client: aioredis.Redis,
    job_id: str,
    active_key: str,
    result: dict | None = None,
) -> None:
    import json
    import time

    pipe = client.pipeline()
    pipe.lrem(active_key, 1, job_id)
    if result is not None:
        job_key = f"bull:{QUEUE_NAME}:{job_id}"
        pipe.hset(
            job_key,
            mapping={
                "returnvalue": json.dumps(result),
                "finishedOn": str(int(time.time() * 1000)),
            },
        )
    await pipe.execute()


async def _fail(
    client: aioredis.Redis,
    job_id: str,
    active_key: str,
    reason: str,
    attempts_made: int,
    max_attempts: int,
    queue_name: str,
    dlq_name: str,
) -> None:
    import random
    import time

    pipe = client.pipeline()
    pipe.lrem(active_key, 1, job_id)

    new_attempts = attempts_made + 1
    job_key = f"bull:{queue_name}:{job_id}"
    pipe.hset(job_key, mapping={"failedReason": reason, "attemptsMade": str(new_attempts)})

    if new_attempts >= max_attempts:
        dlq_key = f"bull:{dlq_name}:wait"
        pipe.lpush(dlq_key, job_id)
        logger.warning("[worker] job=%s exhausted retries → DLQ", job_id)
    else:
        delay_ms = int(
            (BACKOFF_BASE_SECONDS * (2 ** (new_attempts - 1)) + random.uniform(0, BACKOFF_JITTER_SECONDS))
            * 1000
        )
        score = int(time.time() * 1000) + delay_ms
        delayed_key = f"bull:{queue_name}:delayed"
        pipe.zadd(delayed_key, {job_id: score})
        logger.info("[worker] job=%s retry %d/%d in %d ms", job_id, new_attempts, max_attempts, delay_ms)

    await pipe.execute()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def _main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stdout,
    )

    configure_otel(service_name="groundedos-worker")

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    postgres_url = os.getenv("POSTGRES_URL", "postgresql://localhost:5432/groundedos")

    logger.info("[worker] GroundedOS worker started")
    logger.info("[worker] REDIS_URL: %s", redis_url)
    logger.info("[worker] POSTGRES_URL: %s", postgres_url)
    logger.info("[worker] bullmq Python package available: %s", _BULLMQ_AVAILABLE)

    queue_enabled = os.getenv("FEATURE_QUEUE_CONSUMER", "true").lower() == "true"
    if not queue_enabled:
        logger.warning("[worker] FEATURE_QUEUE_CONSUMER=false; consumer disabled, worker idling")
        while True:
            await asyncio.sleep(30)

    redis_client = aioredis.from_url(redis_url, decode_responses=True)
    guard = IdempotencyGuard(redis_client)

    if _BULLMQ_AVAILABLE:
        await run_bullmq_consumer(redis_url, guard)
    else:
        await run_polling_consumer(redis_url, guard)

    await redis_client.aclose()


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
