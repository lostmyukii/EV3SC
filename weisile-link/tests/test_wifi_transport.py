import asyncio
import json

import pytest

from weisile_link.protocol.errors import ValidationError
from weisile_link.runtime.degradation import DegradationManager, TransportKind
from weisile_link.transport.wifi_transport import WiFiTransport


STOP = object()


class FakeWebSocket:
    def __init__(self, incoming=None):
        self.incoming = asyncio.Queue()
        self.sent = []
        self.closed = None
        for payload in incoming or []:
            self.feed(payload)

    def feed(self, payload):
        if isinstance(payload, str):
            self.incoming.put_nowait(payload)
        else:
            self.incoming.put_nowait(json.dumps(payload))

    def close_stream(self):
        self.incoming.put_nowait(STOP)

    async def recv(self):
        payload = await self.incoming.get()
        if payload is STOP:
            raise ConnectionError("websocket closed")
        return payload

    async def send(self, message):
        self.sent.append(json.loads(message))

    async def close(self, code=None, reason=None):
        self.closed = (code, reason)
        self.close_stream()

    def __aiter__(self):
        return self

    async def __anext__(self):
        payload = await self.incoming.get()
        if payload is STOP:
            raise StopAsyncIteration
        return payload


def test_connect_pairs_and_routes_sensor_updates_to_callback_and_cache():
    async def scenario():
        websocket = FakeWebSocket(
            [{"type": "ack", "id": "auth.pair", "ok": True}]
        )
        calls = []

        async def connector(uri, **kwargs):
            calls.append((uri, kwargs))
            return websocket

        async def on_sensor_data(payload):
            sensor_updates.append(payload)

        sensor_updates = []
        manager = DegradationManager()
        transport = WiFiTransport(
            "10.0.0.7",
            connector=connector,
            manager=manager,
            pairing_token="secret",
            monotonic_ms=lambda: 1_000,
        )

        connected = await transport.connect(on_sensor_data)
        websocket.feed(
            {
                "type": "sensor_update",
                "timestamp": 123.456,
                "sensors": {"S2": {"distance_cm": 24.5}},
                "motors": {"A": {"speed": 0}},
                "system": {"battery_pct": 88},
            }
        )
        await asyncio.sleep(0)

        assert connected is True
        assert calls == [("ws://10.0.0.7:8765", {"ping_interval": 5})]
        assert websocket.sent == [
            {
                "id": "auth.pair",
                "method": "auth.pair",
                "params": {"token": "secret"},
            }
        ]
        assert sensor_updates[0]["sensors"]["S2"]["distance_cm"] == 24.5
        assert manager.connection_state.connected is True
        assert manager.connection_state.active_transport == TransportKind.WIFI
        cached = manager.get_sensor_value(
            "sensors.S2.distance_cm",
            now_ms=1_050,
            default=0,
        )
        assert cached.value == 24.5
        assert cached.stale is False

        await transport.disconnect()

    asyncio.run(scenario())


def test_configure_endpoint_updates_wifi_uri_before_connection():
    transport = WiFiTransport("192.168.1.100", port=8765)

    result = transport.configure_endpoint(ev3_ip="10.0.0.9", port=9000)

    assert result == {"ev3_ip": "10.0.0.9", "port": 9000}
    assert transport.ev3_ip == "10.0.0.9"
    assert transport.port == 9000
    assert transport.uri == "ws://10.0.0.9:9000"


def test_connect_disables_websocket_proxy_for_direct_ev3_endpoint():
    async def scenario():
        websocket = FakeWebSocket()
        calls = []

        async def connector(uri, *, ping_interval=None, proxy=True):
            calls.append(
                {
                    "uri": uri,
                    "ping_interval": ping_interval,
                    "proxy": proxy,
                }
            )
            return websocket

        transport = WiFiTransport(
            "169.254.64.103",
            connector=connector,
            pairing_token="",
        )

        assert await transport.connect(lambda _payload: None) is True
        assert calls == [
            {
                "uri": "ws://169.254.64.103:8765",
                "ping_interval": 5,
                "proxy": None,
            }
        ]

        await transport.disconnect()

    asyncio.run(scenario())


def test_send_command_validates_normalizes_and_resolves_ack_from_receive_loop():
    async def scenario():
        websocket = FakeWebSocket()

        async def connector(_uri, **_kwargs):
            return websocket

        transport = WiFiTransport("ev3dev.local", connector=connector)
        assert await transport.connect(lambda _payload: None) is True

        command_task = asyncio.create_task(
            transport.send_command(
                {
                    "id": "cmd-1",
                    "method": "motor.runTimed",
                    "params": {"port": "a", "speed": 125, "time": 90},
                }
            )
        )
        await asyncio.sleep(0)

        assert websocket.sent == [
            {
                "id": "cmd-1",
                "method": "motor.runTimed",
                "params": {"port": "A", "speed": 100, "time": 60},
            }
        ]

        websocket.feed({"type": "ack", "id": "cmd-1", "ok": True})
        ack = await command_task

        assert ack == {"type": "ack", "id": "cmd-1", "ok": True}
        assert transport.pending_command_ids == ()

        await transport.disconnect()

    asyncio.run(scenario())


def test_validation_failure_never_sends_partial_command_to_ev3():
    async def scenario():
        websocket = FakeWebSocket()

        async def connector(_uri, **_kwargs):
            return websocket

        transport = WiFiTransport("ev3dev.local", connector=connector)
        assert await transport.connect(lambda _payload: None) is True

        with pytest.raises(ValidationError):
            await transport.send_command(
                {"id": "cmd-1", "method": "motor.fly", "params": {}}
            )

        assert websocket.sent == []

        await transport.disconnect()

    asyncio.run(scenario())


def test_command_timeout_records_wifi_failure_and_clears_pending_command():
    async def scenario():
        websocket = FakeWebSocket()
        manager = DegradationManager()

        async def connector(_uri, **_kwargs):
            return websocket

        transport = WiFiTransport(
            "ev3dev.local",
            connector=connector,
            manager=manager,
            command_timeout_s=0.01,
        )
        assert await transport.connect(lambda _payload: None) is True

        with pytest.raises(TimeoutError):
            await transport.send_command(
                {
                    "id": "cmd-timeout",
                    "method": "motor.stop",
                    "params": {"port": "A"},
                }
            )

        assert transport.pending_command_ids == ()
        assert manager.connection_state.connected is False
        assert manager.connection_state.wifi_failed is True

        await transport.disconnect()

    asyncio.run(scenario())


def test_pairing_failure_closes_socket_and_records_transport_failure():
    async def scenario():
        websocket = FakeWebSocket(
            [
                {
                    "type": "ack",
                    "id": "auth.pair",
                    "ok": False,
                    "code": "EV3_INVALID_COMMAND",
                }
            ]
        )
        manager = DegradationManager()

        async def connector(_uri, **_kwargs):
            return websocket

        transport = WiFiTransport(
            "ev3dev.local",
            connector=connector,
            manager=manager,
            pairing_token="bad",
        )

        assert await transport.connect(lambda _payload: None) is False
        assert websocket.closed == (1008, "pairing failed")
        assert manager.connection_state.connected is False
        assert manager.connection_state.wifi_failed is True

    asyncio.run(scenario())


def test_disconnect_rejects_pending_commands_and_marks_transport_down():
    async def scenario():
        websocket = FakeWebSocket()
        manager = DegradationManager()

        async def connector(_uri, **_kwargs):
            return websocket

        transport = WiFiTransport(
            "ev3dev.local",
            connector=connector,
            manager=manager,
            command_timeout_s=1,
        )
        assert await transport.connect(lambda _payload: None) is True

        command_task = asyncio.create_task(
            transport.send_command(
                {
                    "id": "cmd-disconnect",
                    "method": "motor.stop",
                    "params": {"port": "A"},
                }
            )
        )
        await asyncio.sleep(0)
        websocket.close_stream()

        with pytest.raises(ConnectionError):
            await command_task

        assert transport.pending_command_ids == ()
        assert manager.connection_state.connected is False
        assert manager.connection_state.wifi_failed is True

    asyncio.run(scenario())
