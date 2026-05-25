from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.config import Settings

OTLP_HTTP_TRACES_PATH = "/v1/traces"


def normalize_otlp_traces_endpoint(endpoint: str) -> str:
    stripped = endpoint.strip()
    if stripped.endswith(OTLP_HTTP_TRACES_PATH):
        return stripped
    return f"{stripped.rstrip('/')}{OTLP_HTTP_TRACES_PATH}"


def _configure_otlp_exporter(endpoint: str, service_name: str) -> None:
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "OpenTelemetry export requires opentelemetry SDK/exporter dependencies when "
            "OTEL_EXPORTER_OTLP_ENDPOINT is set."
        ) from exc

    provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint)))
    trace.set_tracer_provider(provider)


def configure_opentelemetry(
    settings: "Settings",
    *,
    configure_exporter: Callable[[str, str], None] = _configure_otlp_exporter,
) -> bool:
    endpoint = (settings.otel_exporter_otlp_endpoint or "").strip()
    if not endpoint:
        return False
    configure_exporter(normalize_otlp_traces_endpoint(endpoint), settings.otel_service_name)
    return True
