"""
Idempotency guard for the GroundedOS worker.

Stores completed job IDs in a Redis Set with a configurable TTL so that
duplicate deliveries after a worker crash do not re-run side effects.
"""
from __future__ import annotations

import redis.asyncio as aioredis

IDEMPOTENCY_KEY = "groundedos:worker:completed_jobs"
# Keep completed job IDs for 24 hours to cover any retry window.
IDEMPOTENCY_TTL_SECONDS = 86_400


class IdempotencyGuard:
    def __init__(self, redis_client: aioredis.Redis) -> None:
        self._redis = redis_client

    async def is_already_processed(self, job_id: str) -> bool:
        """Return True if this job_id was already marked as done."""
        return bool(await self._redis.sismember(IDEMPOTENCY_KEY, job_id))

    async def mark_processed(self, job_id: str) -> None:
        """Record job_id as successfully processed."""
        pipe = self._redis.pipeline()
        pipe.sadd(IDEMPOTENCY_KEY, job_id)
        pipe.expire(IDEMPOTENCY_KEY, IDEMPOTENCY_TTL_SECONDS)
        await pipe.execute()
