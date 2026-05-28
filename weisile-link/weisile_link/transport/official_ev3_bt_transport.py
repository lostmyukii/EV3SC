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

import asyncio
import inspect
import time
from typing import Any, Awaitable, Callable, Dict, List, Optional

from weisile_link.protocol.errors import ErrorCode
from weisile_link.protocol.official_ev3_direct_command import (
    build_motor_stop,
    build_poll_device_list,
    build_sensor_motor_poll,
    decode_float_globals,
    decode_int32_globals,
    parse_direct_reply_payload,
)
from weisile_link.protocol.validation import (
    ValidatedCommand,
    validate_ev3_command,
)
from weisile_link.runtime.degradation import (
    DegradationManager,
    SensorSnapshot,
    TransportKind,
)
from weisile_link.transport.native_byte_stream import NativeByteStreamAdapter

SensorCallback = Callable[[Dict[str, Any]], Optional[Awaitable[None]]]

_SENSOR_PORTS = ("S1", "S2", "S3", "S4")
_MOTOR_PORTS = ("A", "B", "C", "D")
_DEVICE_TYPES = {
    0: "none",
    7: "largeMotor",
    8: "mediumMotor",
    16: "touch",
    29: "color",
    30: "ultrasonic",
    32: "gyro",
    125: "none",
    126: "none",
}
_SCRATCH_SENSOR_MODES = {
    "touch": 0,
    "color": 1,
    "ultrasonic": 1,
}
_SENSOR_CACHE_STALE_MS = 500


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
        adapter: Optional[NativeByteStreamAdapter] = None,
        manager: Optional[DegradationManager] = None,
        auto_poll: bool = True,
        poll_interval_s: float = 0.125,
        monotonic_ms: Optional[Callable[[], float]] = None,
    ) -> None:
        self.ev3_address = ev3_address
        self.adapter = adapter
        self.manager = manager or DegradationManager()
        self.manager.sensor_stale_after_ms = max(
            self.manager.sensor_stale_after_ms,
            _SENSOR_CACHE_STALE_MS,
        )
        self.auto_poll = auto_poll
        self.poll_interval_s = poll_interval_s
        self._monotonic_ms_provider = monotonic_ms
        self._connected = False
        self._sensor_callback: Optional[SensorCallback] = None
        self._next_command_id = 0
        self._message_counter = 0
        self._polling_counter = 0
        self._devices_known = False
        self._sensor_ports: List[str] = ["none", "none", "none", "none"]
        self._motor_ports: List[str] = ["none", "none", "none", "none"]
        self._poll_task: Optional[asyncio.Task[None]] = None

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
        if self.auto_poll:
            self._poll_task = asyncio.create_task(self._poll_loop())
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
        await self._stop_polling()

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

    async def poll_once(self) -> Optional[Dict[str, Any]]:
        """Poll one official-firmware Direct Reply cycle into SensorCache."""
        if self.adapter is None or not self.connected:
            return None

        if self._polling_counter % 20 == 0 or not self._devices_known:
            counter = self._next_message_counter()
            await self.adapter.send(
                build_poll_device_list(message_counter=counter)
            )
            payload = parse_direct_reply_payload(
                await self.adapter.recv(),
                expected_counter=counter,
            )
            self._apply_device_list(payload)
            self._polling_counter += 1
            return None

        counter = self._next_message_counter()
        await self.adapter.send(
            build_sensor_motor_poll(
                self._sensor_modes(),
                message_counter=counter,
            )
        )
        payload = parse_direct_reply_payload(
            await self.adapter.recv(),
            expected_counter=counter,
        )
        update = self._decode_sensor_motor_payload(payload)
        self._record_sensor_payload(update)
        await self._emit_sensor_payload(update)
        self._polling_counter += 1
        return update

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

    async def _poll_loop(self) -> None:
        while self._connected:
            try:
                await self.poll_once()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.manager.record_transport_failure(
                    TransportKind.BLUETOOTH,
                    str(exc) or type(exc).__name__,
                )
                self._connected = False
                break
            await asyncio.sleep(self.poll_interval_s)

    async def _stop_polling(self) -> None:
        if self._poll_task is None:
            return
        task = self._poll_task
        self._poll_task = None
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            return

    def _apply_device_list(self, payload: bytes) -> None:
        if len(payload) < 33:
            raise ValueError("EV3 device list reply is too short")

        self._sensor_ports = [
            _DEVICE_TYPES.get(payload[index], "none") for index in range(4)
        ]
        self._motor_ports = [
            _DEVICE_TYPES.get(payload[index + 16], "none") for index in range(4)
        ]
        self._devices_known = True

    def _sensor_modes(self) -> List[Optional[int]]:
        return [
            _SCRATCH_SENSOR_MODES.get(sensor_type)
            for sensor_type in self._sensor_ports
        ]

    def _decode_sensor_motor_payload(
        self,
        payload: bytes,
    ) -> Dict[str, Any]:
        if len(payload) < 32:
            raise ValueError("EV3 sensor/motor reply is too short")

        sensor_values = decode_float_globals(payload[:16])
        motor_values = decode_int32_globals(payload[16:32])
        sensors: Dict[str, Dict[str, Any]] = {}
        motors: Dict[str, Dict[str, Any]] = {}

        for index, sensor_type in enumerate(self._sensor_ports):
            sensor_payload = self._sensor_payload(
                _SENSOR_PORTS[index],
                sensor_type,
                sensor_values[index],
            )
            if sensor_payload is not None:
                sensors[_SENSOR_PORTS[index]] = sensor_payload

        for index, motor_type in enumerate(self._motor_ports):
            if motor_type not in {"largeMotor", "mediumMotor"}:
                continue
            motors[_MOTOR_PORTS[index]] = {
                "type": motor_type,
                "position": motor_values[index],
            }

        return {
            "type": "sensor_update",
            "timestamp": time.time(),
            "sensors": sensors,
            "motors": motors,
            "system": {},
        }

    def _sensor_payload(
        self,
        port: str,
        sensor_type: str,
        value: float,
    ) -> Optional[Dict[str, Any]]:
        if sensor_type == "touch":
            return {"type": sensor_type, "pressed": bool(value)}
        if sensor_type == "color":
            brightness = _round_sensor(value)
            return {
                "type": sensor_type,
                "ambient": brightness,
                "brightness": brightness,
            }
        if sensor_type == "ultrasonic":
            distance_inch = _round_sensor(value)
            return {
                "type": sensor_type,
                "distance_inch": distance_inch,
                "distance_cm": _round_sensor(distance_inch * 2.54),
            }
        if sensor_type != "none":
            return {"type": sensor_type, "unsupported": True, "port": port}
        return None

    async def _emit_sensor_payload(self, payload: Dict[str, Any]) -> None:
        if self._sensor_callback is None:
            return
        result = self._sensor_callback(payload)
        if inspect.isawaitable(result):
            await result

    def _record_sensor_payload(self, payload: Dict[str, Any]) -> None:
        received_at_ms = self._monotonic_ms()
        for root in ("sensors", "motors", "system"):
            values = payload.get(root)
            if isinstance(values, dict):
                self._record_nested(root, values, received_at_ms)

    def _record_nested(
        self,
        prefix: str,
        values: Dict[str, Any],
        received_at_ms: float,
    ) -> None:
        for key, value in values.items():
            path = f"{prefix}.{key}"
            if isinstance(value, dict):
                self._record_nested(path, value, received_at_ms)
            else:
                self.manager.record_sensor_snapshot(
                    path,
                    SensorSnapshot(value=value, received_at_ms=received_at_ms),
                )

    def _monotonic_ms(self) -> float:
        if self._monotonic_ms_provider is not None:
            return self._monotonic_ms_provider()
        return time.monotonic() * 1000


def _port_to_mask(port: str) -> int:
    masks = {"A": 0x01, "B": 0x02, "C": 0x04, "D": 0x08}
    return masks[port]


def _round_sensor(value: float) -> float:
    return round(float(value), 2)
