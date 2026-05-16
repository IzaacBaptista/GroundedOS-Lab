from __future__ import annotations

from dataclasses import dataclass, field
from math import ceil
from typing import Any


@dataclass
class QueueMetricState:
    queue_name: str
    job_type: str
    jobs_succeeded: int = 0
    jobs_errored: int = 0
    jobs_retrying: int = 0
    jobs_dlq: int = 0
    total_attempts: int = 0
    durations_ms: list[int] = field(default_factory=list)
    last_failure: dict[str, Any] | None = None


class QueueMetricsStore:
    def __init__(self) -> None:
        self._by_key: dict[str, QueueMetricState] = {}

    def record_success(self, queue_name: str, job_type: str, attempts_made: int, duration_ms: int) -> None:
        state = self._ensure(queue_name, job_type)
        state.jobs_succeeded += 1
        state.total_attempts += max(1, attempts_made)
        if duration_ms >= 0:
            state.durations_ms.append(duration_ms)
            if len(state.durations_ms) > 512:
                state.durations_ms.pop(0)

    def record_failure(
        self,
        queue_name: str,
        job_type: str,
        attempts_made: int,
        error: str,
        correlation: dict[str, Any] | None = None,
    ) -> None:
        state = self._ensure(queue_name, job_type)
        state.jobs_errored += 1
        state.total_attempts += max(1, attempts_made)
        state.last_failure = {
            "message": error,
            "correlation": correlation or {},
        }

    def record_retry(self, queue_name: str, job_type: str) -> None:
        state = self._ensure(queue_name, job_type)
        state.jobs_retrying += 1

    def record_dlq(self, queue_name: str, job_type: str) -> None:
        state = self._ensure(queue_name, job_type)
        state.jobs_dlq += 1

    def snapshot(self) -> list[dict[str, Any]]:
        snapshots: list[dict[str, Any]] = []
        for state in self._by_key.values():
            durations = sorted(state.durations_ms)
            average = round(sum(durations) / len(durations), 2) if durations else 0
            p95 = 0
            if durations:
                index = max(0, ceil(0.95 * len(durations)) - 1)
                p95 = float(durations[index])

            snapshots.append(
                {
                    "queueName": state.queue_name,
                    "jobType": state.job_type,
                    "jobsSucceeded": state.jobs_succeeded,
                    "jobsErrored": state.jobs_errored,
                    "jobsRetrying": state.jobs_retrying,
                    "jobsDlq": state.jobs_dlq,
                    "totalAttempts": state.total_attempts,
                    "averageDurationMs": average,
                    "p95DurationMs": p95,
                    "lastFailure": state.last_failure,
                }
            )

        return snapshots

    def _ensure(self, queue_name: str, job_type: str) -> QueueMetricState:
        key = f"{queue_name}:{job_type}"
        if key not in self._by_key:
            self._by_key[key] = QueueMetricState(queue_name=queue_name, job_type=job_type)
        return self._by_key[key]
