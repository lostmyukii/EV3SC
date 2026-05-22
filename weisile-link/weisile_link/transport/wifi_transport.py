"""WiFi WebSocket transport between WeisileLink and the EV3 brick.

Sources:
- VSLE spec Section 5.6 defines the WiFi WebSocket transport.
- VSLE spec Section 7.2 defines the EV3 sensor update payload.
- VSLE spec Section 10.5 defines command validation before dispatch.
- VSLE spec Section 16 defines timeout/disconnect degradation behavior.
- websockets asyncio client documentation defines the connection API shape.
"""

import asyncio
import inspect
import json
import os
import time
from typing import Any, Awaitable, Callable, Dict, Optional, Tuple

from weisile_link.protocol.validation import validate_ev3_command
from weisile_link.runtime.degradation import (
    DegradationManager,
    SensorSnapshot,
    TransportKind,
)

SensorCallback = Callable[[Dict[str, Any]], Optional[Awaitable[None]]]
Connector = Callable[..., Awaitable[Any]]
MonotonicClock = Callable[[], float]


class WiFiTransport:
    """Preferred EV3 transport using the EV3-side WebSocket server."""

    def __init__(
        self,
        ev3_ip: str,
        port: int = 8765,
        *,
        pairing_token: Optional[str] = None,
        connector: Optional[Connector] = None,
        manager: Optional[DegradationManager] = None,
        command_timeout_s: float = 5.0,
        monotonic_ms: Optional[MonotonicClock] = None,
    ) -> None:
        self.ev3_ip = ev3_ip
        self.port = port
        self.uri = f"ws://{ev3_ip}:{port}"
        self.ws: Any = None
        self.command_timeout_s = command_timeout_s
        self.manager = manager or DegradationManager()
        self._pairing_token = (
            os.getenv("WEISILE_PAIRING_TOKEN", "")
            if pairing_token is None
            else pairing_token
        )
        self._connector = connector
        self._sensor_callback: Optional[SensorCallback] = None
        self._receive_task: Optional[asyncio.Task] = None
        self._pending: Dict[Any, asyncio.Future] = {}
        self._next_command_id = 0
        self._closed_by_request = False
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
        """Whether the WiFi transport currently has an active EV3 session."""
        return self.manager.connection_state.connected

    def configure_endpoint(
        self,
        *,
        ev3_ip: Optional[str] = None,
        port: Optional[int] = None,
        **_: Any,
    ) -> Dict[str, Any]:
        """Update the EV3 WiFi endpoint before opening a new connection."""
        if ev3_ip:
            self.ev3_ip = str(ev3_ip).strip()
        if port is not None:
            self.port = int(port)
        self.uri = f"ws://{self.ev3_ip}:{self.port}"
        return {"ev3_ip": self.ev3_ip, "port": self.port}

    async def connect(self, on_sensor_data: SensorCallback) -> bool:
        """Connect to EV3, pair when required, and start the receive loop."""
        self._sensor_callback = on_sensor_data
        self._closed_by_request = False
        try:
            connector = self._connector
            if connector is None:
                import websockets

                connector = websockets.connect

            self.ws = await connector(self.uri, ping_interval=5)
            if self._pairing_token:
                paired = await self._pair()
                if not paired:
                    self._record_failure("pairing failed")
                    return False

            self.manager.record_reconnected(TransportKind.WIFI)
            self._receive_task = asyncio.create_task(self._receive_loop())
            return True
        except Exception as exc:
            self._record_failure(str(exc) or type(exc).__name__)
            await self._close_socket(code=1011, reason="wifi connect failed")
            return False

    async def _pair(self) -> bool:
        await self.ws.send(
            json.dumps(
                {
                    "id": "auth.pair",
                    "method": "auth.pair",
                    "params": {"token": self._pairing_token},
                }
            )
        )
        raw = await asyncio.wait_for(
            self.ws.recv(),
            timeout=self.command_timeout_s,
        )
        ack = json.loads(raw)
        if ack.get("type") == "ack" and ack.get("ok") is True:
            return True

        await self._close_socket(code=1008, reason="pairing failed")
        return False

    async def send_command(self, command: Dict[str, Any]) -> Dict[str, Any]:
        """Validate, send, and await one EV3 ack envelope."""
        if self.ws is None or not self.connected:
            raise ConnectionError("EV3 WiFi transport is disconnected")

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
            await self.ws.send(json.dumps(payload))
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
        """Close the WebSocket and reject pending commands."""
        self._closed_by_request = True
        self.manager.connection_state.connected = False
        self.manager.connection_state.active_transport = None
        self._reject_pending(ConnectionError("EV3 WiFi transport disconnected"))

        if self._receive_task is not None:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
            self._receive_task = None

        await self._close_socket(code=1000, reason="client disconnect")
        self.ws = None

    async def _receive_loop(self) -> None:
        failure_reason = "EV3 WebSocket closed"
        try:
            async for raw in self.ws:
                message = json.loads(raw)
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
                self._record_failure(failure_reason)
                self._reject_pending(ConnectionError(failure_reason))

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
            TransportKind.WIFI,
            reason or "wifi transport failed",
        )

    async def _close_socket(self, code: int, reason: str) -> None:
        if self.ws is not None and hasattr(self.ws, "close"):
            await self.ws.close(code=code, reason=reason)

    def _command_id(self, supplied_id: Any) -> Any:
        if supplied_id is not None:
            return supplied_id
        self._next_command_id += 1
        return f"wifi-{self._next_command_id}"
