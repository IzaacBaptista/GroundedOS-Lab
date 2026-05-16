from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

BackoffType = Literal["fixed", "exponential"]


@dataclass(frozen=True)
class RetryPolicy:
    max_attempts: int
    backoff_type: BackoffType
    backoff_delay_ms: int


DEFAULT_RETRY_POLICIES: dict[str, RetryPolicy] = {
    "phase5-experiment": RetryPolicy(
        max_attempts=5,
        backoff_type="exponential",
        backoff_delay_ms=2000,
    ),
    "model-benchmark": RetryPolicy(
        max_attempts=4,
        backoff_type="fixed",
        backoff_delay_ms=3000,
    ),
}


def resolve_retry_policy(job_type: str) -> RetryPolicy:
    return DEFAULT_RETRY_POLICIES.get(
        job_type,
        RetryPolicy(max_attempts=3, backoff_type="exponential", backoff_delay_ms=1000),
    )


def compute_backoff_delay_ms(policy: RetryPolicy, attempt_number: int) -> int:
    normalized_attempt = max(1, int(attempt_number))
    if policy.backoff_type == "fixed":
        return policy.backoff_delay_ms
    return policy.backoff_delay_ms * (2 ** (normalized_attempt - 1))
