from __future__ import annotations

import unittest

from job_types import parse_payload
from queue_metrics import QueueMetricsStore
from retry_policy import compute_backoff_delay_ms, resolve_retry_policy


class QueueHardeningTests(unittest.TestCase):
    def test_retry_policy_per_job_type(self) -> None:
        phase5 = resolve_retry_policy("phase5-experiment")
        benchmark = resolve_retry_policy("model-benchmark")

        self.assertEqual(phase5.max_attempts, 5)
        self.assertEqual(phase5.backoff_type, "exponential")
        self.assertEqual(benchmark.max_attempts, 4)
        self.assertEqual(benchmark.backoff_type, "fixed")

    def test_backoff_fixed_and_exponential(self) -> None:
        fixed = resolve_retry_policy("model-benchmark")
        exponential = resolve_retry_policy("phase5-experiment")

        self.assertEqual(compute_backoff_delay_ms(fixed, 1), 3000)
        self.assertEqual(compute_backoff_delay_ms(fixed, 3), 3000)

        self.assertEqual(compute_backoff_delay_ms(exponential, 1), 2000)
        self.assertEqual(compute_backoff_delay_ms(exponential, 2), 4000)
        self.assertEqual(compute_backoff_delay_ms(exponential, 3), 8000)

    def test_correlation_ids_are_preserved(self) -> None:
        payload = parse_payload(
            {
                "type": "phase5-experiment",
                "track": "quantization",
                "requestId": "req-1",
                "sessionId": "sess-1",
                "tenantId": "tenant-1",
                "userId": "user-1",
                "indexId": "idx-1",
            }
        )

        self.assertEqual(payload.requestId, "req-1")
        self.assertEqual(payload.sessionId, "sess-1")
        self.assertEqual(payload.tenantId, "tenant-1")
        self.assertEqual(payload.userId, "user-1")
        self.assertEqual(payload.indexId, "idx-1")

    def test_metrics_are_updated(self) -> None:
        store = QueueMetricsStore()
        store.record_success("groundedos-phase6-jobs", "phase5-experiment", 1, 120)
        store.record_failure(
            "groundedos-phase6-jobs",
            "phase5-experiment",
            2,
            "simulated",
            {"requestId": "req-2"},
        )
        store.record_retry("groundedos-phase6-jobs", "phase5-experiment")
        store.record_dlq("groundedos-phase6-jobs", "phase5-experiment")

        snapshot = store.snapshot()
        self.assertEqual(len(snapshot), 1)
        metric = snapshot[0]
        self.assertEqual(metric["jobsSucceeded"], 1)
        self.assertEqual(metric["jobsErrored"], 1)
        self.assertEqual(metric["jobsRetrying"], 1)
        self.assertEqual(metric["jobsDlq"], 1)
        self.assertEqual(metric["totalAttempts"], 3)
        self.assertEqual(metric["lastFailure"]["message"], "simulated")


if __name__ == "__main__":
    unittest.main()
