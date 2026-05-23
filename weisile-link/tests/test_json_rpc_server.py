import asyncio
import base64
import inspect
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


class HoldingWebSocket(FakeWebSocket):
    def __init__(self):
        super().__init__()
        self.release = None

    def __aiter__(self):
        self.release = asyncio.Event()
        return self

    async def __anext__(self):
        await self.release.wait()
        raise StopAsyncIteration

    def stop(self):
        self.release.set()


class FakeTransport:
    def __init__(self, manager=None, connect_result=True):
        self.manager = manager or DegradationManager()
        self.connect_result = connect_result
        self.connected = False
        self.connect_callbacks = []
        self.commands = []
        self.disconnected = False
        self.transport_switches = []
        self.active_transport_name = "wifi"

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

    async def set_transport(self, transport, on_sensor_data, **config):
        self.transport_switches.append(
            (transport, inspect.iscoroutinefunction(on_sensor_data), config)
        )
        self.active_transport_name = transport
        return {"transport": transport}


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


def test_accepts_websockets_connection_object_request_path():
    async def scenario():
        server = ScratchJsonRpcServer(FakeTransport())
        websocket = FakeWebSocket(
            [
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": "version-1",
                        "method": "getVersion",
                    }
                )
            ]
        )
        websocket.request = type(
            "Request",
            (),
            {"path": SCRATCH_BT_PATH},
        )()

        await server.handle_client(websocket)

        assert websocket.closed is None
        assert websocket.sent[0]["id"] == "version-1"
        assert websocket.sent[0]["result"]["protocol"] == (
            SCRATCH_LINK_PROTOCOL_VERSION
        )

    asyncio.run(scenario())


def test_rejects_untrusted_browser_origin_before_accepting_client():
    async def scenario():
        server = ScratchJsonRpcServer(FakeTransport())
        websocket = FakeWebSocket(
            [
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": "cmd-evil",
                        "method": "motor.stopAll",
                    }
                )
            ]
        )
        websocket.request = type(
            "Request",
            (),
            {
                "path": SCRATCH_BT_PATH,
                "headers": {"Origin": "https://evil.example"},
            },
        )()

        await server.handle_client(websocket)

        assert websocket.closed == (1008, "origin not allowed")
        assert websocket.sent == []
        assert server.scratch_client_count == 0

    asyncio.run(scenario())


def test_accepts_allowed_local_browser_origin():
    async def scenario():
        server = ScratchJsonRpcServer(FakeTransport())
        websocket = FakeWebSocket(
            [
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": "version-local",
                        "method": "getVersion",
                    }
                )
            ]
        )
        websocket.request = type(
            "Request",
            (),
            {
                "path": SCRATCH_BT_PATH,
                "headers": {"Origin": "http://localhost:3001"},
            },
        )()

        await server.handle_client(websocket)

        assert websocket.closed is None
        assert websocket.sent[0]["id"] == "version-local"

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
                "peripheralId": "vsle-ev3-wifi",
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
                "peripheralId": "vsle-ev3-wifi",
            }
        ]
        assert websocket.sent[0]["result"]["ok"] is True

    asyncio.run(scenario())


def test_set_transport_delegates_to_transport_selector():
    async def scenario():
        transport = FakeTransport()
        server = ScratchJsonRpcServer(transport, manager=transport.manager)
        websocket = FakeWebSocket()

        await server.handle_json_rpc_message(
            websocket,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": "transport-1",
                    "method": "vsle.setTransport",
                    "params": {"transport": "bluetooth"},
                }
            ),
        )

        assert transport.transport_switches == [("bluetooth", True, {})]
        assert websocket.sent == [
            {
                "jsonrpc": "2.0",
                "id": "transport-1",
                "result": {"transport": "bluetooth"},
            }
        ]

    asyncio.run(scenario())


def test_set_transport_passes_modal_endpoint_configuration():
    async def scenario():
        transport = FakeTransport()
        server = ScratchJsonRpcServer(transport, manager=transport.manager)
        websocket = FakeWebSocket()

        await server.handle_json_rpc_message(
            websocket,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": "transport-2",
                    "method": "vsle.setTransport",
                    "params": {
                        "transport": "wifi",
                        "ev3_ip": "192.168.5.42",
                        "ev3_bt": "00:16:53:AA:BB:CC",
                    },
                }
            ),
        )

        assert transport.transport_switches == [
            (
                "wifi",
                True,
                {
                    "ev3_ip": "192.168.5.42",
                    "ev3_bt": "00:16:53:AA:BB:CC",
                },
            )
        ]
        assert websocket.sent[0]["result"] == {"transport": "wifi"}

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
            "brick_id": "vsle-ev3-wifi",
            "brick_name": "VSLE EV3 WiFi",
        }
        assert official_notification["params"] == vsle_notification["params"]

    asyncio.run(scenario())


def test_trainer_websocket_receives_sensor_stream_and_status_counts_client():
    async def scenario():
        server = ScratchJsonRpcServer(FakeTransport())
        trainer = HoldingWebSocket()
        task = asyncio.create_task(server.handle_trainer_client(trainer))
        while server.trainer_client_count == 0 or trainer.release is None:
            await asyncio.sleep(0)

        await server.handle_sensor_data(
            {
                "type": "sensor_update",
                "timestamp": 1716387600.123,
                "sensors": {
                    "S1": {
                        "type": "color",
                        "reflected": 45,
                        "ambient": 12,
                        "color": 3,
                    }
                },
                "motors": {"A": {"position": 360}},
                "system": {
                    "battery_pct": 87,
                    "collecting": True,
                    "collect_label": "obstacle",
                },
            }
        )

        status = json.loads(server.handle_get("/api/status").body)
        assert server.trainer_client_count == 1
        assert status["trainer_clients"] == 1
        assert trainer.sent == [
            {
                "type": "sensor_stream",
                "t": 1716387600123,
                "brick_id": "vsle-ev3-wifi",
                "brick_name": "VSLE EV3 WiFi",
                "color_reflected": 45,
                "color_ambient": 12,
                "color_id": 3,
                "ultrasonic_cm": 0,
                "gyro_angle": 0,
                "gyro_rate": 0,
                "touch_pressed": False,
                "motor_a_pos": 360,
                "motor_b_pos": 0,
                "battery_pct": 87,
                "collecting": True,
                "label": "obstacle",
            }
        ]

        trainer.stop()
        await task
        assert server.trainer_client_count == 0

    asyncio.run(scenario())


def test_upload_to_trainer_reports_unavailable_without_trainer_client():
    async def scenario():
        server = ScratchJsonRpcServer(FakeTransport())
        websocket = FakeWebSocket()

        await server.handle_json_rpc_message(
            websocket,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": "upload-1",
                    "method": "data.uploadToTrainer",
                }
            ),
        )

        assert websocket.sent == [
            {
                "jsonrpc": "2.0",
                "id": "upload-1",
                "error": {
                    "code": "TRAINER_UNAVAILABLE",
                    "message": (
                        "WeisileAI Trainer subscription/upload unavailable"
                    ),
                    "data": {"retryable": True},
                },
            }
        ]

    asyncio.run(scenario())


def test_upload_to_trainer_succeeds_when_subscription_path_is_active():
    async def scenario():
        transport = FakeTransport()
        transport.connected = True
        transport.manager.record_reconnected(TransportKind.WIFI)
        server = ScratchJsonRpcServer(transport, manager=transport.manager)
        trainer = HoldingWebSocket()
        task = asyncio.create_task(server.handle_trainer_client(trainer))
        while server.trainer_client_count == 0 or trainer.release is None:
            await asyncio.sleep(0)
        await server.handle_sensor_data(
            {
                "type": "sensor_update",
                "timestamp": 1716387600.123,
                "sensors": {"S4": {"type": "touch", "pressed": True}},
                "motors": {},
                "system": {"collecting": True, "collect_label": "touch"},
            }
        )

        websocket = FakeWebSocket()
        await server.handle_json_rpc_message(
            websocket,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": "upload-2",
                    "method": "data.uploadToTrainer",
                }
            ),
        )

        assert transport.commands == []
        assert websocket.sent == [
            {
                "jsonrpc": "2.0",
                "id": "upload-2",
                "result": {
                    "uploaded_points": 1,
                    "trainer_clients": 1,
                },
            }
        ]

        trainer.stop()
        await task

    asyncio.run(scenario())


def test_internal_trainer_rest_routes_use_common_envelope():
    async def scenario():
        transport = FakeTransport()
        transport.connected = True
        transport.manager.record_reconnected(TransportKind.WIFI)
        server = ScratchJsonRpcServer(transport, manager=transport.manager)
        await server.handle_sensor_data(
            {
                "type": "sensor_update",
                "timestamp": 1716387600.123,
                "sensors": {"S2": {"type": "ultrasonic", "distance_cm": 9.5}},
                "motors": {"B": {"position": -180}},
                "system": {"collecting": True, "collect_label": "near"},
            }
        )

        sensors = json.loads(server.handle_get("/api/ev3/sensors").body)
        motors = json.loads(server.handle_get("/api/ev3/motors").body)
        collected = json.loads(server.handle_get("/api/data/collected").body)
        export = json.loads((await server.handle_post("/api/data/export")).body)
        command = json.loads(
            (
                await server.handle_post(
                    "/api/ev3/command",
                    json.dumps(
                        {
                            "method": "motor.stop",
                            "params": {"port": "A"},
                        }
                    ),
                )
            ).body
        )
        cleared = json.loads((await server.handle_post("/api/data/clear")).body)

        assert sensors["ok"] is True
        assert sensors["data"] == {
            "S2": {"type": "ultrasonic", "distance_cm": 9.5}
        }
        assert motors["data"] == {"B": {"position": -180}}
        assert collected["data"]["count"] == 1
        assert collected["data"]["rows"][0]["label"] == "near"
        assert export["data"]["filename"] == "vsle_ev3_data.csv"
        assert "ultrasonic_cm" in export["data"]["csv"]
        assert command["data"]["ok"] is True
        assert transport.commands[-1]["method"] == "motor.stop"
        assert cleared["data"] == {"cleared_points": 1}
        assert server.sensor_router.buffer.rows() == []

    asyncio.run(scenario())


def test_trainer_rest_train_and_export_complete_ai_quest_pipeline():
    async def scenario():
        transport = FakeTransport()
        transport.connected = True
        transport.manager.record_reconnected(TransportKind.WIFI)
        server = ScratchJsonRpcServer(transport, manager=transport.manager)
        trainer = HoldingWebSocket()
        task = asyncio.create_task(server.handle_trainer_client(trainer))
        while server.trainer_client_count == 0 or trainer.release is None:
            await asyncio.sleep(0)

        for distance, label in (
            (8.0, "obstacle"),
            (12.0, "obstacle"),
            (35.0, "safe"),
            (42.0, "safe"),
        ):
            await server.handle_sensor_data(
                {
                    "type": "sensor_update",
                    "timestamp": 1716387600.123,
                    "sensors": {
                        "S2": {
                            "type": "ultrasonic",
                            "distance_cm": distance,
                        }
                    },
                    "motors": {"A": {"position": 0}},
                    "system": {
                        "collecting": True,
                        "collect_label": label,
                    },
                }
            )

        websocket = FakeWebSocket()
        await server.handle_json_rpc_message(
            websocket,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": "upload-e2e",
                    "method": "data.uploadToTrainer",
                }
            ),
        )
        trained = json.loads(
            (
                await server.handle_post(
                    "/api/trainer/train",
                    json.dumps({"accuracy_gate": 0.7}),
                )
            ).body
        )
        exported = json.loads(
            (await server.handle_post("/api/trainer/export")).body
        )
        model_rules = json.loads(exported["data"]["json"])

        assert websocket.sent[0]["result"] == {
            "uploaded_points": 4,
            "trainer_clients": 1,
        }
        assert trained["ok"] is True
        assert trained["data"]["accuracy"] == 1.0
        assert trained["data"]["model"]["rule"]["feature"] == "ultrasonic_cm"
        assert exported["ok"] is True
        assert exported["data"]["filename"] == "model_rules.json"
        assert exported["data"]["accuracy"] == 1.0
        assert model_rules["model"]["type"] == "decision_tree"
        assert model_rules["privacy"]["studentDataIncluded"] is False
        assert "rows" not in model_rules
        assert transport.commands == []

        trainer.stop()
        await task

    asyncio.run(scenario())


def test_trainer_rest_export_requires_trained_model():
    async def scenario():
        server = ScratchJsonRpcServer(FakeTransport())

        response = json.loads(
            (await server.handle_post("/api/trainer/export")).body
        )

        assert response["ok"] is False
        assert response["error"] == {
            "code": "TRAINER_MODEL_NOT_TRAINED",
            "message": "Train a WeisileAI model before exporting rules",
            "retryable": False,
        }

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


def test_run_trainer_binds_localhost_default_trainer_port():
    async def scenario():
        calls = []

        async def fake_serve(handler, host, port, **kwargs):
            calls.append((handler, host, port, kwargs))

            class FakeServer:
                async def serve_forever(self):
                    return None

            return FakeServer()

        server = ScratchJsonRpcServer(FakeTransport())

        await server.run_trainer(serve=fake_serve)

        handler, host, port, kwargs = calls[0]
        assert handler == server.handle_trainer_client
        assert host == "127.0.0.1"
        assert port == 8766
        assert kwargs["ping_interval"] == 5

    asyncio.run(scenario())
