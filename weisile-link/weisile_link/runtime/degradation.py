"""Connection degradation state for WeisileLink.

Sources:
- VSLE spec Section 16.2 defines transport, Trainer, sensor-stale, and
  validation degradation rules.
- VSLE spec Section 16.3 defines reconnect behavior.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from weisile_link.protocol.error_mapping import protocol_error_to_json_rpc
from weisile_link.protocol.errors import ErrorCode, ProtocolError
from weisile_link.protocol.json_rpc import JsonRpcId


class TransportKind(str, Enum):
    """Transport names used by the WeisileLink runtime."""

    WIFI = "wifi"
    BLUETOOTH = "bluetooth"


@dataclass
class ConnectionState:
    """Current EV3 transport state and failure flags."""

    connected: bool = False
    active_transport: Optional[TransportKind] = None
    wifi_failed: bool = False
    bluetooth_failed: bool = False
    reconnect_count: int = 0
    last_failure_reason: Optional[str] = None
    sensor_cache_refresh_required: bool = False


@dataclass(frozen=True)
class SensorSnapshot:
    """A sensor value received from EV3 at a monotonic millisecond timestamp."""

    value: Any
    received_at_ms: float


@dataclass(frozen=True)
class SensorReadResult:
    """Safe sensor read result for Scratch reporter blocks."""

    value: Any
    stale: bool
    error_code: Optional[ErrorCode] = None


@dataclass
class DegradationManager:
    """Apply Section 16 degradation rules without performing transport I/O."""

    bluetooth_supported: bool = False
    max_collected_points: int = 10_000
    sensor_stale_after_ms: int = 200
    connection_state: ConnectionState = field(default_factory=ConnectionState)
    trainer_available: bool = True
    collected_points: int = 0
    _pending_command_ids: List[str] = field(default_factory=list)
    _sensor_cache: Dict[str, SensorSnapshot] = field(default_factory=dict)

    @property
    def pending_command_ids(self) -> Tuple[str, ...]:
        """Return pending command IDs as an immutable snapshot."""
        return tuple(self._pending_command_ids)

    def choose_next_transport(self) -> Optional[TransportKind]:
        """Choose WiFi first, then Bluetooth only when stdlib RFCOMM exists."""
        if not self.connection_state.wifi_failed:
            return TransportKind.WIFI

        if (
            self.bluetooth_supported
            and not self.connection_state.bluetooth_failed
        ):
            return TransportKind.BLUETOOTH

        self.connection_state.connected = False
        self.connection_state.active_transport = None
        return None

    def record_transport_failure(
        self,
        transport: TransportKind,
        reason: str,
    ) -> None:
        """Mark a transport failed and degrade command execution."""
        if transport == TransportKind.WIFI:
            self.connection_state.wifi_failed = True
        elif transport == TransportKind.BLUETOOTH:
            self.connection_state.bluetooth_failed = True

        self.connection_state.connected = False
        self.connection_state.active_transport = None
        self.connection_state.last_failure_reason = reason

    def record_reconnected(self, transport: TransportKind) -> Tuple[str, ...]:
        """Record a successful reconnect and clear pending command futures."""
        cleared = tuple(self._pending_command_ids)
        self._pending_command_ids.clear()
        self.connection_state.connected = True
        self.connection_state.active_transport = transport
        self.connection_state.reconnect_count += 1
        self.connection_state.last_failure_reason = None
        self.connection_state.sensor_cache_refresh_required = True

        if transport == TransportKind.WIFI:
            self.connection_state.wifi_failed = False
        elif transport == TransportKind.BLUETOOTH:
            self.connection_state.bluetooth_failed = False

        return cleared

    def mark_command_pending(self, command_id: str) -> None:
        """Track a command future that must be cleared on reconnect."""
        if command_id not in self._pending_command_ids:
            self._pending_command_ids.append(command_id)

    def clear_command_pending(self, command_id: str) -> None:
        """Remove a command future after ack, timeout, or disconnect."""
        try:
            self._pending_command_ids.remove(command_id)
        except ValueError:
            return

    def record_collected_points(self, count: int) -> None:
        """Preserve bounded local data collection count across reconnects."""
        self.collected_points = max(0, min(count, self.max_collected_points))

    def record_trainer_unavailable(self, reason: str) -> None:
        """Mark Trainer unavailable while keeping robot control independent."""
        self.trainer_available = False
        self.connection_state.last_failure_reason = reason

    def record_sensor_snapshot(
        self,
        path: str,
        snapshot: SensorSnapshot,
    ) -> None:
        """Store the latest sensor value from EV3."""
        self._sensor_cache[path] = snapshot
        self.connection_state.sensor_cache_refresh_required = False

    def get_sensor_value(
        self,
        path: str,
        now_ms: float,
        default: Any,
    ) -> SensorReadResult:
        """Return last safe sensor value and flag staleness after 200ms."""
        snapshot = self._sensor_cache.get(path)
        if snapshot is None:
            return SensorReadResult(default, False)

        age_ms = now_ms - snapshot.received_at_ms
        if age_ms > self.sensor_stale_after_ms:
            self.connection_state.connected = False
            return SensorReadResult(
                snapshot.value,
                True,
                ErrorCode.EV3_SENSOR_STALE,
            )

        return SensorReadResult(snapshot.value, False)

    def command_error_response(
        self,
        request_id: JsonRpcId,
        method: str,
    ) -> Dict[str, Any]:
        """Return the JSON-RPC error Scratch sees with no active transport."""
        error = ProtocolError(
            ErrorCode.EV3_TRANSPORT_DISCONNECTED,
            "No active BT/WiFi transport",
            {
                "method": method,
                "wifi_failed": self.connection_state.wifi_failed,
                "bluetooth_failed": self.connection_state.bluetooth_failed,
            },
        )
        return protocol_error_to_json_rpc(request_id, error)

    def trainer_error_response(self, request_id: JsonRpcId) -> Dict[str, Any]:
        """Return a Trainer error without degrading robot transport state."""
        error = ProtocolError(
            ErrorCode.TRAINER_UNAVAILABLE,
            "WeisileAI Trainer subscription/upload unavailable",
        )
        return protocol_error_to_json_rpc(request_id, error)

    def data_buffer_error_response(
        self, request_id: JsonRpcId
    ) -> Dict[str, Any]:
        """Return DATA_BUFFER_FULL when bounded collection capacity is reached."""
        error = ProtocolError(
            ErrorCode.DATA_BUFFER_FULL,
            "Collection buffer reached configured cap",
            {
                "collected_points": self.collected_points,
                "max_collected_points": self.max_collected_points,
            },
        )
        return protocol_error_to_json_rpc(request_id, error)
