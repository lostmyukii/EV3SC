import asyncio

from weisile_link.runtime.degradation import DegradationManager, TransportKind
from weisile_link.transport.selector import AutoTransport


class FakeTransport:
    def __init__(self, kind, manager, connect_result=True):
        self.kind = kind
        self.manager = manager
        self.connect_result = connect_result
        self.connect_calls = 0
        self.commands = []
        self.disconnected = False

    async def connect(self, on_sensor_data):
        self.connect_calls += 1
        if self.connect_result:
            self.manager.record_reconnected(self.kind)
        else:
            self.manager.record_transport_failure(self.kind, "connect failed")
        return self.connect_result

    async def send_command(self, command):
        self.commands.append(command)
        return {"type": "ack", "id": command["id"], "ok": True}

    async def disconnect(self):
        self.disconnected = True


def test_auto_transport_falls_back_to_bluetooth_when_wifi_fails():
    async def scenario():
        manager = DegradationManager(bluetooth_supported=True)
        wifi = FakeTransport(TransportKind.WIFI, manager, connect_result=False)
        bluetooth = FakeTransport(
            TransportKind.BLUETOOTH, manager, connect_result=True
        )
        transport = AutoTransport(wifi, bluetooth, manager=manager)

        connected = await transport.connect(lambda _payload: None)
        ack = await transport.send_command(
            {"id": "cmd-1", "method": "motor.stop", "params": {"port": "A"}}
        )

        assert connected is True
        assert wifi.connect_calls == 1
        assert bluetooth.connect_calls == 1
        assert transport.active_transport_name == "vsle-bluetooth"
        assert manager.connection_state.active_transport == (
            TransportKind.BLUETOOTH
        )
        assert manager.connection_state.transport_label == "vsle-bluetooth"
        assert manager.connection_state.transport_capability == "full"
        assert ack["ok"] is True
        assert bluetooth.commands[0]["id"] == "cmd-1"

    asyncio.run(scenario())


def test_auto_transport_returns_false_when_bluetooth_is_not_supported():
    async def scenario():
        manager = DegradationManager(bluetooth_supported=False)
        wifi = FakeTransport(TransportKind.WIFI, manager, connect_result=False)
        bluetooth = FakeTransport(
            TransportKind.BLUETOOTH, manager, connect_result=True
        )
        transport = AutoTransport(wifi, bluetooth, manager=manager)

        assert await transport.connect(lambda _payload: None) is False
        assert wifi.connect_calls == 1
        assert bluetooth.connect_calls == 0
        assert transport.active_transport_name is None

    asyncio.run(scenario())


def test_auto_transport_can_switch_explicitly_to_bluetooth():
    async def scenario():
        manager = DegradationManager(bluetooth_supported=True)
        wifi = FakeTransport(TransportKind.WIFI, manager, connect_result=True)
        bluetooth = FakeTransport(
            TransportKind.BLUETOOTH, manager, connect_result=True
        )
        transport = AutoTransport(wifi, bluetooth, manager=manager)

        assert await transport.connect(lambda _payload: None) is True
        result = await transport.set_transport(
            "bluetooth", lambda _payload: None
        )

        assert result == {
            "transport": "vsle-bluetooth",
            "transport_alias": "bluetooth",
            "transport_capability": "full",
        }
        assert wifi.disconnected is True
        assert bluetooth.connect_calls == 1
        assert transport.active_transport_name == "vsle-bluetooth"

    asyncio.run(scenario())


def test_set_transport_auto_uses_wifi_first_then_bluetooth_fallback():
    async def scenario():
        manager = DegradationManager(bluetooth_supported=True)
        wifi = FakeTransport(TransportKind.WIFI, manager, connect_result=False)
        bluetooth = FakeTransport(
            TransportKind.BLUETOOTH, manager, connect_result=True
        )
        transport = AutoTransport(wifi, bluetooth, manager=manager)

        result = await transport.set_transport("auto", lambda _payload: None)

        assert result == {
            "transport": "vsle-bluetooth",
            "transport_capability": "full",
        }
        assert wifi.connect_calls == 1
        assert bluetooth.connect_calls == 1
        assert transport.active_transport_name == "vsle-bluetooth"

    asyncio.run(scenario())


def test_auto_transport_accepts_vsle_bluetooth_alias_and_reports_full_capability():
    async def scenario():
        manager = DegradationManager(bluetooth_supported=True)
        wifi = FakeTransport(TransportKind.WIFI, manager, connect_result=True)
        bluetooth = FakeTransport(
            TransportKind.BLUETOOTH, manager, connect_result=True
        )
        transport = AutoTransport(wifi, bluetooth, manager=manager)

        result = await transport.set_transport(
            "vsle-bluetooth", lambda _payload: None
        )

        assert result == {
            "transport": "vsle-bluetooth",
            "transport_capability": "full",
        }
        assert transport.active_transport_name == "vsle-bluetooth"
        assert manager.connection_state.transport_label == "vsle-bluetooth"
        assert manager.connection_state.transport_capability == "full"

    asyncio.run(scenario())


def test_auto_transport_preserves_plain_bluetooth_as_full_vsle_alias():
    async def scenario():
        manager = DegradationManager(bluetooth_supported=True)
        wifi = FakeTransport(TransportKind.WIFI, manager, connect_result=True)
        bluetooth = FakeTransport(
            TransportKind.BLUETOOTH, manager, connect_result=True
        )
        transport = AutoTransport(wifi, bluetooth, manager=manager)

        result = await transport.set_transport(
            "bluetooth", lambda _payload: None
        )

        assert result["transport"] == "vsle-bluetooth"
        assert result["transport_alias"] == "bluetooth"
        assert result["transport_capability"] == "full"

    asyncio.run(scenario())
