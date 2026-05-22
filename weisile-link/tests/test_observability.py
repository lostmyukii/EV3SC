import json

from weisile_link.observability.health import (
    RuntimeCounters,
    RuntimeMetrics,
    StatusEndpoint,
    build_status_payload,
)
from weisile_link.observability.logging import (
    StructuredLogger,
    sanitize_log_data,
)
from weisile_link.runtime.degradation import DegradationManager, TransportKind


def test_status_payload_matches_section_17_shape_when_connected():
    manager = DegradationManager()
    manager.record_reconnected(TransportKind.WIFI)
    manager.record_collected_points(240)
    counters = RuntimeCounters(scratch_clients=1, trainer_clients=1)
    metrics = RuntimeMetrics(sensor_hz=49.8, sensor_age_ms=12, memory_mb=82)

    payload = build_status_payload(manager, counters, metrics)

    assert payload == {
        "ok": True,
        "transport": "wifi",
        "ev3_connected": True,
        "scratch_clients": 1,
        "trainer_clients": 1,
        "sensor_hz": 49.8,
        "sensor_age_ms": 12,
        "collected_points": 240,
        "memory_mb": 82,
        "alerts": [],
    }


def test_status_payload_reports_disconnected_transport_and_alerts():
    manager = DegradationManager(max_collected_points=100)
    manager.record_transport_failure(TransportKind.WIFI, "wifi down")
    manager.record_collected_points(100)
    counters = RuntimeCounters(command_timeout_count_60s=4)
    metrics = RuntimeMetrics(
        sensor_hz=44.9,
        sensor_age_ms=250,
        memory_mb=142,
        baseline_memory_mb=80,
    )

    payload = build_status_payload(manager, counters, metrics)

    assert payload["ok"] is False
    assert payload["transport"] is None
    assert payload["ev3_connected"] is False
    assert payload["alerts"] == [
        "sensor_hz_below_45",
        "sensor_age_ms_above_200",
        "command_timeout_count_above_3",
        "collected_points_at_capacity",
        "memory_growth_above_50mb",
    ]


def test_status_payload_reports_reconnect_alert_threshold():
    manager = DegradationManager()
    manager.connection_state.reconnect_count = 6

    payload = build_status_payload(
        manager,
        RuntimeCounters(),
        RuntimeMetrics(sensor_hz=50, sensor_age_ms=10, memory_mb=80),
    )

    assert "transport_reconnect_count_above_5" in payload["alerts"]


def test_status_endpoint_handles_api_status_get_request():
    manager = DegradationManager()
    manager.record_reconnected(TransportKind.WIFI)
    endpoint = StatusEndpoint(
        manager=manager,
        counters=RuntimeCounters(scratch_clients=2),
        metrics=RuntimeMetrics(sensor_hz=50, sensor_age_ms=8, memory_mb=81),
    )

    response = endpoint.handle_get("/api/status")

    assert response.status == 200
    assert response.headers == {"content-type": "application/json"}
    assert json.loads(response.body) == {
        "ok": True,
        "transport": "wifi",
        "ev3_connected": True,
        "scratch_clients": 2,
        "trainer_clients": 0,
        "sensor_hz": 50,
        "sensor_age_ms": 8,
        "collected_points": 0,
        "memory_mb": 81,
        "alerts": [],
    }


def test_status_endpoint_returns_404_for_unknown_get_path():
    endpoint = StatusEndpoint(
        manager=DegradationManager(),
        counters=RuntimeCounters(),
        metrics=RuntimeMetrics(),
    )

    response = endpoint.handle_get("/not-found")

    assert response.status == 404
    assert response.headers == {"content-type": "application/json"}
    assert json.loads(response.body) == {
        "ok": False,
        "error": {"code": "NOT_FOUND", "message": "Route not found"},
    }


def test_sanitize_log_data_redacts_tokens_and_truncates_long_labels():
    clean = sanitize_log_data(
        {
            "pairing_token": "secret-token",
            "WEISILE_PAIRING_TOKEN": "secret-token",
            "label": "x" * 80,
            "nested": {"auth_token": "nested-secret", "label": "分类" * 40},
        }
    )

    assert clean["pairing_token"] == "[REDACTED]"
    assert clean["WEISILE_PAIRING_TOKEN"] == "[REDACTED]"
    assert clean["label"] == "x" * 64
    assert clean["nested"]["auth_token"] == "[REDACTED]"
    assert clean["nested"]["label"] == "分类" * 32


def test_structured_logger_writes_token_safe_json_line():
    lines = []
    logger = StructuredLogger(
        service="weisile-link",
        writer=lines.append,
        clock=lambda: "2026-05-22T12:00:00.000Z",
    )

    logger.info(
        "transport_connected",
        transport="wifi",
        ev3_ip="192.168.1.100",
        pairing_token="secret",
        label="y" * 70,
    )

    assert len(lines) == 1
    event = json.loads(lines[0])
    assert event == {
        "ts": "2026-05-22T12:00:00.000Z",
        "level": "INFO",
        "service": "weisile-link",
        "event": "transport_connected",
        "transport": "wifi",
        "ev3_ip": "192.168.1.100",
        "pairing_token": "[REDACTED]",
        "label": "y" * 64,
    }
