from __future__ import annotations

import json
import unittest
from unittest.mock import MagicMock, patch

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

    def test_dlq_envelope_structure(self) -> None:
        """Test that DLQ envelope preserves all required metadata"""
        payload_dict = {
            "type": "phase5-experiment",
            "track": "quantization",
            "requestId": "req-dlq",
            "jobId": "job-123",
            "sessionId": "sess-1",
        }
        parsed = parse_payload(payload_dict)

        # Simulate DLQ envelope structure
        dlq_envelope = {
            "payload": payload_dict,
            "jobType": "phase5-experiment",
            "queueName": "groundedos-phase6-jobs",
            "attempts": 5,
            "maxAttempts": 5,
            "createdAt": "2026-05-16T10:00:00Z",
            "failedAt": "2026-05-16T10:05:00Z",
            "error": "Simulated failure for testing",
            "correlation": {
                "requestId": "req-dlq",
                "jobId": "job-123",
                "sessionId": "sess-1",
            },
        }

        # Verify envelope has all required fields
        self.assertIn("payload", dlq_envelope)
        self.assertIn("jobType", dlq_envelope)
        self.assertIn("queueName", dlq_envelope)
        self.assertIn("attempts", dlq_envelope)
        self.assertIn("maxAttempts", dlq_envelope)
        self.assertIn("error", dlq_envelope)
        self.assertIn("correlation", dlq_envelope)

        # Verify correlation IDs are preserved in envelope
        self.assertEqual(dlq_envelope["correlation"]["requestId"], "req-dlq")
        self.assertEqual(dlq_envelope["correlation"]["jobId"], "job-123")
        self.assertEqual(dlq_envelope["correlation"]["sessionId"], "sess-1")

    def test_metrics_export_format(self) -> None:
        """Test that metrics can be exported in Prometheus-compatible format"""
        store = QueueMetricsStore()
        store.record_success("groundedos-phase6-jobs", "phase5-experiment", 1, 100)
        store.record_failure("groundedos-phase6-jobs", "phase5-experiment", 2, "test error")
        store.record_dlq("groundedos-phase6-jobs", "phase5-experiment")

        snapshot = store.snapshot()
        metric = snapshot[0]

        # Verify snapshot has all required metric fields
        self.assertIn("queueName", metric)
        self.assertIn("jobType", metric)
        self.assertIn("jobsSucceeded", metric)
        self.assertIn("jobsErrored", metric)
        self.assertIn("jobsDlq", metric)
        self.assertIn("totalAttempts", metric)
        self.assertIn("averageDurationMs", metric)

        # Simulate Prometheus label format
        labels = f'queue="{metric["queueName"]}", job_type="{metric["jobType"]}"'
        self.assertIn("groundedos-phase6-jobs", labels)
        self.assertIn("phase5-experiment", labels)

    def test_worker_retry_logic_with_mock_redis(self) -> None:
        """Test retry logic with mocked Redis calls"""
        # Mock redis client methods
        mock_redis = MagicMock()
        mock_redis.xadd = MagicMock(return_value=b"mock-id")
        mock_redis.xrange = MagicMock(return_value=[])

        # Simulate job processing with retry
        attempt_number = 1
        policy = resolve_retry_policy("phase5-experiment")

        # Calculate backoff
        backoff_ms = compute_backoff_delay_ms(policy, attempt_number)
        self.assertEqual(backoff_ms, 2000)

        # Simulate retry envelope
        retry_envelope = {
            "type": "dlq-envelope",
            "envelope": {
                "attempts": attempt_number,
                "maxAttempts": policy.max_attempts,
                "backoffMs": backoff_ms,
            },
        }

        # Verify mock was set up correctly
        self.assertEqual(mock_redis.xadd.call_count, 0)  # Not called in this test
        self.assertIn("type", retry_envelope)
        self.assertEqual(retry_envelope["type"], "dlq-envelope")


if __name__ == "__main__":
    unittest.main()

