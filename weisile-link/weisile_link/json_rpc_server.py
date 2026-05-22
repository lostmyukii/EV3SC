"""Scratch-compatible JSON-RPC server for WeisileLink.

Sources:
- Scratch Link NetworkProtocol.md: JSON-RPC 2.0, `/scratch/bt`,
  `getVersion`, discovery, connect, send, and notification conventions.
- Scratch VM `src/io/bt.js`: official EV3 extension consumes
  `didDiscoverPeripheral` and `didReceiveMessage`.
- VSLE spec Sections 5.3, 7.2, 10.2, 10.4, 10.5, 16, and 17.
"""

import asyncio
from datetime import datetime, timezone
import json
import os
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional, Set

from weisile_link.observability.health import (
    HttpResponse,
    RuntimeCounters,
    RuntimeMetrics,
    StatusEndpoint,
)
from weisile_link.protocol.error_mapping import (
    ev3_ack_to_json_rpc,
    exception_to_protocol_error,
    protocol_error_to_json_rpc,
)
from weisile_link.protocol.errors import (
    ErrorCode,
    JsonRpcParseError,
    ProtocolError,
)
from weisile_link.protocol.json_rpc import (
    JsonRpcId,
    make_error,
    make_result,
    parse_json_rpc_request,
)
from weisile_link.protocol.validation import COMMAND_VALIDATORS
from weisile_link.router.sensor_router import (
    SensorDataRouter,
    SensorStreamBuffer,
    WebSocketConsumer,
)
from weisile_link.runtime.degradation import DegradationManager
from weisile_link.transport.bluetooth_transport import BluetoothTransport
from weisile_link.transport.selector import AutoTransport
from weisile_link.transport.wifi_transport import WiFiTransport

SCRATCH_BT_PATH = "/scratch/bt"
SCRATCH_LINK_PROTOCOL_VERSION = "1.3"
WEISILE_LINK_HOST = os.getenv("WEISILE_LINK_HOST", "127.0.0.1")
WEISILE_LINK_PORT = int(os.getenv("WEISILE_LINK_PORT", "20111"))
TRAINER_WS_PORT = int(os.getenv("TRAINER_WS_PORT", "8766"))
DEFAULT_PERIPHERAL_ID = "vsle-ev3-wifi"
DEFAULT_PERIPHERAL_NAME = "VSLE EV3 WiFi"


@dataclass(frozen=True)
class ScratchServerConfig:
    """Configuration for the local Scratch Link compatible endpoint."""

    host: str = WEISILE_LINK_HOST
    port: int = WEISILE_LINK_PORT
    trainer_host: str = WEISILE_LINK_HOST
    trainer_port: int = TRAINER_WS_PORT
    path: str = SCRATCH_BT_PATH
    peripheral_id: str = DEFAULT_PERIPHERAL_ID
    peripheral_name: str = DEFAULT_PERIPHERAL_NAME


class ScratchJsonRpcServer:
    """Local WebSocket JSON-RPC server used by Scratch and TurboWarp."""

    def __init__(
        self,
        transport: Any,
        *,
        manager: Optional[DegradationManager] = None,
        config: ScratchServerConfig = ScratchServerConfig(),
        clock_ms: Callable[[], float] = lambda: time.monotonic() * 1000,
    ) -> None:
        self.transport = transport
        self.manager = manager or getattr(
            transport,
            "manager",
            DegradationManager(),
        )
        self.config = config
        self.path = config.path
        self.clock_ms = clock_ms
        buffer = SensorStreamBuffer(
            max_points=self.manager.max_collected_points,
            manager=self.manager,
        )
        self.sensor_router = SensorDataRouter(buffer=buffer)
        self.scratch_clients: Set[Any] = set()
        self.notification_clients: Set[Any] = set()
        self.trainer_clients: Set[Any] = set()
        self._scratch_consumers: Dict[Any, WebSocketConsumer] = {}
        self._trainer_consumers: Dict[Any, WebSocketConsumer] = {}
        self.command_timeout_count = 0
        self._last_sensor_at_ms: Optional[float] = None
        self._sensor_count = 0
        self._started_at_ms = self.clock_ms()

    @property
    def scratch_client_count(self) -> int:
        """Return the number of connected Scratch WebSocket clients."""
        return len(self.scratch_clients)

    @property
    def trainer_client_count(self) -> int:
        """Return the number of connected Trainer WebSocket clients."""
        return len(self.trainer_clients)

    async def handle_client(self, websocket: Any, path: str = "") -> None:
        """Serve one Scratch Link WebSocket client."""
        if path != self.path:
            await websocket.close(
                code=1008,
                reason="unsupported Scratch Link path",
            )
            return

        self.scratch_clients.add(websocket)
        try:
            async for raw in websocket:
                await self.handle_json_rpc_message(websocket, raw)
        finally:
            self.scratch_clients.discard(websocket)
            self._unregister_scratch_notifications(websocket)

    async def handle_json_rpc_message(self, websocket: Any, raw: str) -> None:
        """Handle one client JSON-RPC request or notification."""
        expects_response = True
        try:
            request = parse_json_rpc_request(raw)
            expects_response = "id" in request
            response = await self._dispatch_request(websocket, request)
        except JsonRpcParseError as exc:
            response = protocol_error_to_json_rpc(None, exc)
        except ProtocolError as exc:
            request_id = self._request_id_from_raw(raw)
            response = protocol_error_to_json_rpc(request_id, exc)
        except Exception as exc:
            request_id = self._request_id_from_raw(raw)
            if isinstance(exc, TimeoutError):
                self.command_timeout_count += 1
            response = protocol_error_to_json_rpc(
                request_id,
                exception_to_protocol_error(
                    exc,
                    method=self._method_from_raw(raw),
                ),
            )

        if response is not None and expects_response:
            await self._send_json(websocket, response)

    async def _dispatch_request(
        self,
        websocket: Any,
        request: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        request_id = request.get("id")
        method = request["method"]
        params = request.get("params", {})

        if method == "getVersion":
            return make_result(
                request_id,
                {
                    "protocol": SCRATCH_LINK_PROTOCOL_VERSION,
                    "implementation": "WeisileLink",
                },
            )
        if method == "discover":
            if "id" in request:
                await self._send_json(websocket, make_result(request_id, None))
            await self._send_discovered_peripheral(websocket)
            return None
        if method == "connect":
            return await self._handle_connect(request_id, params)
        if method in {"startNotifications", "vsle.subscribe"}:
            self._register_scratch_notifications(websocket)
            return make_result(request_id, None)
        if method == "stopNotifications":
            self._unregister_scratch_notifications(websocket)
            return make_result(request_id, None)
        if method == "vsle.setTransport":
            return await self._handle_set_transport(request_id, params)
        if method == "send":
            command = self._command_from_send(request_id, params)
            if command.get("method") == "data.uploadToTrainer":
                return self._handle_upload_to_trainer(request_id)
            return await self._send_ev3_command(request_id, command)
        if method == "data.uploadToTrainer":
            return self._handle_upload_to_trainer(request_id)
        if method in COMMAND_VALIDATORS:
            return await self._send_ev3_command(
                request_id,
                {
                    "id": request_id,
                    "method": method,
                    "params": params,
                },
            )

        return make_error(
            request_id,
            ErrorCode.EV3_INVALID_COMMAND,
            "JSON-RPC method is not supported",
            {"method": method, "retryable": False},
        )

    async def _handle_connect(
        self,
        request_id: JsonRpcId,
        params: Dict[str, Any],
    ) -> Dict[str, Any]:
        peripheral_id = params.get("peripheralId", self.config.peripheral_id)
        if peripheral_id != self.config.peripheral_id:
            return make_error(
                request_id,
                ErrorCode.EV3_TRANSPORT_DISCONNECTED,
                "Requested EV3 peripheral is not available",
                {
                    "peripheralId": peripheral_id,
                    "retryable": True,
                },
            )

        connected = await self.transport.connect(self.handle_sensor_data)
        if not connected:
            return self.manager.command_error_response(request_id, "connect")
        return make_result(request_id, None)

    async def _handle_set_transport(
        self,
        request_id: JsonRpcId,
        params: Dict[str, Any],
    ) -> Dict[str, Any]:
        transport = str(params.get("transport", "wifi")).lower()
        set_transport = getattr(self.transport, "set_transport", None)
        if set_transport is not None:
            try:
                result = set_transport(transport, self.handle_sensor_data)
                if asyncio.iscoroutine(result):
                    result = await result
                return make_result(request_id, result)
            except Exception as exc:
                return protocol_error_to_json_rpc(
                    request_id,
                    exception_to_protocol_error(
                        exc,
                        method="vsle.setTransport",
                    ),
                )

        active_transport = getattr(
            self.transport,
            "active_transport_name",
            "wifi",
        )
        if transport != active_transport:
            return make_error(
                request_id,
                ErrorCode.EV3_TRANSPORT_DISCONNECTED,
                "Requested EV3 transport is not configured",
                {"transport": transport, "retryable": True},
            )
        return make_result(request_id, {"transport": active_transport})

    async def _send_ev3_command(
        self,
        request_id: JsonRpcId,
        command: Dict[str, Any],
    ) -> Dict[str, Any]:
        try:
            ack = await self.transport.send_command(command)
            response = ev3_ack_to_json_rpc(request_id, ack)
            if (
                command.get("method") == "data.clear"
                and response.get("result", {}).get("ok") is True
            ):
                self.sensor_router.buffer.clear()
            return response
        except TimeoutError:
            self.command_timeout_count += 1
            raise
        except Exception as exc:
            if isinstance(exc, ConnectionError):
                return self.manager.command_error_response(
                    request_id,
                    str(command.get("method", "")),
                )
            return protocol_error_to_json_rpc(
                request_id,
                exception_to_protocol_error(
                    exc,
                    method=str(command.get("method", "")),
                ),
            )

    def _command_from_send(
        self,
        request_id: JsonRpcId,
        params: Dict[str, Any],
    ) -> Dict[str, Any]:
        if "command" in params and isinstance(params["command"], dict):
            command = dict(params["command"])
        elif "method" in params:
            command = {
                "method": params.get("method"),
                "params": params.get("params", {}),
            }
        else:
            raise ProtocolError(
                ErrorCode.EV3_INVALID_COMMAND,
                "send requires a VSLE EV3 command object",
                {"retryable": False},
            )

        command.setdefault("id", request_id)
        command.setdefault("params", {})
        return command

    async def handle_sensor_data(self, sensor_data: Dict[str, Any]) -> None:
        """Route one EV3 sensor update to Scratch and Trainer consumers."""
        self._last_sensor_at_ms = self.clock_ms()
        self._sensor_count += 1
        await self.sensor_router.broadcast(sensor_data)

    async def _send_discovered_peripheral(self, websocket: Any) -> None:
        await self._send_json(
            websocket,
            {
                "jsonrpc": "2.0",
                "method": "didDiscoverPeripheral",
                "params": {
                    "peripheralId": self.config.peripheral_id,
                    "name": self.config.peripheral_name,
                    "rssi": 0,
                },
            },
        )

    def handle_get(self, path: str) -> HttpResponse:
        """Expose framework-neutral internal Trainer REST GET routes."""
        if path == "/api/ev3/sensors":
            return self._rest_ok(
                self.sensor_router.latest_sensor_data.get("sensors", {})
            )
        if path == "/api/ev3/motors":
            return self._rest_ok(
                self.sensor_router.latest_sensor_data.get("motors", {})
            )
        if path == "/api/data/collected":
            rows = self.sensor_router.buffer.rows()
            return self._rest_ok({"count": len(rows), "rows": rows})

        endpoint = StatusEndpoint(
            self.manager,
            RuntimeCounters(
                scratch_clients=self.scratch_client_count,
                trainer_clients=self.trainer_client_count,
                command_timeout_count_60s=self.command_timeout_count,
            ),
            RuntimeMetrics(
                sensor_hz=self._sensor_hz(),
                sensor_age_ms=self._sensor_age_ms(),
            ),
        )
        response = endpoint.handle_get(path)
        if response.status != 404:
            return response
        return self._rest_error(
            404,
            "NOT_FOUND",
            "Route not found",
            retryable=False,
        )

    async def handle_post(self, path: str, body: str = "") -> HttpResponse:
        """Expose framework-neutral internal Trainer REST POST routes."""
        if path == "/api/data/clear":
            cleared = self.sensor_router.buffer.clear()
            return self._rest_ok({"cleared_points": cleared})
        if path == "/api/data/export":
            rows = self.sensor_router.buffer.rows()
            return self._rest_ok(
                {
                    "filename": "vsle_ev3_data.csv",
                    "csv": self.sensor_router.buffer.export_csv(),
                    "count": len(rows),
                }
            )
        if path == "/api/ev3/command":
            try:
                command = json.loads(body or "{}")
            except json.JSONDecodeError:
                return self._rest_error(
                    400,
                    ErrorCode.EV3_INVALID_COMMAND.value,
                    "Invalid command JSON",
                    retryable=False,
                )
            response = await self._send_ev3_command(
                command.get("id"),
                {
                    "id": command.get("id"),
                    "method": command.get("method"),
                    "params": command.get("params", {}),
                },
            )
            if "error" in response:
                error = response["error"]
                data = error.get("data", {})
                return self._rest_error(
                    400,
                    error["code"],
                    error["message"],
                    retryable=data.get("retryable", False),
                    data=data,
                )
            return self._rest_ok(response["result"])
        return self._rest_error(
            404,
            "NOT_FOUND",
            "Route not found",
            retryable=False,
        )

    async def handle_trainer_client(
        self,
        websocket: Any,
        _path: str = "",
    ) -> None:
        """Serve one WeisileAI Trainer subscription WebSocket client."""
        consumer = WebSocketConsumer(websocket, "trainer")
        self.trainer_clients.add(websocket)
        self._trainer_consumers[websocket] = consumer
        self.sensor_router.register(consumer)
        self.manager.trainer_available = True
        try:
            async for _raw in websocket:
                continue
        finally:
            self.trainer_clients.discard(websocket)
            self.sensor_router.unregister(consumer)
            self._trainer_consumers.pop(websocket, None)

    async def run_trainer(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        serve: Optional[Callable[..., Any]] = None,
    ) -> None:
        """Run the local Trainer subscription WebSocket server."""
        if serve is None:
            import websockets

            serve = websockets.serve

        server = await serve(
            self.handle_trainer_client,
            host or self.config.trainer_host,
            port or self.config.trainer_port,
            ping_interval=5,
        )
        await server.serve_forever()

    async def run(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        serve: Optional[Callable[..., Any]] = None,
    ) -> None:
        """Run the local Scratch-compatible WebSocket server."""
        if serve is None:
            import websockets

            serve = websockets.serve

        server = await serve(
            self.handle_client,
            host or self.config.host,
            port or self.config.port,
            ping_interval=5,
        )
        try:
            await server.serve_forever()
        finally:
            disconnect = getattr(self.transport, "disconnect", None)
            if disconnect is not None:
                result = disconnect()
                if asyncio.iscoroutine(result):
                    await result

    async def _send_json(self, websocket: Any, payload: Dict[str, Any]) -> None:
        await websocket.send(json.dumps(payload, separators=(",", ":")))

    def _register_scratch_notifications(self, websocket: Any) -> None:
        self.notification_clients.add(websocket)
        if websocket in self._scratch_consumers:
            return
        consumer = WebSocketConsumer(websocket, "scratch")
        self._scratch_consumers[websocket] = consumer
        self.sensor_router.register(consumer)

    def _unregister_scratch_notifications(self, websocket: Any) -> None:
        self.notification_clients.discard(websocket)
        consumer = self._scratch_consumers.pop(websocket, None)
        if consumer is not None:
            self.sensor_router.unregister(consumer)

    def _handle_upload_to_trainer(
        self, request_id: JsonRpcId
    ) -> Dict[str, Any]:
        if self.trainer_client_count == 0:
            self.manager.record_trainer_unavailable("trainer not connected")
            return self.manager.trainer_error_response(request_id)
        self.manager.trainer_available = True
        return make_result(
            request_id,
            {
                "uploaded_points": len(self.sensor_router.buffer.rows()),
                "trainer_clients": self.trainer_client_count,
            },
        )

    def _rest_ok(self, data: Dict[str, Any]) -> HttpResponse:
        return HttpResponse(
            status=200,
            headers={"content-type": "application/json"},
            body=json.dumps(
                {
                    "ok": True,
                    "timestamp": _utc_timestamp(),
                    "data": data,
                },
                separators=(",", ":"),
            ),
        )

    def _rest_error(
        self,
        status: int,
        code: str,
        message: str,
        *,
        retryable: bool,
        data: Optional[Dict[str, Any]] = None,
    ) -> HttpResponse:
        error = {
            "code": code,
            "message": message,
            "retryable": retryable,
        }
        if data:
            error["data"] = data
        return HttpResponse(
            status=status,
            headers={"content-type": "application/json"},
            body=json.dumps(
                {
                    "ok": False,
                    "timestamp": _utc_timestamp(),
                    "error": error,
                },
                separators=(",", ":"),
            ),
        )

    def _sensor_hz(self) -> float:
        elapsed_s = max(0.001, (self.clock_ms() - self._started_at_ms) / 1000)
        return round(self._sensor_count / elapsed_s, 3)

    def _sensor_age_ms(self) -> int:
        if self._last_sensor_at_ms is None:
            return 0
        return max(0, int(self.clock_ms() - self._last_sensor_at_ms))

    def _request_id_from_raw(self, raw: str) -> JsonRpcId:
        try:
            decoded = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if isinstance(decoded, dict):
            return decoded.get("id")
        return None

    def _method_from_raw(self, raw: str) -> Optional[str]:
        try:
            decoded = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if isinstance(decoded, dict) and isinstance(decoded.get("method"), str):
            return decoded["method"]
        return None


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def create_default_server(
    ev3_ip: str,
    *,
    ev3_bt: Optional[str] = None,
    transport_mode: str = "auto",
) -> ScratchJsonRpcServer:
    """Create the default WiFi-first Scratch JSON-RPC server."""
    manager = DegradationManager()
    wifi_transport = WiFiTransport(ev3_ip, manager=manager)
    bluetooth_transport = None
    if ev3_bt:
        bluetooth_transport = BluetoothTransport(ev3_bt, manager=manager)
        manager.bluetooth_supported = bluetooth_transport.supported

    if transport_mode == "wifi" or bluetooth_transport is None:
        transport = wifi_transport
    elif transport_mode == "bluetooth":
        transport = AutoTransport(
            wifi_transport,
            bluetooth_transport,
            manager=manager,
            preferred="bluetooth",
        )
    else:
        transport = AutoTransport(
            wifi_transport,
            bluetooth_transport,
            manager=manager,
            preferred="wifi",
        )
    return ScratchJsonRpcServer(transport, manager=manager)
