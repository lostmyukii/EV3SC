"""Official EV3 firmware Bluetooth compatibility transport shell.

Sources:
- LEGO MINDSTORMS EV3 Communication Developer Kit defines the Direct Command
  byte stream consumed by official EV3 firmware.
- EV3SC official EV3 Direct Command encoder owns the source-backed byte
  layouts used by this transport.
- VSLE spec Section 16.2 requires macOS/Windows official-firmware Bluetooth
  compatibility to use a native adapter boundary, not Python stdlib RFCOMM.
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Dict, Optional, Protocol

from weisile_link.protocol.errors import ErrorCode
from weisile_link.protocol.official_ev3_direct_command import build_motor_stop
from weisile_link.protocol.validation import (
    ValidatedCommand,
    validate_ev3_command,
)
from weisile_link.runtime.degradation import DegradationManager, TransportKind

SensorCallback = Callable[[Dict[str, Any]], Optional[Awaitable[None]]]


class NativeBluetoothAdapterProtocol(Protocol):
    """Native macOS/Windows adapter boundary for official EV3 firmware."""

    async def connect(self, address: str) -> None:
        """Open an OS-native Bluetooth Classic connection to the EV3."""

    async def send(self, payload: bytes) -> None:
        """Write one EV3 Direct Command frame to the native connection."""

    async def recv(self) -> bytes:
        """Read one raw EV3 reply frame from the native connection."""

    async def close(self) -> None:
        """Close the native connection."""


class OfficialEV3BluetoothTransport:
    """Direct Command bridge for official-firmware EV3 Bluetooth mode.

    This class is intentionally inert without a project-owned native adapter.
    It gives the desktop app a tested boundary while keeping macOS/Windows
    Bluetooth support explicitly unsupported until adapter and hardware gates
    are satisfied.
    """

    transport_kind = "official-bluetooth"
    active_transport_name = "official-bluetooth"

    def __init__(
        self,
        ev3_address: str,
        *,
        adapter: Optional[NativeBluetoothAdapterProtocol] = None,
        manager: Optional[DegradationManager] = None,
    ) -> None:
        self.ev3_address = ev3_address
        self.adapter = adapter
        self.manager = manager or DegradationManager()
        self._connected = False
        self._sensor_callback: Optional[SensorCallback] = None
        self._next_command_id = 0
        self._message_counter = 0

    @property
    def supported(self) -> bool:
        """Whether a verified native Bluetooth adapter was provided."""
        return self.adapter is not None

    @property
    def connected(self) -> bool:
        """Whether the injected native adapter currently has a session."""
        return self._connected and self.manager.connection_state.connected

    def configure_endpoint(
        self,
        *,
        ev3_official_bt: Optional[str] = None,
        ev3_bt: Optional[str] = None,
        ev3_address: Optional[str] = None,
        address: Optional[str] = None,
        **_: Any,
    ) -> Dict[str, Any]:
        """Update the official-firmware Bluetooth endpoint."""
        next_address = ev3_official_bt or ev3_bt or ev3_address or address
        if next_address:
            self.ev3_address = str(next_address).strip()
        return {"ev3_official_bt": self.ev3_address}

    async def connect(self, on_sensor_data: SensorCallback) -> bool:
        """Connect only when a native adapter was injected."""
        self._sensor_callback = on_sensor_data
        self.manager.bluetooth_supported = self.supported
        if self.adapter is None:
            self.manager.record_transport_failure(
                TransportKind.BLUETOOTH,
                "official firmware native Bluetooth adapter is not installed",
            )
            return False

        try:
            await self.adapter.connect(self.ev3_address)
        except Exception as exc:
            self.manager.record_transport_failure(
                TransportKind.BLUETOOTH,
                str(exc) or type(exc).__name__,
            )
            self._connected = False
            return False

        self._connected = True
        self.manager.record_reconnected(TransportKind.BLUETOOTH)
        return True

    async def send_command(self, command: Dict[str, Any]) -> Dict[str, Any]:
        """Validate, encode supported Direct Commands, and send via adapter."""
        if self.adapter is None or not self.connected:
            raise ConnectionError(
                "Official EV3 Bluetooth transport is disconnected"
            )

        method = str(command.get("method", ""))
        params = command.get("params", {})
        validated = validate_ev3_command(method, params)
        command_id = self._command_id(command.get("id"))
        payload = self._build_payload(validated)
        if payload is None:
            return {
                "type": "ack",
                "id": command_id,
                "ok": False,
                "code": ErrorCode.EV3_INVALID_COMMAND.value,
                "error": (
                    "Official EV3 firmware Bluetooth compatibility has not "
                    "mapped this VSLE command"
                ),
                "method": validated.method,
            }

        self.manager.mark_command_pending(str(command_id))
        try:
            await self.adapter.send(payload)
        except Exception as exc:
            self.manager.record_transport_failure(
                TransportKind.BLUETOOTH,
                str(exc) or type(exc).__name__,
            )
            self._connected = False
            raise ConnectionError(
                "Official EV3 Bluetooth Direct Command send failed"
            ) from exc
        finally:
            self.manager.clear_command_pending(str(command_id))

        return {"type": "ack", "id": command_id, "ok": True}

    async def disconnect(self) -> None:
        """Send safest available stop and close the native adapter."""
        if self.adapter is not None and self._connected:
            try:
                await self.adapter.send(self._safe_stop_payload())
            except Exception:
                pass

        self._connected = False
        self.manager.connection_state.connected = False
        self.manager.connection_state.active_transport = None

        if self.adapter is not None:
            await self.adapter.close()

    def _build_payload(self, validated: ValidatedCommand) -> Optional[bytes]:
        if validated.method == "motor.stop":
            return build_motor_stop(
                port_mask=_port_to_mask(validated.params["port"]),
                brake=True,
                message_counter=self._next_message_counter(),
            )
        if validated.method in {"motor.stopAll", "system.stopAll"}:
            return self._safe_stop_payload()
        return None

    def _safe_stop_payload(self) -> bytes:
        return build_motor_stop(
            port_mask=0x0F,
            brake=True,
            message_counter=self._next_message_counter(),
        )

    def _command_id(self, proposed: Any) -> Any:
        if proposed not in (None, ""):
            return proposed
        self._next_command_id += 1
        return self._next_command_id

    def _next_message_counter(self) -> int:
        counter = self._message_counter
        self._message_counter = (self._message_counter + 1) & 0xFFFF
        return counter


def _port_to_mask(port: str) -> int:
    masks = {"A": 0x01, "B": 0x02, "C": 0x04, "D": 0x08}
    return masks[port]
