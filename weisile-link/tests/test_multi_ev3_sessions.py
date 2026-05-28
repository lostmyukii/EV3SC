import asyncio
import base64
import inspect
import json

from weisile_link.json_rpc_server import (
    ScratchJsonRpcServer,
    create_multi_ev3_server,
)
from weisile_link.runtime.degradation import DegradationManager, TransportKind
from weisile_link.sessions import EV3SessionManager


class FakeWebSocket:
    def __init__(self):
        self.sent = []

    async def send(self, message):
        self.sent.append(json.loads(message))

    def __aiter__(self):
        return self

    async def __anext__(self):
        raise StopAsyncIteration


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
    def __init__(self, manager):
        self.manager = manager
        self.connected = False
        self.connect_callbacks = []
        self.commands = []
        self.disconnected = False
        self.transport_switches = []
        self.active_transport_name = "wifi"

    async def connect(self, on_sensor_data):
        self.connect_callbacks.append(on_sensor_data)
        self.connected = True
        self.manager.record_reconnected(TransportKind.WIFI)
        return True

    async def send_command(self, command):
        self.commands.append(command)
        if not self.connected:
            raise ConnectionError("EV3 WiFi transport is disconnected")
        return {
            "type": "ack",
            "id": command["id"],
            "ok": True,
            "session": command.get("peripheralId"),
        }

    async def disconnect(self):
        self.disconnected = True
        self.connected = False

    async def set_transport(self, transport, on_sensor_data):
        self.transport_switches.append(
            (transport, inspect.iscoroutinefunction(on_sensor_data))
        )
        self.active_transport_name = transport
        return {"transport": transport}


def build_server():
    left_manager = DegradationManager()
    right_manager = DegradationManager()
    left_transport = FakeTransport(left_manager)
    right_transport = FakeTransport(right_manager)
    sessions = EV3SessionManager()
    sessions.add_session(
        "ev3-left",
        "VSLE EV3 Left",
        left_transport,
        manager=left_manager,
    )
    sessions.add_session(
        "ev3-right",
        "VSLE EV3 Right",
        right_transport,
        manager=right_manager,
    )
    server = ScratchJsonRpcServer(
        left_transport,
        manager=left_manager,
        session_manager=sessions,
    )
    return server, left_transport, right_transport


def decode_notification(notification):
    encoded = notification["params"]["message"]
    return json.loads(base64.b64decode(encoded.encode("ascii")).decode("utf-8"))


def sensor_payload(label, value):
    return {
        "type": "sensor_update",
        "timestamp": 1716387600 + value,
        "sensors": {
            "S2": {
                "type": "ultrasonic",
                "distance_cm": value,
            }
        },
        "motors": {"A": {"position": value}},
        "system": {
            "collecting": True,
            "collect_label": label,
            "battery_pct": 90,
        },
    }


def test_discover_lists_all_configured_ev3_sessions():
    async def scenario():
        server, _left, _right = build_server()
        websocket = FakeWebSocket()

        await server.handle_json_rpc_message(
            websocket,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": "discover-1",
                    "method": "discover",
                }
            ),
        )

        peripherals = [
            message["params"]
            for message in websocket.sent
            if message.get("method") == "didDiscoverPeripheral"
        ]
        assert peripherals == [
            {
                "peripheralId": "ev3-left",
                "name": "VSLE EV3 Left",
                "rssi": 0,
            },
            {
                "peripheralId": "ev3-right",
                "name": "VSLE EV3 Right",
                "rssi": 0,
            },
        ]

    asyncio.run(scenario())


def test_connect_and_command_route_to_selected_ev3_session_only():
    async def scenario():
        server, left, right = build_server()
        websocket = FakeWebSocket()

        await server.handle_json_rpc_message(
            websocket,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": "connect-right",
                    "method": "connect",
                    "params": {"peripheralId": "ev3-right"},
                }
            ),
        )
        await server.handle_json_rpc_message(
            websocket,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": "cmd-right",
                    "method": "motor.stop",
                    "params": {"port": "A"},
                }
            ),
        )

        assert left.connect_callbacks == []
        assert left.commands == []
        assert len(right.connect_callbacks) == 1
        assert right.commands == [
            {
                "id": "cmd-right",
                "method": "motor.stop",
                "params": {"port": "A"},
                "peripheralId": "ev3-right",
            }
        ]

    asyncio.run(scenario())


def test_scratch_notifications_are_isolated_per_connected_ev3_session():
    async def scenario():
        server, _left, _right = build_server()
        left_ws = FakeWebSocket()
        right_ws = FakeWebSocket()
        for websocket, peripheral_id in (
            (left_ws, "ev3-left"),
            (right_ws, "ev3-right"),
        ):
            await server.handle_json_rpc_message(
                websocket,
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": f"connect-{peripheral_id}",
                        "method": "connect",
                        "params": {"peripheralId": peripheral_id},
                    }
                ),
            )
            await server.handle_json_rpc_message(
                websocket,
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": f"sub-{peripheral_id}",
                        "method": "startNotifications",
                    }
                ),
            )

        await server.handle_session_sensor_data(
            "ev3-left",
            sensor_payload("left", 12),
        )
        await server.handle_session_sensor_data(
            "ev3-right",
            sensor_payload("right", 34),
        )

        left_payloads = [
            decode_notification(message)
            for message in left_ws.sent
            if message.get("method") == "didReceiveMessage"
        ]
        right_payloads = [
            decode_notification(message)
            for message in right_ws.sent
            if message.get("method") == "didReceiveMessage"
        ]
        assert [payload["brick_id"] for payload in left_payloads] == [
            "ev3-left"
        ]
        assert [
            payload["system"]["collect_label"] for payload in left_payloads
        ] == ["left"]
        assert [payload["brick_id"] for payload in right_payloads] == [
            "ev3-right"
        ]
        assert [
            payload["system"]["collect_label"] for payload in right_payloads
        ] == ["right"]

    asyncio.run(scenario())


def test_trainer_receives_all_sessions_with_brick_identity_and_rest_filters():
    async def scenario():
        server, _left, _right = build_server()
        trainer = HoldingWebSocket()
        task = asyncio.create_task(server.handle_trainer_client(trainer))
        while server.trainer_client_count == 0 or trainer.release is None:
            await asyncio.sleep(0)

        await server.handle_session_sensor_data(
            "ev3-left",
            sensor_payload("left", 12),
        )
        await server.handle_session_sensor_data(
            "ev3-right",
            sensor_payload("right", 34),
        )

        trainer_streams = [
            message
            for message in trainer.sent
            if message["type"] == "sensor_stream"
        ]
        assert [stream["brick_id"] for stream in trainer_streams] == [
            "ev3-left",
            "ev3-right",
        ]
        left_rows = json.loads(
            server.handle_get("/api/data/collected?brick_id=ev3-left").body
        )
        right_sensors = json.loads(
            server.handle_get("/api/ev3/sensors?brick_id=ev3-right").body
        )
        assert left_rows["data"]["rows"][0]["label"] == "left"
        assert right_sensors["data"]["brick_id"] == "ev3-right"
        assert right_sensors["data"]["sensors"]["S2"]["distance_cm"] == 34

        trainer.stop()
        await task

    asyncio.run(scenario())


def test_status_reports_each_ev3_session_health_and_client_counts():
    async def scenario():
        server, _left, _right = build_server()
        websocket = FakeWebSocket()
        await server.handle_json_rpc_message(
            websocket,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": "connect-left",
                    "method": "connect",
                    "params": {"peripheralId": "ev3-left"},
                }
            ),
        )
        await server.handle_json_rpc_message(
            websocket,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": "sub-left",
                    "method": "startNotifications",
                }
            ),
        )
        await server.handle_session_sensor_data(
            "ev3-left",
            sensor_payload("left", 12),
        )

        status = json.loads(server.handle_get("/api/status").body)

        assert status["ev3_sessions"] == [
            {
                "brick_id": "ev3-left",
                "name": "VSLE EV3 Left",
                "connected": True,
                "transport": "wifi",
                "transport_capability": None,
                "native_adapter_path": None,
                "native_adapter_status": None,
                "last_unsupported_capability": None,
                "scratch_clients": 1,
                "trainer_clients": 0,
                "collected_points": 1,
            },
            {
                "brick_id": "ev3-right",
                "name": "VSLE EV3 Right",
                "connected": False,
                "transport": None,
                "transport_capability": None,
                "native_adapter_path": None,
                "native_adapter_status": None,
                "last_unsupported_capability": None,
                "scratch_clients": 0,
                "trainer_clients": 0,
                "collected_points": 0,
            },
        ]

    asyncio.run(scenario())


def test_direct_rest_command_uses_requested_brick_id():
    async def scenario():
        server, left, right = build_server()
        left.connected = True
        right.connected = True
        await server.handle_post(
            "/api/ev3/command",
            json.dumps(
                {
                    "brick_id": "ev3-right",
                    "method": "motor.stop",
                    "params": {"port": "B"},
                }
            ),
        )

        assert left.commands == []
        assert right.commands[-1]["peripheralId"] == "ev3-right"
        assert right.commands[-1]["params"] == {"port": "B"}

    asyncio.run(scenario())


def test_create_multi_ev3_server_builds_wifi_sessions_without_connecting():
    server = create_multi_ev3_server(
        {
            "ev3-left": "192.168.10.21",
            "ev3-right": "192.168.10.22",
        }
    )

    assert server.sessions.peripheral_payloads() == [
        {
            "peripheralId": "ev3-left",
            "name": "VSLE EV3 ev3-left",
            "rssi": 0,
        },
        {
            "peripheralId": "ev3-right",
            "name": "VSLE EV3 ev3-right",
            "rssi": 0,
        },
    ]
    assert server.sessions.require_session("ev3-left").transport.uri == (
        "ws://192.168.10.21:8765"
    )
    assert server.sessions.require_session("ev3-right").transport.uri == (
        "ws://192.168.10.22:8765"
    )
