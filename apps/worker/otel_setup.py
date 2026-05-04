"""
OpenTelemetry bootstrap for the GroundedOS worker.

Controlled by the OTEL_EXPORT_ENABLED environment variable (default: false).
When export is disabled the SDK still runs in no-op mode so that trace/span
IDs are available for structured log correlation.
"""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_OTEL_AVAILABLE = False

try:
    from opentelemetry import trace
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
    from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

    _OTEL_AVAILABLE = True
except ImportError:
    pass


def configure_otel(service_name: str = "groundedos-worker") -> None:
    """Initialise the OTel SDK.  Safe to call more than once (idempotent)."""
    if not _OTEL_AVAILABLE:
        logger.debug("[otel] opentelemetry packages not installed; skipping setup")
        return

    export_enabled = os.getenv("OTEL_EXPORT_ENABLED", "false").lower() == "true"
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()

    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)

    if export_enabled and endpoint:
        try:
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
                OTLPSpanExporter,
            )

            otlp_exporter = OTLPSpanExporter(endpoint=endpoint)
            provider.add_span_processor(BatchSpanProcessor(otlp_exporter))
            logger.info("[otel] OTLP trace exporter configured → %s", endpoint)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[otel] Failed to configure OTLP exporter: %s", exc)
            provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
    else:
        if export_enabled:
            logger.warning(
                "[otel] OTEL_EXPORT_ENABLED=true but OTEL_EXPORTER_OTLP_ENDPOINT is not set; "
                "falling back to console exporter"
            )
            provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))

    trace.set_tracer_provider(provider)
    logger.info("[otel] tracer provider configured (export_enabled=%s)", export_enabled)


def extract_context_from_job(job_data: dict) -> object | None:
    """Extract and restore an OTel span context from a BullMQ job payload.

    The API encodes the active traceparent as ``_otel_context`` in the job data.
    Returns the restored Context object, or None if OTel is unavailable or the
    field is missing.
    """
    if not _OTEL_AVAILABLE:
        return None

    raw_ctx = job_data.get("_otel_context")
    if not raw_ctx:
        return None

    from opentelemetry import context
    from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

    carrier = {"traceparent": raw_ctx}
    return TraceContextTextMapPropagator().extract(carrier)


def get_tracer(name: str = "groundedos.worker"):
    """Return an OTel tracer, or a no-op stub if the SDK is not installed."""
    if not _OTEL_AVAILABLE:
        return _NoOpTracer()

    from opentelemetry import trace

    return trace.get_tracer(name)


class _NoOpSpan:
    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def set_attribute(self, *_):
        pass

    def record_exception(self, *_):
        pass

    def set_status(self, *_):
        pass


class _NoOpTracer:
    def start_as_current_span(self, name: str, **_kwargs):
        return _NoOpSpan()
