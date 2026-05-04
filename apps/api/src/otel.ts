/**
 * OpenTelemetry bootstrap for the GroundedOS API.
 *
 * Call `configureOtel()` once at startup before any other imports so that
 * auto-instrumentation patches run before the modules they instrument are
 * loaded.
 *
 * Controlled by environment variables:
 *   OTEL_EXPORT_ENABLED        — "true" activates the OTLP exporter (default: false)
 *   OTEL_EXPORTER_OTLP_ENDPOINT — gRPC/HTTP endpoint for the collector
 *   OTEL_SERVICE_NAME           — service name reported in spans (default: "groundedos-api")
 *
 * The SDK always initialises so that trace/span IDs are available in logs
 * even when export is disabled.
 */

let _configured = false;

export function configureOtel(): void {
  if (_configured) return;
  _configured = true;

  const exportEnabled = process.env.OTEL_EXPORT_ENABLED?.toLowerCase() === "true";
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() ?? "";
  const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || "groundedos-api";

  try {
    // Dynamic require so the module tree stays intact when the SDK is absent.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NodeSDK } = require("@opentelemetry/sdk-node");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Resource } = require("@opentelemetry/resources");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SEMRESATTRS_SERVICE_NAME } = require("@opentelemetry/semantic-conventions");

    let traceExporter: unknown = undefined;

    if (exportEnabled && endpoint) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
      traceExporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });
    }

    const sdk = new NodeSDK({
      resource: new Resource({ [SEMRESATTRS_SERVICE_NAME]: serviceName }),
      ...(traceExporter ? { traceExporter } : {}),
    });

    sdk.start();

    process.once("SIGTERM", () => {
      sdk.shutdown().catch((err: unknown) => {
        console.error("[otel] SDK shutdown error:", err);
      });
    });

    console.log(
      `[otel] SDK started (service=${serviceName} export=${exportEnabled && !!endpoint})`,
    );
  } catch {
    // OTel packages not installed — SDK runs in no-op mode automatically.
    console.debug("[otel] @opentelemetry packages not installed; tracing disabled");
  }
}

/**
 * Serialize the currently active OTel span context as a W3C traceparent string.
 *
 * Returns `undefined` when no span is active or the SDK is not installed.
 * The result is safe to embed in a BullMQ job payload as `_otel_context`.
 */
export function getActiveTraceparent(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require("@opentelemetry/api");
    const span = api.trace.getActiveSpan();
    if (!span) return undefined;

    const ctx = span.spanContext();
    if (!api.trace.isSpanContextValid(ctx)) return undefined;

    const flags = ctx.traceFlags.toString(16).padStart(2, "0");
    return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
  } catch {
    return undefined;
  }
}
