import asyncio
import pytest

from weisile_link.cli import WeisileLinkRuntimeConfig, build_server
from weisile_link.protocol.official_ev3_direct_command import OPOUTPUT_STOP
from weisile_link.runtime.degradation import DegradationManager, TransportKind
from weisile_link.transport.official_ev3_bt_transport import (
    OfficialEV3BluetoothTransport,
)


class FakeNativeBluetoothAdapter:
    def __init__(self):
        self.connected_to = None
        self.writes = []
        self.closed = False

    async def connect(self, address):
        self.connected_to = address

    async def send(self, payload):
        self.writes.append(payload)

    async def recv(self):
        return b""

    async def close(self):
        self.closed = True


def test_transport_rejects_commands_before_connect():
    async def scenario():
        adapter = FakeNativeBluetoothAdapter()
        transport = OfficialEV3BluetoothTransport(
            "00:16:53:12:34:56",
            adapter=adapter,
        )

        with pytest.raises(ConnectionError):
            await transport.send_command(
                {
                    "id": "stop-1",
                    "method": "motor.stop",
                    "params": {"port": "A"},
                }
            )

        assert adapter.writes == []

    asyncio.run(scenario())


def test_transport_sends_motor_stop_direct_command_after_validation():
    async def scenario():
        manager = DegradationManager()
        adapter = FakeNativeBluetoothAdapter()
        transport = OfficialEV3BluetoothTransport(
            "00:16:53:12:34:56",
            adapter=adapter,
            manager=manager,
        )

        connected = await transport.connect(lambda _payload: None)
        ack = await transport.send_command(
            {
                "id": "stop-1",
                "method": "motor.stop",
                "params": {"port": "A"},
            }
        )

        assert connected is True
        assert ack == {"type": "ack", "id": "stop-1", "ok": True}
        assert adapter.connected_to == "00:16:53:12:34:56"
        assert adapter.writes
        assert adapter.writes[0][7] == OPOUTPUT_STOP
        assert adapter.writes[0][9] == 0x01
        assert adapter.writes[0][10] == 0x01
        assert manager.connection_state.active_transport == (
            TransportKind.BLUETOOTH
        )

        await transport.disconnect()
        assert adapter.closed is True

    asyncio.run(scenario())


def test_transport_disconnect_sends_safe_stop_before_close():
    async def scenario():
        adapter = FakeNativeBluetoothAdapter()
        transport = OfficialEV3BluetoothTransport(
            "00:16:53:12:34:56",
            adapter=adapter,
        )

        assert await transport.connect(lambda _payload: None) is True
        await transport.disconnect()

        assert adapter.writes
        assert adapter.writes[0][7] == OPOUTPUT_STOP
        assert adapter.writes[0][9] == 0x0F
        assert adapter.writes[0][10] == 0x01
        assert adapter.closed is True

    asyncio.run(scenario())


def test_transport_marks_unsupported_without_native_adapter():
    async def scenario():
        manager = DegradationManager()
        transport = OfficialEV3BluetoothTransport(
            "00:16:53:12:34:56",
            adapter=None,
            manager=manager,
        )

        connected = await transport.connect(lambda _payload: None)

        assert connected is False
        assert transport.supported is False
        assert manager.bluetooth_supported is False
        assert manager.connection_state.bluetooth_failed is True
        assert manager.connection_state.last_failure_reason == (
            "official firmware native Bluetooth adapter is not installed"
        )

    asyncio.run(scenario())


def test_transport_returns_unsupported_ack_for_unmapped_methods():
    async def scenario():
        adapter = FakeNativeBluetoothAdapter()
        transport = OfficialEV3BluetoothTransport(
            "00:16:53:12:34:56",
            adapter=adapter,
        )

        assert await transport.connect(lambda _payload: None) is True
        ack = await transport.send_command(
            {
                "id": "run-1",
                "method": "motor.runForever",
                "params": {"port": "A", "speed": 50},
            }
        )

        assert ack["ok"] is False
        assert ack["code"] == "EV3_INVALID_COMMAND"
        assert ack["id"] == "run-1"
        assert adapter.writes == []

    asyncio.run(scenario())


def test_runtime_config_reads_official_firmware_bluetooth_env(monkeypatch):
    monkeypatch.setenv("WEISILE_TRANSPORT", "official-bluetooth")
    monkeypatch.setenv("EV3_OFFICIAL_BT", "00:16:53:12:34:56")

    config = WeisileLinkRuntimeConfig.from_env()

    assert config.transport == "official-bluetooth"
    assert config.ev3_official_bt == "00:16:53:12:34:56"


def test_build_server_uses_official_shell_without_native_adapter():
    config = WeisileLinkRuntimeConfig(
        transport="official-bluetooth",
        ev3_official_bt="00:16:53:12:34:56",
        allowed_origins=(),
    )

    server = build_server(config)

    assert isinstance(server.transport, OfficialEV3BluetoothTransport)
    assert server.transport.supported is False
    assert server.manager.bluetooth_supported is False


def test_runtime_config_default_does_not_enable_official_mode(monkeypatch):
    monkeypatch.delenv("WEISILE_TRANSPORT", raising=False)
    monkeypatch.delenv("EV3_OFFICIAL_BT", raising=False)

    config = WeisileLinkRuntimeConfig.from_env()

    assert config.transport == "auto"
    assert config.ev3_official_bt == ""
