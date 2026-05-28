"""Full VSLE Bluetooth Classic RFCOMM transport for WeisileLink.

Sources:
- VSLE spec Section 5.5 defines stdlib RFCOMM transport, no pybluez.
- VSLE spec Section 16 defines disconnect and fallback degradation.
- Python socket documentation defines AF_BLUETOOTH/BTPROTO_RFCOMM.
- EV3SC `vsle_ev3_server.py` defines the JSON ack and sensor payloads reused
  over the RFCOMM byte stream.
- EV3SC `native_byte_stream.py` defines the macOS/Windows native adapter
  boundary used when stdlib RFCOMM is not supported.
"""

import asyncio
import inspect
import json
import platform
import socket
import time
from typing import Any, Awaitable, Callable, Dict, Optional, Tuple

from weisile_link.protocol.validation import validate_ev3_command
from weisile_link.runtime.degradation import (
    DegradationManager,
    SensorSnapshot,
    TransportKind,
)
from weisile_link.transport.native_byte_stream import NativeByteStreamAdapter

EV3_BT_CHANNEL = 1
SensorCallback = Callable[[Dict[str, Any]], Optional[Awaitable[None]]]
MonotonicClock = Callable[[], float]


def host_supports_stdlib_rfcomm(
    socket_module: Any = socket,
    *,
    platform_name: Optional[str] = None,
) -> bool:
    """Return whether this host should attempt stdlib RFCOMM."""
    system_name = platform_name or platform.system()
    if system_name != "Linux":
        return False
    return all(
        hasattr(socket_module, name)
        for name in ("AF_BLUETOOTH", "BTPROTO_RFCOMM", "SOCK_STREAM")
    )


class BluetoothTransport:
    """EV3 fallback transport using Python stdlib Bluetooth RFCOMM."""

    transport_label = "bluetooth"
    transport_capability = "full"

    def __init__(
        self,
        ev3_address: str,
        channel: int = EV3_BT_CHANNEL,
        *,
        pairing_token: str = "",
        socket_module: Any = socket,
        platform_name: Optional[str] = None,
        native_adapter: Optional[NativeByteStreamAdapter] = None,
        manager: Optional[DegradationManager] = None,
        command_timeout_s: float = 5.0,
        connect_timeout_s: float = 10.0,
        monotonic_ms: Optional[MonotonicClock] = None,
    ) -> None:
        self.ev3_address = ev3_address
        self.channel = channel
        self.manager = manager or DegradationManager()
        self._pairing_token = pairing_token
        self._socket_module = socket_module
        self._platform_name = platform_name
        self._native_adapter = native_adapter
        self._native_read_buffer = bytearray()
        self.command_timeout_s = command_timeout_s
        self.connect_timeout_s = connect_timeout_s
        self.sock: Any = None
        self._file: Any = None
        self._sensor_callback: Optional[SensorCallback] = None
        self._receive_task: Optional[asyncio.Task] = None
        self._pending: Dict[Any, asyncio.Future] = {}
        self._next_command_id = 0
        self._closed_by_request = False
        self._write_lock = asyncio.Lock()
        self._monotonic_ms = (
            monotonic_ms
            if monotonic_ms is not None
            else lambda: time.monotonic() * 1000
        )

    @property
    def pending_command_ids(self) -> Tuple[Any, ...]:
        """Return command IDs waiting for EV3 ack."""
        return tuple(self._pending)

    @property
    def connected(self) -> bool:
        """Whether the Bluetooth transport currently has an EV3 session."""
        return self.manager.connection_state.connected

    @property
    def supported(self) -> bool:
        """Whether this host is allowed to attempt stdlib RFCOMM."""
        if self._native_adapter is not None:
            return True
        return host_supports_stdlib_rfcomm(
            self._socket_module,
            platform_name=self._platform_name,
        )

    def configure_endpoint(
        self,
        *,
        ev3_bt: Optional[str] = None,
        ev3_address: Optional[str] = None,
        channel: Optional[int] = None,
        **_: Any,
    ) -> Dict[str, Any]:
        """Update the EV3 Bluetooth endpoint before opening RFCOMM."""
        address = ev3_bt or ev3_address
        if address:
            self.ev3_address = str(address).strip()
        if channel is not None:
            self.channel = int(channel)
        return {"ev3_bt": self.ev3_address, "channel": self.channel}

    async def connect(self, on_sensor_data: SensorCallback) -> bool:
        """Open RFCOMM, pair if configured, and start the receive loop."""
        self._sensor_callback = on_sensor_data
        self._closed_by_request = False
        self.manager.bluetooth_supported = self.supported
        try:
            if self._native_adapter is not None:
                if not await self._open_native_adapter():
                    await self._close_socket()
                    return False
            else:
                if not self.supported:
                    self._record_failure(
                        "stdlib RFCOMM is not supported on this host"
                    )
                    return False

                self.sock = self._socket_module.socket(
                    self._socket_module.AF_BLUETOOTH,
                    self._socket_module.SOCK_STREAM,
                    self._socket_module.BTPROTO_RFCOMM,
                )
                self.sock.settimeout(self.connect_timeout_s)
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(
                    None,
                    self.sock.connect,
                    (self.ev3_address, self.channel),
                )
                self._file = self.sock.makefile("rwb", buffering=0)
                self._record_reconnected()

            if self._pairing_token and not await self._pair():
                self._record_failure("pairing failed")
                await self._close_socket()
                return False

            self._receive_task = asyncio.create_task(self._receive_loop())
            return True
        except Exception as exc:
            self._record_failure(str(exc) or type(exc).__name__)
            await self._close_socket()
            return False

    async def _open_native_adapter(self) -> bool:
        """Open an injected OS-native RFCOMM byte stream."""
        if self._native_adapter is None:
            return False
        try:
            await self._native_adapter.connect(
                self.ev3_address,
                channel=self.channel,
                profile="rfcomm",
            )
            status = await self._native_adapter.status()
            if not status.connected:
                reason = status.last_error or "native adapter is disconnected"
                self._record_failure(reason)
                return False
            self._native_read_buffer.clear()
            self._record_reconnected(
                native_adapter_path=str(
                    getattr(self._native_adapter, "executable", "")
                ),
                native_adapter_status=(
                    status.adapter_version
                    or status.profile
                    or "native byte stream connected"
                ),
            )
            return True
        except Exception as exc:
            self._record_failure(str(exc) or type(exc).__name__)
            return False

    async def _pair(self) -> bool:
        await self._write_json_line(
            {
                "id": "auth.pair",
                "method": "auth.pair",
                "params": {"token": self._pairing_token},
            }
        )
        ack = await asyncio.wait_for(
            self._read_json_line(),
            timeout=self.command_timeout_s,
        )
        return ack.get("type") == "ack" and ack.get("ok") is True

    async def send_command(self, command: Dict[str, Any]) -> Dict[str, Any]:
        """Validate, send, and await one EV3 ack envelope."""
        stream_missing = self._file is None and self._native_adapter is None
        if stream_missing or not self.connected:
            raise ConnectionError("EV3 Bluetooth transport is disconnected")

        method = str(command.get("method", ""))
        params = command.get("params", {})
        validated = validate_ev3_command(method, params)
        command_id = self._command_id(command.get("id"))
        payload = {
            "id": command_id,
            "method": validated.method,
            "params": validated.params,
        }

        loop = asyncio.get_running_loop()
        ack_future = loop.create_future()
        self._pending[command_id] = ack_future
        self.manager.mark_command_pending(str(command_id))

        try:
            await self._write_json_line(payload)
            return await asyncio.wait_for(
                ack_future,
                timeout=self.command_timeout_s,
            )
        except asyncio.TimeoutError as exc:
            self._clear_pending(command_id)
            self._record_failure("Command ack not received before timeout")
            raise TimeoutError(
                "Command ack not received before timeout"
            ) from exc
        except Exception:
            self._clear_pending(command_id)
            raise

    async def disconnect(self) -> None:
        """Close RFCOMM and reject pending commands."""
        self._closed_by_request = True
        if self.connected:
            await self._send_safe_stop()
        self.manager.connection_state.connected = False
        self.manager.connection_state.active_transport = None
        self._reject_pending(
            ConnectionError("EV3 Bluetooth transport disconnected")
        )
        await self._close_socket()

        if self._receive_task is not None:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
            self._receive_task = None

    async def _receive_loop(self) -> None:
        failure_reason = "EV3 Bluetooth RFCOMM closed"
        try:
            while True:
                message = await self._read_json_line()
                if message.get("type") == "sensor_update":
                    self._record_sensor_payload(message)
                    await self._emit_sensor_payload(message)
                elif message.get("type") == "ack":
                    self._resolve_ack(message)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            failure_reason = str(exc) or type(exc).__name__
        finally:
            if not self._closed_by_request:
                await self._send_safe_stop()
                self._record_failure(failure_reason)
                self._reject_pending(ConnectionError(failure_reason))

    async def _write_json_line(self, payload: Dict[str, Any]) -> None:
        line = (json.dumps(payload, separators=(",", ":")) + "\n").encode(
            "utf-8"
        )

        async with self._write_lock:
            await self._write_bytes(line)

    async def _write_bytes(self, payload: bytes) -> None:
        if self._native_adapter is not None:
            await self._native_adapter.send(payload)
            return
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._file.write, payload)
        flush = getattr(self._file, "flush", None)
        if flush is not None:
            await loop.run_in_executor(None, flush)

    async def _read_json_line(self) -> Dict[str, Any]:
        if self._file is None and self._native_adapter is None:
            raise ConnectionError("EV3 Bluetooth transport is disconnected")
        raw = await self._read_bytes_line()
        if not raw:
            raise ConnectionError("EV3 Bluetooth RFCOMM closed")
        if isinstance(raw, str):
            raw_text = raw.strip()
        else:
            raw_text = raw.decode("utf-8").strip()
        return json.loads(raw_text)

    async def _read_bytes_line(self) -> bytes:
        if self._native_adapter is not None:
            while b"\n" not in self._native_read_buffer:
                chunk = await self._native_adapter.recv()
                if not chunk:
                    raise ConnectionError("EV3 Bluetooth RFCOMM closed")
                self._native_read_buffer.extend(chunk)
            line, _, rest = self._native_read_buffer.partition(b"\n")
            self._native_read_buffer = bytearray(rest)
            return bytes(line) + b"\n"
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._file.readline)

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

    def _resolve_ack(self, ack: Dict[str, Any]) -> None:
        command_id = ack.get("id")
        future = self._pending.pop(command_id, None)
        self.manager.clear_command_pending(str(command_id))
        if future is not None and not future.done():
            future.set_result(ack)

    def _reject_pending(self, exc: Exception) -> None:
        for command_id, future in list(self._pending.items()):
            self._clear_pending(command_id)
            if not future.done():
                future.set_exception(exc)

    def _clear_pending(self, command_id: Any) -> None:
        self._pending.pop(command_id, None)
        self.manager.clear_command_pending(str(command_id))

    def _record_failure(self, reason: str) -> None:
        self.manager.record_transport_failure(
            TransportKind.BLUETOOTH,
            reason or "bluetooth transport failed",
        )

    def _record_reconnected(
        self,
        *,
        native_adapter_path: Optional[str] = None,
        native_adapter_status: Optional[str] = None,
    ) -> None:
        self.manager.record_reconnected(
            TransportKind.BLUETOOTH,
            label=self.transport_label,
            capability=self.transport_capability,
            native_adapter_path=native_adapter_path,
            native_adapter_status=native_adapter_status,
        )

    async def _send_safe_stop(self) -> None:
        try:
            await self._write_json_line(
                {
                    "id": "system.stopAll",
                    "method": "system.stopAll",
                    "params": {},
                }
            )
        except Exception:
            return

    async def _close_socket(self) -> None:
        loop = asyncio.get_running_loop()
        file_handle = self._file
        self._file = None
        sock = self.sock
        self.sock = None

        if file_handle is not None and hasattr(file_handle, "close"):
            await loop.run_in_executor(None, file_handle.close)
        if sock is not None and hasattr(sock, "close"):
            await loop.run_in_executor(None, sock.close)
        if self._native_adapter is not None:
            await self._native_adapter.close()

    def _command_id(self, supplied_id: Any) -> Any:
        if supplied_id is not None:
            return supplied_id
        self._next_command_id += 1
        return f"bluetooth-{self._next_command_id}"


class VSLEBluetoothTransport(BluetoothTransport):
    """Product-named full VSLE Bluetooth transport."""

    transport_label = "vsle-bluetooth"
