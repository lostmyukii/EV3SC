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
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional, Set, Tuple
from urllib.parse import parse_qs, urlparse

from weisile_link.ai_quest_contract import (
    AIQuestContractError,
    AIQuestContractService,
    features_from_trainer_payload,
)
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
from weisile_link.router.sensor_router import WebSocketConsumer
from weisile_link.runtime.degradation import DegradationManager
from weisile_link.sessions import EV3Session, EV3SessionManager
from weisile_link.trainer_pipeline import (
    DEFAULT_ACCURACY_GATE,
    TrainerPipelineError,
    export_model_rules,
    train_decision_tree,
)
from weisile_link.transport.bluetooth_transport import VSLEBluetoothTransport
from weisile_link.transport.native_adapter_process import NativeAdapterProcess
from weisile_link.transport.selector import AutoTransport
from weisile_link.transport.wifi_transport import WiFiTransport

SCRATCH_BT_PATH = "/scratch/bt"
SCRATCH_LINK_PROTOCOL_VERSION = "1.3"
WEISILE_LINK_HOST = os.getenv("WEISILE_LINK_HOST", "127.0.0.1")
WEISILE_LINK_PORT = int(os.getenv("WEISILE_LINK_PORT", "20111"))
TRAINER_WS_PORT = int(os.getenv("TRAINER_WS_PORT", "8766"))
DEFAULT_PERIPHERAL_ID = "vsle-ev3-wifi"
DEFAULT_PERIPHERAL_NAME = "VSLE EV3 WiFi"
DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:8601",
    "http://127.0.0.1:8601",
    "https://localhost:8000",
    "https://127.0.0.1:8000",
    "https://localhost:3001",
    "https://127.0.0.1:3001",
    "https://localhost:8601",
    "https://127.0.0.1:8601",
)


def allowed_origins_from_env() -> Tuple[str, ...]:
    """Return browser Origin allowlist from env or safe local defaults."""
    raw = os.getenv("WEISILE_ALLOWED_ORIGINS", "")
    if not raw.strip():
        return DEFAULT_ALLOWED_ORIGINS
    return tuple(
        origin.strip().rstrip("/")
        for origin in raw.split(",")
        if origin.strip()
    )


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
    allowed_origins: Tuple[str, ...] = field(
        default_factory=allowed_origins_from_env
    )


class ScratchJsonRpcServer:
    """Local WebSocket JSON-RPC server used by Scratch and TurboWarp."""

    def __init__(
        self,
        transport: Any,
        *,
        manager: Optional[DegradationManager] = None,
        config: ScratchServerConfig = ScratchServerConfig(),
        clock_ms: Callable[[], float] = lambda: time.monotonic() * 1000,
        session_manager: Optional[EV3SessionManager] = None,
        ai_quest: Optional[AIQuestContractService] = None,
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
        if session_manager is None:
            session_manager = EV3SessionManager()
            session_manager.add_session(
                config.peripheral_id,
                config.peripheral_name,
                transport,
                manager=self.manager,
            )
        self.sessions = session_manager
        self.default_session = self.sessions.default_session
        self.sensor_router = self.default_session.router
        self.scratch_clients: Set[Any] = set()
        self.notification_clients: Set[Any] = set()
        self.trainer_clients: Set[Any] = set()
        self._client_sessions: Dict[Any, str] = {}
        self._scratch_consumers: Dict[Any, tuple] = {}
        self._trainer_consumers: Dict[Any, WebSocketConsumer] = {}
        self.command_timeout_count = 0
        self._last_sensor_at_ms: Optional[float] = None
        self._sensor_count = 0
        self._started_at_ms = self.clock_ms()
        self.ai_quest = ai_quest or AIQuestContractService()

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
        path = self._resolve_websocket_path(websocket, path)
        if path != self.path:
            await websocket.close(
                code=1008,
                reason="unsupported Scratch Link path",
            )
            return
        if not self._origin_allowed(websocket):
            await websocket.close(code=1008, reason="origin not allowed")
            return

        self.scratch_clients.add(websocket)
        try:
            async for raw in websocket:
                await self.handle_json_rpc_message(websocket, raw)
        finally:
            self.scratch_clients.discard(websocket)
            self._unregister_scratch_notifications(websocket)

    def _resolve_websocket_path(self, websocket: Any, path: str = "") -> str:
        """Return a WebSocket request path across websockets API versions."""
        if path:
            return path
        request = getattr(websocket, "request", None)
        request_path = getattr(request, "path", None)
        if isinstance(request_path, str):
            return request_path
        websocket_path = getattr(websocket, "path", None)
        if isinstance(websocket_path, str):
            return websocket_path
        return ""

    def _origin_allowed(self, websocket: Any) -> bool:
        """Reject browser WebSocket clients outside the configured allowlist."""
        origin = self._resolve_websocket_origin(websocket)
        if not origin:
            return True
        allowed = {item.rstrip("/") for item in self.config.allowed_origins}
        return "*" in allowed or origin.rstrip("/") in allowed

    def _resolve_websocket_origin(self, websocket: Any) -> str:
        request = getattr(websocket, "request", None)
        headers = getattr(request, "headers", None)
        if headers is None:
            headers = getattr(websocket, "request_headers", None)
        if headers is None:
            return ""
        if hasattr(headers, "get"):
            return headers.get("Origin") or headers.get("origin") or ""
        return ""

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
            await self._send_discovered_peripherals(websocket)
            return None
        if method == "connect":
            return await self._handle_connect(websocket, request_id, params)
        if method in {"startNotifications", "vsle.subscribe"}:
            self._register_scratch_notifications(websocket)
            return make_result(request_id, None)
        if method == "stopNotifications":
            self._unregister_scratch_notifications(websocket)
            return make_result(request_id, None)
        if method == "vsle.setTransport":
            return await self._handle_set_transport(
                websocket, request_id, params
            )
        if method == "send":
            command = self._command_from_send(request_id, params)
            if str(command.get("method", "")).startswith("aiquest."):
                return self._handle_ai_quest_command(
                    request_id,
                    str(command.get("method", "")),
                    command.get("params", {}),
                    self._session_id_from_command(websocket, command, params),
                )
            if command.get("method") == "data.uploadToTrainer":
                return self._handle_upload_to_trainer(
                    request_id,
                    self._session_id_from_command(websocket, command, params),
                )
            return await self._send_ev3_command(
                request_id,
                command,
                self._session_id_from_command(websocket, command, params),
            )
        if method == "data.uploadToTrainer":
            return self._handle_upload_to_trainer(
                request_id,
                self._session_id_from_params(websocket, params),
            )
        if method.startswith("aiquest."):
            return self._handle_ai_quest_command(
                request_id,
                method,
                params,
                self._session_id_from_params(websocket, params),
            )
        if method in COMMAND_VALIDATORS:
            return await self._send_ev3_command(
                request_id,
                {
                    "id": request_id,
                    "method": method,
                    "params": params,
                },
                self._session_id_from_params(websocket, params),
            )

        return make_error(
            request_id,
            ErrorCode.EV3_INVALID_COMMAND,
            "JSON-RPC method is not supported",
            {"method": method, "retryable": False},
        )

    async def _handle_connect(
        self,
        websocket: Any,
        request_id: JsonRpcId,
        params: Dict[str, Any],
    ) -> Dict[str, Any]:
        peripheral_id = self._session_id_from_params(websocket, params)
        try:
            session = self.sessions.require_session(peripheral_id)
        except KeyError:
            return make_error(
                request_id,
                ErrorCode.EV3_TRANSPORT_DISCONNECTED,
                "Requested EV3 peripheral is not available",
                {
                    "peripheralId": peripheral_id,
                    "retryable": True,
                },
            )

        connected = await session.connect(self.handle_session_sensor_data)
        if not connected:
            return session.manager.command_error_response(request_id, "connect")
        self._client_sessions[websocket] = session.brick_id
        return make_result(request_id, None)

    async def _handle_set_transport(
        self,
        websocket: Any,
        request_id: JsonRpcId,
        params: Dict[str, Any],
    ) -> Dict[str, Any]:
        transport = str(params.get("transport", "wifi")).lower()
        try:
            session = self.sessions.require_session(
                self._session_id_from_params(websocket, params)
            )
            result = await session.set_transport(
                transport,
                self.handle_session_sensor_data,
                **self._transport_config_from_params(params),
            )
            return make_result(request_id, result)
        except KeyError:
            return make_error(
                request_id,
                ErrorCode.EV3_TRANSPORT_DISCONNECTED,
                "Requested EV3 peripheral is not available",
                {
                    "peripheralId": self._session_id_from_params(
                        websocket, params
                    ),
                    "retryable": True,
                },
            )
        except Exception as exc:
            return protocol_error_to_json_rpc(
                request_id,
                exception_to_protocol_error(
                    exc,
                    method="vsle.setTransport",
                ),
            )

    async def _send_ev3_command(
        self,
        request_id: JsonRpcId,
        command: Dict[str, Any],
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        try:
            session = self.sessions.require_session(session_id)
        except KeyError:
            return make_error(
                request_id,
                ErrorCode.EV3_TRANSPORT_DISCONNECTED,
                "Requested EV3 peripheral is not available",
                {"peripheralId": session_id, "retryable": True},
            )

        try:
            ack = await session.send_command(command)
            response = ev3_ack_to_json_rpc(request_id, ack)
            if (
                command.get("method") == "data.clear"
                and response.get("result", {}).get("ok") is True
            ):
                session.router.buffer.clear()
            return response
        except TimeoutError:
            self.command_timeout_count += 1
            raise
        except Exception as exc:
            if isinstance(exc, ConnectionError):
                return session.manager.command_error_response(
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
        """Route one default EV3 sensor update."""
        await self.handle_session_sensor_data(
            self.sessions.default_brick_id,
            sensor_data,
        )

    async def handle_session_sensor_data(
        self,
        brick_id: str,
        sensor_data: Dict[str, Any],
    ) -> None:
        """Route one EV3 sensor update to its owning session."""
        self._last_sensor_at_ms = self.clock_ms()
        self._sensor_count += 1
        session = self.sessions.require_session(brick_id)
        await session.route_sensor_data(sensor_data)

    async def _send_discovered_peripherals(self, websocket: Any) -> None:
        for payload in self.sessions.peripheral_payloads():
            await self._send_json(
                websocket,
                {
                    "jsonrpc": "2.0",
                    "method": "didDiscoverPeripheral",
                    "params": payload,
                },
            )

    def handle_get(self, path: str) -> HttpResponse:
        """Expose framework-neutral internal Trainer REST GET routes."""
        route, query = _split_path(path)
        session_id = _first_query_value(
            query, "brick_id"
        ) or _first_query_value(
            query,
            "peripheralId",
        )
        if route == "/api/ev3/sensors":
            return self._sensor_snapshot_response(session_id, "sensors")
        if route == "/api/ev3/motors":
            return self._sensor_snapshot_response(session_id, "motors")
        if route == "/api/data/collected":
            session = self._rest_session(session_id)
            rows = session.router.buffer.rows()
            return self._rest_ok({"count": len(rows), "rows": rows})
        if route == "/api/aiquest/upload-status":
            dataset_id = _first_query_value(query, "dataset_id")
            if dataset_id is None:
                dataset_id = _first_query_value(query, "datasetId") or ""
            return self._rest_ok(self.ai_quest.get_upload_status(dataset_id))
        if route == "/api/aiquest/audit":
            limit = _first_query_value(query, "limit") or "50"
            return self._rest_ok(
                {"entries": self.ai_quest.get_audit_log(_safe_int(limit, 50))}
            )
        if route == "/api/aiquest/models":
            return self._rest_ok(
                self.ai_quest.list_models(
                    scope=_first_query_value(query, "scope") or "project",
                    scope_id=_first_query_value(query, "scope_id")
                    or _first_query_value(query, "scopeId")
                    or "scratch-project",
                )
            )
        if route == "/api/aiquest/prediction-mode":
            return self._rest_ok(
                self.ai_quest.get_prediction_mode(
                    scope=_first_query_value(query, "scope") or "project",
                    scope_id=_first_query_value(query, "scope_id")
                    or _first_query_value(query, "scopeId")
                    or "scratch-project",
                )
            )

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
        if route == "/api/status":
            response = endpoint.handle_get(route)
            payload = json.loads(response.body)
            payload["ev3_sessions"] = self.sessions.status_payloads()
            return HttpResponse(
                status=response.status,
                headers=response.headers,
                body=json.dumps(payload, separators=(",", ":")),
            )
        return self._rest_error(
            404,
            "NOT_FOUND",
            "Route not found",
            retryable=False,
        )

    async def handle_post(self, path: str, body: str = "") -> HttpResponse:
        """Expose framework-neutral internal Trainer REST POST routes."""
        route, query = _split_path(path)
        query_session_id = _first_query_value(
            query, "brick_id"
        ) or _first_query_value(
            query,
            "peripheralId",
        )
        if route == "/api/data/clear":
            session = self._rest_session(query_session_id)
            cleared = session.router.buffer.clear()
            return self._rest_ok({"cleared_points": cleared})
        if route == "/api/data/export":
            session = self._rest_session(query_session_id)
            rows = session.router.buffer.rows()
            return self._rest_ok(
                {
                    "filename": "vsle_ev3_data.csv",
                    "csv": session.router.buffer.export_csv(),
                    "count": len(rows),
                }
            )
        if route == "/api/ev3/command":
            try:
                command = json.loads(body or "{}")
            except json.JSONDecodeError:
                return self._rest_error(
                    400,
                    ErrorCode.EV3_INVALID_COMMAND.value,
                    "Invalid command JSON",
                    retryable=False,
                )
            session_id = (
                command.get("brick_id")
                or command.get("peripheralId")
                or command.get("sessionId")
                or query_session_id
            )
            response = await self._send_ev3_command(
                command.get("id"),
                {
                    "id": command.get("id"),
                    "method": command.get("method"),
                    "params": command.get("params", {}),
                },
                session_id,
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
        if route == "/api/aiquest/upload":
            try:
                payload = json.loads(body or "{}")
            except json.JSONDecodeError:
                return self._rest_error(
                    400,
                    "AIQUEST_INVALID_REQUEST",
                    "Invalid AI Quest upload JSON",
                    retryable=False,
                )
            result = self._handle_ai_quest_command(
                payload.get("id"),
                "aiquest.uploadDataset",
                payload,
                payload.get("brick_id")
                or payload.get("peripheralId")
                or payload.get("sessionId")
                or query_session_id,
            )
            return self._rest_from_json_rpc(result)
        if route == "/api/aiquest/train":
            try:
                payload = json.loads(body or "{}")
            except json.JSONDecodeError:
                return self._rest_error(
                    400,
                    "AIQUEST_INVALID_REQUEST",
                    "Invalid AI Quest training JSON",
                    retryable=False,
                )
            result = self._handle_ai_quest_command(
                payload.get("id"),
                "aiquest.startTraining",
                payload,
                payload.get("brick_id")
                or payload.get("peripheralId")
                or payload.get("sessionId")
                or query_session_id,
            )
            return self._rest_from_json_rpc(result)
        if route == "/api/aiquest/predict":
            try:
                payload = json.loads(body or "{}")
            except json.JSONDecodeError:
                return self._rest_error(
                    400,
                    "AIQUEST_INVALID_REQUEST",
                    "Invalid AI Quest prediction JSON",
                    retryable=False,
                )
            result = self._handle_ai_quest_command(
                payload.get("id"),
                "aiquest.predictCurrent",
                payload,
                payload.get("brick_id")
                or payload.get("peripheralId")
                or payload.get("sessionId")
                or query_session_id,
            )
            return self._rest_from_json_rpc(result)
        if route == "/api/aiquest/export":
            try:
                payload = json.loads(body or "{}")
            except json.JSONDecodeError:
                return self._rest_error(
                    400,
                    "AIQUEST_INVALID_REQUEST",
                    "Invalid AI Quest export JSON",
                    retryable=False,
                )
            result = self._handle_ai_quest_command(
                payload.get("id"),
                "aiquest.exportModel",
                payload,
                payload.get("brick_id")
                or payload.get("peripheralId")
                or payload.get("sessionId")
                or query_session_id,
            )
            return self._rest_from_json_rpc(result)
        if route == "/api/aiquest/delete-dataset":
            try:
                payload = json.loads(body or "{}")
            except json.JSONDecodeError:
                return self._rest_error(
                    400,
                    "AIQUEST_INVALID_REQUEST",
                    "Invalid AI Quest dataset deletion JSON",
                    retryable=False,
                )
            result = self._handle_ai_quest_command(
                payload.get("id"),
                "aiquest.deleteDataset",
                payload,
                payload.get("brick_id")
                or payload.get("peripheralId")
                or payload.get("sessionId")
                or query_session_id,
            )
            return self._rest_from_json_rpc(result)
        if route == "/api/aiquest/delete-model":
            try:
                payload = json.loads(body or "{}")
            except json.JSONDecodeError:
                return self._rest_error(
                    400,
                    "AIQUEST_INVALID_REQUEST",
                    "Invalid AI Quest model deletion JSON",
                    retryable=False,
                )
            result = self._handle_ai_quest_command(
                payload.get("id"),
                "aiquest.deleteModel",
                payload,
                payload.get("brick_id")
                or payload.get("peripheralId")
                or payload.get("sessionId")
                or query_session_id,
            )
            return self._rest_from_json_rpc(result)
        if route == "/api/aiquest/publish-model":
            try:
                payload = json.loads(body or "{}")
            except json.JSONDecodeError:
                return self._rest_error(
                    400,
                    "AIQUEST_INVALID_REQUEST",
                    "Invalid AI Quest model publish JSON",
                    retryable=False,
                )
            result = self._handle_ai_quest_command(
                payload.get("id"),
                "aiquest.publishModel",
                payload,
                payload.get("brick_id")
                or payload.get("peripheralId")
                or payload.get("sessionId")
                or query_session_id,
            )
            return self._rest_from_json_rpc(result)
        if route == "/api/aiquest/withdraw-model":
            try:
                payload = json.loads(body or "{}")
            except json.JSONDecodeError:
                return self._rest_error(
                    400,
                    "AIQUEST_INVALID_REQUEST",
                    "Invalid AI Quest model withdrawal JSON",
                    retryable=False,
                )
            result = self._handle_ai_quest_command(
                payload.get("id"),
                "aiquest.withdrawModel",
                payload,
                payload.get("brick_id")
                or payload.get("peripheralId")
                or payload.get("sessionId")
                or query_session_id,
            )
            return self._rest_from_json_rpc(result)
        if route == "/api/aiquest/cache-model":
            try:
                payload = json.loads(body or "{}")
            except json.JSONDecodeError:
                return self._rest_error(
                    400,
                    "AIQUEST_INVALID_REQUEST",
                    "Invalid AI Quest model cache JSON",
                    retryable=False,
                )
            result = self._handle_ai_quest_command(
                payload.get("id"),
                "aiquest.cacheModel",
                payload,
                payload.get("brick_id")
                or payload.get("peripheralId")
                or payload.get("sessionId")
                or query_session_id,
            )
            return self._rest_from_json_rpc(result)
        if route == "/api/aiquest/use-cached-model":
            try:
                payload = json.loads(body or "{}")
            except json.JSONDecodeError:
                return self._rest_error(
                    400,
                    "AIQUEST_INVALID_REQUEST",
                    "Invalid AI Quest cached-model JSON",
                    retryable=False,
                )
            result = self._handle_ai_quest_command(
                payload.get("id"),
                "aiquest.useCachedModel",
                payload,
                payload.get("brick_id")
                or payload.get("peripheralId")
                or payload.get("sessionId")
                or query_session_id,
            )
            return self._rest_from_json_rpc(result)
        if route == "/api/aiquest/clear-model-cache":
            try:
                payload = json.loads(body or "{}")
            except json.JSONDecodeError:
                return self._rest_error(
                    400,
                    "AIQUEST_INVALID_REQUEST",
                    "Invalid AI Quest cache clear JSON",
                    retryable=False,
                )
            result = self._handle_ai_quest_command(
                payload.get("id"),
                "aiquest.clearModelCache",
                payload,
                payload.get("brick_id")
                or payload.get("peripheralId")
                or payload.get("sessionId")
                or query_session_id,
            )
            return self._rest_from_json_rpc(result)
        if route == "/api/trainer/train":
            try:
                payload = json.loads(body or "{}")
            except json.JSONDecodeError:
                return self._rest_error(
                    400,
                    "TRAINER_INVALID_REQUEST",
                    "Invalid Trainer training JSON",
                    retryable=False,
                )
            session = self._rest_session(
                payload.get("brick_id")
                or payload.get("peripheralId")
                or payload.get("sessionId")
                or query_session_id
            )
            try:
                model = train_decision_tree(
                    session.router.buffer.rows(),
                    accuracy_gate=payload.get(
                        "accuracy_gate",
                        DEFAULT_ACCURACY_GATE,
                    ),
                )
            except TrainerPipelineError as exc:
                return self._trainer_error_response(exc)
            session.trainer_model = model
            return self._rest_ok(
                {
                    "training_rows": model["training"]["rows"],
                    "accuracy": model["model"]["accuracy"],
                    "accuracy_gate": model["model"]["accuracyGate"],
                    "model": model,
                }
            )
        if route == "/api/trainer/export":
            try:
                payload = json.loads(body or "{}")
            except json.JSONDecodeError:
                return self._rest_error(
                    400,
                    "TRAINER_INVALID_REQUEST",
                    "Invalid Trainer export JSON",
                    retryable=False,
                )
            session = self._rest_session(
                payload.get("brick_id")
                or payload.get("peripheralId")
                or payload.get("sessionId")
                or query_session_id
            )
            if session.trainer_model is None:
                return self._rest_error(
                    409,
                    "TRAINER_MODEL_NOT_TRAINED",
                    "Train a WeisileAI model before exporting rules",
                    retryable=False,
                )
            try:
                exported = export_model_rules(session.trainer_model)
            except TrainerPipelineError as exc:
                return self._trainer_error_response(exc)
            return self._rest_ok(
                {
                    "filename": "model_rules.json",
                    "json": exported,
                    "accuracy": session.trainer_model["model"]["accuracy"],
                    "schemaVersion": session.trainer_model["schemaVersion"],
                }
            )
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
        for session in self.sessions.all_sessions():
            session.router.register(consumer)
        self.manager.trainer_available = True
        try:
            async for _raw in websocket:
                continue
        finally:
            self.trainer_clients.discard(websocket)
            for session in self.sessions.all_sessions():
                session.router.unregister(consumer)
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
            for session in self.sessions.all_sessions():
                await session.disconnect()

    async def _send_json(self, websocket: Any, payload: Dict[str, Any]) -> None:
        await websocket.send(json.dumps(payload, separators=(",", ":")))

    def _register_scratch_notifications(self, websocket: Any) -> None:
        self.notification_clients.add(websocket)
        session = self._session_for_websocket(websocket)
        existing = self._scratch_consumers.get(websocket)
        if existing is not None and existing[0] == session.brick_id:
            return
        if existing is not None:
            previous_session_id, previous_consumer = existing
            try:
                self.sessions.require_session(
                    previous_session_id
                ).router.unregister(previous_consumer)
            except KeyError:
                pass
        consumer = WebSocketConsumer(websocket, "scratch")
        self._scratch_consumers[websocket] = (session.brick_id, consumer)
        session.router.register(consumer)

    def _unregister_scratch_notifications(self, websocket: Any) -> None:
        self.notification_clients.discard(websocket)
        item = self._scratch_consumers.pop(websocket, None)
        if item is not None:
            session_id, consumer = item
            try:
                self.sessions.require_session(session_id).router.unregister(
                    consumer
                )
            except KeyError:
                return

    def _handle_upload_to_trainer(
        self, request_id: JsonRpcId, session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        try:
            session = self.sessions.require_session(session_id)
        except KeyError:
            return make_error(
                request_id,
                ErrorCode.EV3_TRANSPORT_DISCONNECTED,
                "Requested EV3 peripheral is not available",
                {"peripheralId": session_id, "retryable": True},
            )
        if self.trainer_client_count == 0:
            session.manager.record_trainer_unavailable("trainer not connected")
            return session.manager.trainer_error_response(request_id)
        session.manager.trainer_available = True
        return make_result(
            request_id,
            {
                "uploaded_points": len(session.router.buffer.rows()),
                "trainer_clients": self.trainer_client_count,
            },
        )

    def _handle_ai_quest_command(
        self,
        request_id: JsonRpcId,
        method: str,
        params: Dict[str, Any],
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        try:
            session = self.sessions.require_session(session_id)
        except KeyError:
            return make_error(
                request_id,
                ErrorCode.EV3_TRANSPORT_DISCONNECTED,
                "Requested EV3 peripheral is not available",
                {"peripheralId": session_id, "retryable": True},
            )
        try:
            if method == "aiquest.uploadDataset":
                return make_result(
                    request_id,
                    self.ai_quest.upload_time_series(
                        rows=session.router.buffer.rows(),
                        raw_rows=session.router.buffer.raw_rows(),
                        brick_id=session.brick_id,
                        scope=str(params.get("scope", "project")),
                        scope_id=str(
                            params.get("scope_id")
                            or params.get("scopeId")
                            or "scratch-project"
                        ),
                        consent=params.get("consent") is True,
                        metadata=params.get("metadata", {}),
                    ),
                )
            if method == "aiquest.startTraining":
                return make_result(
                    request_id,
                    self.ai_quest.start_training(
                        str(
                            params.get("dataset_id")
                            or params.get("datasetId")
                            or ""
                        ),
                        accuracy_gate=params.get("accuracy_gate", 0.7),
                    ),
                )
            if method == "aiquest.getTrainingStatus":
                return make_result(
                    request_id,
                    self.ai_quest.get_training_status(
                        str(params.get("job_id") or params.get("jobId") or "")
                    ),
                )
            if method == "aiquest.getUploadStatus":
                return make_result(
                    request_id,
                    self.ai_quest.get_upload_status(
                        str(
                            params.get("dataset_id")
                            or params.get("datasetId")
                            or ""
                        )
                    ),
                )
            if method == "aiquest.selectModel":
                return make_result(
                    request_id,
                    self.ai_quest.select_model(
                        str(
                            params.get("model_id")
                            or params.get("modelId")
                            or ""
                        ),
                        scope=str(params.get("scope", "project")),
                        scope_id=str(
                            params.get("scope_id")
                            or params.get("scopeId")
                            or "scratch-project"
                        ),
                    ),
                )
            if method == "aiquest.publishModel":
                return make_result(
                    request_id,
                    self.ai_quest.publish_model(
                        str(
                            params.get("model_id")
                            or params.get("modelId")
                            or ""
                        ),
                        scope=str(params.get("scope", "classSession")),
                        scope_id=str(
                            params.get("scope_id")
                            or params.get("scopeId")
                            or "scratch-project"
                        ),
                    ),
                )
            if method == "aiquest.withdrawModel":
                return make_result(
                    request_id,
                    self.ai_quest.withdraw_model(
                        str(
                            params.get("model_id")
                            or params.get("modelId")
                            or ""
                        ),
                        scope=str(params.get("scope", "classSession")),
                        scope_id=str(
                            params.get("scope_id")
                            or params.get("scopeId")
                            or "scratch-project"
                        ),
                    ),
                )
            if method == "aiquest.listModels":
                return make_result(
                    request_id,
                    self.ai_quest.list_models(
                        scope=str(params.get("scope", "project")),
                        scope_id=str(
                            params.get("scope_id")
                            or params.get("scopeId")
                            or "scratch-project"
                        ),
                    ),
                )
            if method == "aiquest.cacheModel":
                return make_result(
                    request_id,
                    self.ai_quest.cache_model(
                        str(
                            params.get("model_id")
                            or params.get("modelId")
                            or ""
                        )
                    ),
                )
            if method == "aiquest.useCachedModel":
                return make_result(
                    request_id,
                    self.ai_quest.use_cached_model(
                        str(
                            params.get("model_id")
                            or params.get("modelId")
                            or ""
                        ),
                        scope=str(params.get("scope", "project")),
                        scope_id=str(
                            params.get("scope_id")
                            or params.get("scopeId")
                            or "scratch-project"
                        ),
                    ),
                )
            if method == "aiquest.clearModelCache":
                return make_result(
                    request_id,
                    self.ai_quest.clear_model_cache(
                        str(
                            params.get("model_id")
                            or params.get("modelId")
                            or ""
                        )
                    ),
                )
            if method == "aiquest.getPredictionMode":
                return make_result(
                    request_id,
                    self.ai_quest.get_prediction_mode(
                        scope=str(params.get("scope", "project")),
                        scope_id=str(
                            params.get("scope_id")
                            or params.get("scopeId")
                            or "scratch-project"
                        ),
                    ),
                )
            if method == "aiquest.predictCurrent":
                features = features_from_trainer_payload(
                    session.router.latest_trainer_payload
                )
                return make_result(
                    request_id,
                    self.ai_quest.predict(
                        features,
                        scope=str(params.get("scope", "project")),
                        scope_id=str(
                            params.get("scope_id")
                            or params.get("scopeId")
                            or "scratch-project"
                        ),
                    ),
                )
            if method == "aiquest.exportModel":
                return make_result(
                    request_id,
                    self.ai_quest.export_model(
                        str(
                            params.get("model_id")
                            or params.get("modelId")
                            or ""
                        )
                    ),
                )
            if method == "aiquest.deleteDataset":
                return make_result(
                    request_id,
                    self.ai_quest.delete_dataset(
                        str(
                            params.get("dataset_id")
                            or params.get("datasetId")
                            or ""
                        )
                    ),
                )
            if method == "aiquest.deleteModel":
                return make_result(
                    request_id,
                    self.ai_quest.delete_model(
                        str(
                            params.get("model_id")
                            or params.get("modelId")
                            or ""
                        )
                    ),
                )
            if method == "aiquest.getAuditLog":
                return make_result(
                    request_id,
                    {
                        "entries": self.ai_quest.get_audit_log(
                            _safe_int(params.get("limit"), 50)
                        )
                    },
                )
        except AIQuestContractError as exc:
            data = dict(exc.data)
            data["retryable"] = exc.retryable
            return make_error(request_id, exc.code, exc.message, data)

        return make_error(
            request_id,
            ErrorCode.EV3_INVALID_COMMAND,
            "AI Quest method is not supported",
            {"method": method, "retryable": False},
        )

    def _session_for_websocket(self, websocket: Any) -> EV3Session:
        return self.sessions.require_session(
            self._client_sessions.get(websocket)
        )

    def _session_id_from_params(
        self,
        websocket: Any,
        params: Dict[str, Any],
    ) -> str:
        return (
            params.get("peripheralId")
            or params.get("brick_id")
            or params.get("sessionId")
            or self._client_sessions.get(websocket)
            or self.sessions.default_brick_id
        )

    def _session_id_from_command(
        self,
        websocket: Any,
        command: Dict[str, Any],
        params: Dict[str, Any],
    ) -> str:
        command_params = command.get("params", {})
        if not isinstance(command_params, dict):
            command_params = {}
        return (
            command.get("peripheralId")
            or command.get("brick_id")
            or command.get("sessionId")
            or params.get("peripheralId")
            or params.get("brick_id")
            or params.get("sessionId")
            or command_params.get("peripheralId")
            or command_params.get("brick_id")
            or command_params.get("sessionId")
            or self._client_sessions.get(websocket)
            or self.sessions.default_brick_id
        )

    def _transport_config_from_params(
        self,
        params: Dict[str, Any],
    ) -> Dict[str, Any]:
        config: Dict[str, Any] = {}
        for key in ("ev3_ip", "ev3_bt", "port", "channel"):
            if params.get(key) not in (None, ""):
                config[key] = params[key]
        return config

    def _rest_session(self, session_id: Optional[str]) -> EV3Session:
        return self.sessions.require_session(session_id)

    def _sensor_snapshot_response(
        self,
        session_id: Optional[str],
        field: str,
    ) -> HttpResponse:
        session = self._rest_session(session_id)
        values = session.router.latest_sensor_data.get(field, {})
        if session_id is None:
            return self._rest_ok(values)
        return self._rest_ok(
            {
                "brick_id": session.brick_id,
                field: values,
            }
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

    def _trainer_error_response(
        self, exc: TrainerPipelineError
    ) -> HttpResponse:
        return self._rest_error(
            400,
            exc.code,
            exc.message,
            retryable=False,
            data=exc.data,
        )

    def _rest_from_json_rpc(self, response: Dict[str, Any]) -> HttpResponse:
        if "error" not in response:
            return self._rest_ok(response.get("result", {}))
        error = response["error"]
        data = error.get("data", {})
        status = 503 if data.get("retryable", False) else 400
        return self._rest_error(
            status,
            str(error.get("code", "AIQUEST_ERROR")),
            str(error.get("message", "AI Quest request failed")),
            retryable=data.get("retryable", False),
            data=data,
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


def _split_path(path: str) -> tuple:
    parsed = urlparse(path)
    return parsed.path, parse_qs(parsed.query)


def _first_query_value(query: Dict[str, Any], key: str) -> Optional[str]:
    values = query.get(key)
    if not values:
        return None
    return str(values[0])


def _safe_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


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
        vsle_adapter_path = os.getenv("WEISILE_VSLE_BT_ADAPTER", "")
        native_vsle_adapter = (
            NativeAdapterProcess(vsle_adapter_path)
            if vsle_adapter_path
            else None
        )
        bluetooth_transport = VSLEBluetoothTransport(
            ev3_bt,
            manager=manager,
            native_adapter=native_vsle_adapter,
        )
        manager.bluetooth_supported = bluetooth_transport.supported

    normalized_transport = str(transport_mode).lower().replace("_", "-")
    if normalized_transport == "wifi" or bluetooth_transport is None:
        transport = wifi_transport
    elif normalized_transport in {"bluetooth", "vsle-bluetooth"}:
        transport = AutoTransport(
            wifi_transport,
            bluetooth_transport,
            manager=manager,
            preferred="vsle-bluetooth",
        )
    else:
        transport = AutoTransport(
            wifi_transport,
            bluetooth_transport,
            manager=manager,
            preferred="wifi",
        )
    return ScratchJsonRpcServer(transport, manager=manager)


def create_multi_ev3_server(
    ev3_ips: Dict[str, str],
    *,
    names: Optional[Dict[str, str]] = None,
    port: int = 8765,
) -> ScratchJsonRpcServer:
    """Create a WiFi-backed Scratch server with one session per EV3 brick."""
    if not ev3_ips:
        raise ValueError("At least one EV3 IP must be configured")

    session_manager = EV3SessionManager()
    first_transport = None
    first_manager = None
    for brick_id, ev3_ip in ev3_ips.items():
        manager = DegradationManager()
        transport = WiFiTransport(ev3_ip, port=port, manager=manager)
        session_manager.add_session(
            brick_id,
            (names or {}).get(brick_id, f"VSLE EV3 {brick_id}"),
            transport,
            manager=manager,
        )
        if first_transport is None:
            first_transport = transport
            first_manager = manager

    return ScratchJsonRpcServer(
        first_transport,
        manager=first_manager,
        session_manager=session_manager,
    )
