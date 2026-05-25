class MetricsSettingsMixin:
    metrics_enabled: bool = False
    otel_exporter_otlp_endpoint: str | None = None
    otel_service_name: str = "riskhub-api"
