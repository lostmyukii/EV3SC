"""Health status payloads and alert thresholds for WeisileLink.

Sources:
- VSLE spec Section 17.2 defines the `/api/status` response fields.
- VSLE spec Section 17.3 defines minimum metrics and alert thresholds.
"""

import json
from dataclasses import dataclass
from typing import Any, Dict, List

from weisile_link.runtime.degradation import DegradationManager


@dataclass(frozen=True)
class RuntimeCounters:
    """Counters that come from connection/session managers."""

    scratch_clients: int = 0
    trainer_clients: int = 0
    command_timeout_count_60s: int = 0


@dataclass(frozen=True)
class RuntimeMetrics:
    """Runtime measurements included in the status payload."""

    sensor_hz: float = 0.0
    sensor_age_ms: int = 0
    memory_mb: int = 0
    baseline_memory_mb: int = 0


@dataclass(frozen=True)
class HttpResponse:
    """Small framework-neutral HTTP response for health routes."""

    status: int
    headers: Dict[str, str]
    body: str


@dataclass(frozen=True)
class StatusEndpoint:
    """Framework-neutral handler for the `GET /api/status` health route."""

    manager: DegradationManager
    counters: RuntimeCounters
    metrics: RuntimeMetrics

    def handle_get(self, path: str) -> HttpResponse:
        """Return JSON for `/api/status`, or a JSON 404 for other paths."""
        headers = {"content-type": "application/json"}
        if path != "/api/status":
            return HttpResponse(
                status=404,
                headers=headers,
                body=json.dumps(
                    {
                        "ok": False,
                        "error": {
                            "code": "NOT_FOUND",
                            "message": "Route not found",
                        },
                    },
                    separators=(",", ":"),
                ),
            )

        return HttpResponse(
            status=200,
            headers=headers,
            body=json.dumps(
                build_status_payload(self.manager, self.counters, self.metrics),
                separators=(",", ":"),
            ),
        )


def _active_transport(manager: DegradationManager) -> Any:
    transport = manager.connection_state.active_transport
    if transport is None:
        return None
    return manager.connection_state.transport_label or transport.value


def build_alerts(
    manager: DegradationManager,
    counters: RuntimeCounters,
    metrics: RuntimeMetrics,
) -> List[str]:
    """Return machine-readable alerts from Section 17.3 thresholds."""
    alerts: List[str] = []

    if metrics.sensor_hz < 45:
        alerts.append("sensor_hz_below_45")
    if metrics.sensor_age_ms > 200:
        alerts.append("sensor_age_ms_above_200")
    if counters.command_timeout_count_60s > 3:
        alerts.append("command_timeout_count_above_3")
    if manager.connection_state.reconnect_count > 5:
        alerts.append("transport_reconnect_count_above_5")
    if manager.collected_points >= manager.max_collected_points:
        alerts.append("collected_points_at_capacity")

    memory_growth_mb = metrics.memory_mb - metrics.baseline_memory_mb
    if metrics.baseline_memory_mb > 0 and memory_growth_mb > 50:
        alerts.append("memory_growth_above_50mb")

    return alerts


def build_status_payload(
    manager: DegradationManager,
    counters: RuntimeCounters,
    metrics: RuntimeMetrics,
) -> Dict[str, Any]:
    """Build the Section 17.2 `/api/status` JSON payload."""
    ev3_connected = manager.connection_state.connected
    return {
        "ok": ev3_connected,
        "transport": _active_transport(manager),
        "transport_capability": (manager.connection_state.transport_capability),
        "native_adapter_path": manager.connection_state.native_adapter_path,
        "native_adapter_status": (
            manager.connection_state.native_adapter_status
        ),
        "last_unsupported_capability": (
            manager.connection_state.last_unsupported_capability
        ),
        "ev3_connected": ev3_connected,
        "scratch_clients": counters.scratch_clients,
        "trainer_clients": counters.trainer_clients,
        "sensor_hz": metrics.sensor_hz,
        "sensor_age_ms": metrics.sensor_age_ms,
        "collected_points": manager.collected_points,
        "memory_mb": metrics.memory_mb,
        "alerts": build_alerts(manager, counters, metrics),
    }
