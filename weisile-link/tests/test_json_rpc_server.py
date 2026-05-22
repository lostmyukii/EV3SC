import asyncio
import base64
import json

from weisile_link.json_rpc_server import (
    SCRATCH_BT_PATH,
    SCRATCH_LINK_PROTOCOL_VERSION,
    ScratchJsonRpcServer,
)
from weisile_link.runtime.degradation import DegradationManager, TransportKind


class FakeWebSocket:
    def __init__(self, incoming=None):
        self.incoming = list(incoming or [])
        self.sent = []
        self.closed = None

    async def send(self, message):
        self.sent.append(json.loads(message))

    async def close(self, code=None, reason=None):
        self.closed = (code, reason)

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self.incoming:
            raise StopAsyncIteration
        return self.incoming.pop(0)


class FakeTransport:
    def __init__(self, manager=None, connect_result=True):
        self.manager = manager or DegradationManager()
        self.connect_result = connect_result
        self.connected = False
        self.connect_callbacks = []
        self.commands = []
        self.disconnected = False

    async def connect(self, on_sensor_data):
        self.connect_callbacks.append(on_sensor_data)
        self.connected = self.connect_result
        if self.connect_result:
            self.manager.record_reconnected(TransportKind.WIFI)
        else:
            self.manager.record_transport_failure(
                TransportKind.WIFI, "connect refused"
            )
        return self.connect_result

    async def send_command(self, command):
        self.commands.append(command)
        if not self.connected:
            raise ConnectionError("EV3 WiFi transport is disconnected")
        return {
            "type": "ack",
            "id": command["id"],
            "ok": True,
            "normalized": command["params"],
        }

    async def disconnect(self):
        self.disconnected = True
        self.connected = False


def decode_notification_payload(notification):
    encoded = notification["params"]["message"]
    return json.loads(base64.b64decode(encoded.encode("ascii")).decode("utf-8"))


def test_rejects_non_scratch_bt_websocket_path():
    async def scenario():
        server = ScratchJsonRpcServer(FakeTransport())
        websocket = FakeWebSocket()

        await server.handle_client(websocket, "/scratch/ble")

        assert websocket.closed == (1008, "unsupported Scratch Link path")
        assert server.scratch_client_count == 0

    asyncio.run(scenario())


def test_get_version_returns_scratch_link_protocol_envelope():
    async def scenario():
        server = ScratchJsonRpcServer(FakeTransport())
        websocket = FakeWebSocket()

        await server.handle_json_rpc_message(
            websocket,
            json.dumps({"jsonrpc": "2.0", "id": 1, "method": "getVersion"}),
        )

        assert websocket.sent == [
            {
                "jsonrpc": "2.0",
                "id": 1,
                "result": {
                    "protocol": SCRATCH_LINK_PROTOCOL_VERSION,
                    "implementation": "WeisileLink",
                },
            }
        ]

    asyncio.run(scenario())


def test_discover_returns_null_and_notifies_one_wifi_ev3_peripheral():
    async def scenario():
        server = ScratchJsonRpcServer(FakeTransport())
        websocket = FakeWebSocket()

        await server.handle_json_rpc_message(
            websocket,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": "discover-1",
                    "method": "discover",
                    "params": {"filters": [{"namePrefix": "EV3"}]},
                }
            ),
        )

        assert websocket.sent[0] == {
            "jsonrpc": "2.0",
            "id": "discover-1",
            "result": None,
        }
        assert websocket.sent[1] == {
            "jsonrpc": "2.0",
            "method": "didDiscoverPeripheral",
            "params": {
                "peripheralId": "vsle-ev3-wifi",
                "name": "VSLE EV3 WiFi",
                "rssi": 0,
            },
        }

    asyncio.run(scenario())


def test_connect_uses_transport_and_subsequent_ev3_method_maps_ack_to_json_rpc():
    async def scenario():
        manager = DegradationManager()
        transport = FakeTransport(manager=manager)
        server = ScratchJsonRpcServer(transport, manager=manager)
        websocket = FakeWebSocket()

        await server.handle_json_rpc_message(
            websocket,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": "connect-1",
                    "method": "connect",
                    "params": {"peripheralId": "vsle-ev3-wifi"},
                }
            ),
        )
        await server.handle_json_rpc_message(
            websocket,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": "cmd-1",
                    "method": "motor.runTimed",
                    "params": {"port": "a", "speed": 125, "time": 90},
                }
            ),
        )

        assert websocket.sent[0] == {
            "jsonrpc": "2.0",
            "id": "connect-1",
            "result": None,
        }
        assert transport.commands == [
            {
                "id": "cmd-1",
                "method": "motor.runTimed",
                "params": {"port": "a", "speed": 125, "time": 90},
            }
        ]
        assert websocket.sent[1] == {
            "jsonrpc": "2.0",
            "id": "cmd-1",
            "result": {
                "type": "ack",
                "id": "cmd-1",
                "ok": True,
                "normalized": {"port": "a", "speed": 125, "time": 90},
            },
        }

    asyncio.run(scenario())


def test_send_method_accepts_high_level_command_wrapper():
    async def scenario():
        transport = FakeTransport()
        transport.connected = True
        transport.manager.record_reconnected(TransportKind.WIFI)
        server = ScratchJsonRpcServer(transport, manager=transport.manager)
        websocket = FakeWebSocket()

        await server.handle_json_rpc_message(
            websocket,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": "send-1",
                    "method": "send",
                    "params": {
                        "method": "motor.stop",
                        "params": {"port": "A"},
                    },
                }
            ),
        )

        assert transport.commands == [
            {
                "id": "send-1",
                "method": "motor.stop",
                "params": {"port": "A"},
            }
        ]
        assert websocket.sent[0]["result"]["ok"] is True

    asyncio.run(scenario())


def test_command_without_transport_returns_json_rpc_transport_error():
    async def scenario():
        manager = DegradationManager()
        manager.record_transport_failure(TransportKind.WIFI, "not connected")
        server = ScratchJsonRpcServer(
            FakeTransport(manager=manager, connect_result=False),
            manager=manager,
        )
        websocket = FakeWebSocket()

        await server.handle_json_rpc_message(
            websocket,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": "cmd-2",
                    "method": "motor.stop",
                    "params": {"port": "A"},
                }
            ),
        )

        assert websocket.sent == [
            {
                "jsonrpc": "2.0",
                "id": "cmd-2",
                "error": {
                    "code": "EV3_TRANSPORT_DISCONNECTED",
                    "message": "No active BT/WiFi transport",
                    "data": {
                        "method": "motor.stop",
                        "wifi_failed": True,
                        "bluetooth_failed": False,
                        "retryable": True,
                    },
                },
            }
        ]

    asyncio.run(scenario())


def test_start_notifications_broadcasts_vsle_and_official_scratch_messages():
    async def scenario():
        server = ScratchJsonRpcServer(FakeTransport())
        websocket = FakeWebSocket()

        await server.handle_json_rpc_message(
            websocket,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": "sub-1",
                    "method": "startNotifications",
                }
            ),
        )
        await server.handle_sensor_data(
            {
                "type": "sensor_update",
                "timestamp": 123.456,
                "sensors": {"S2": {"distance_cm": 24.5}},
            }
        )

        assert websocket.sent[0] == {
            "jsonrpc": "2.0",
            "id": "sub-1",
            "result": None,
        }
        vsle_notification = websocket.sent[1]
        official_notification = websocket.sent[2]
        assert vsle_notification["method"] == "notifyDeviceDidReceiveMessage"
        assert official_notification["method"] == "didReceiveMessage"
        assert decode_notification_payload(vsle_notification) == {
            "type": "sensor_update",
            "timestamp": 123.456,
            "sensors": {"S2": {"distance_cm": 24.5}},
        }
        assert official_notification["params"] == vsle_notification["params"]

    asyncio.run(scenario())


def test_invalid_json_rpc_returns_structured_error_with_null_id():
    async def scenario():
        server = ScratchJsonRpcServer(FakeTransport())
        websocket = FakeWebSocket()

        await server.handle_json_rpc_message(websocket, "{not json")

        assert websocket.sent == [
            {
                "jsonrpc": "2.0",
                "id": None,
                "error": {
                    "code": "EV3_INVALID_COMMAND",
                    "message": "Invalid JSON-RPC request JSON",
                    "data": {"retryable": False},
                },
            }
        ]

    asyncio.run(scenario())


def test_json_rpc_notification_registers_without_response():
    async def scenario():
        server = ScratchJsonRpcServer(FakeTransport())
        websocket = FakeWebSocket()

        await server.handle_json_rpc_message(
            websocket,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "method": "startNotifications",
                }
            ),
        )

        assert websocket.sent == []
        assert websocket in server.notification_clients

    asyncio.run(scenario())


def test_status_response_uses_observability_baseline_and_client_count():
    server = ScratchJsonRpcServer(FakeTransport())
    server.scratch_clients.add(object())

    response = server.handle_get("/api/status")
    body = json.loads(response.body)

    assert response.status == 200
    assert response.headers == {"content-type": "application/json"}
    assert body["scratch_clients"] == 1
    assert body["transport"] is None
    assert "sensor_hz" in body


def test_run_binds_localhost_default_scratch_port_and_path_handler():
    async def scenario():
        calls = []

        async def fake_serve(handler, host, port, **kwargs):
            calls.append((handler, host, port, kwargs))

            class FakeServer:
                async def serve_forever(self):
                    return None

            return FakeServer()

        server = ScratchJsonRpcServer(FakeTransport())

        await server.run(serve=fake_serve)

        assert calls
        handler, host, port, kwargs = calls[0]
        assert handler == server.handle_client
        assert host == "127.0.0.1"
        assert port == 20111
        assert kwargs["ping_interval"] == 5
        assert server.path == SCRATCH_BT_PATH

    asyncio.run(scenario())
