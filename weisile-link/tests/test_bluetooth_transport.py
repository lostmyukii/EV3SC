import asyncio
import json
import queue

import pytest

from weisile_link.protocol.errors import ValidationError
from weisile_link.runtime.degradation import DegradationManager, TransportKind
from weisile_link.transport.bluetooth_transport import (
    BluetoothTransport,
    host_supports_stdlib_rfcomm,
)


class FakeBluetoothFile:
    def __init__(self, incoming=None):
        self.incoming = queue.Queue()
        self.writes = []
        self.closed = False
        for payload in incoming or []:
            self.feed(payload)

    def feed(self, payload):
        if isinstance(payload, bytes):
            self.incoming.put(payload)
            return
        self.incoming.put(
            (json.dumps(payload, separators=(",", ":")) + "\n").encode("utf-8")
        )

    def close_stream(self):
        self.incoming.put(b"")

    def write(self, payload):
        self.writes.append(payload)
        return len(payload)

    def flush(self):
        return None

    def readline(self):
        return self.incoming.get(timeout=1)

    def close(self):
        self.closed = True
        self.close_stream()


class FakeBluetoothSocket:
    def __init__(self, file):
        self.file = file
        self.timeout = None
        self.connected_to = None
        self.closed = False

    def settimeout(self, timeout):
        self.timeout = timeout

    def connect(self, address):
        self.connected_to = address

    def makefile(self, mode, buffering=0):
        assert mode == "rwb"
        assert buffering == 0
        return self.file

    def close(self):
        self.closed = True
        self.file.close()


class FakeSocketModule:
    AF_BLUETOOTH = 31
    SOCK_STREAM = 1
    BTPROTO_RFCOMM = 3

    def __init__(self, sock):
        self.sock = sock
        self.calls = []

    def socket(self, family, kind, proto):
        self.calls.append((family, kind, proto))
        return self.sock


def decoded_writes(fake_file):
    return [json.loads(payload.decode("utf-8")) for payload in fake_file.writes]


def test_support_detection_requires_linux_stdlib_rfcomm_symbols():
    fake_module = object()

    assert host_supports_stdlib_rfcomm(
        FakeSocketModule(FakeBluetoothSocket(FakeBluetoothFile())),
        platform_name="Linux",
    )
    assert not host_supports_stdlib_rfcomm(
        FakeSocketModule(FakeBluetoothSocket(FakeBluetoothFile())),
        platform_name="Darwin",
    )
    assert not host_supports_stdlib_rfcomm(fake_module, platform_name="Linux")


def test_connect_pairs_and_routes_sensor_updates_to_callback_and_cache():
    async def scenario():
        fake_file = FakeBluetoothFile(
            [{"type": "ack", "id": "auth.pair", "ok": True}]
        )
        fake_socket = FakeBluetoothSocket(fake_file)
        socket_module = FakeSocketModule(fake_socket)
        manager = DegradationManager(bluetooth_supported=True)
        sensor_updates = []

        async def on_sensor_data(payload):
            sensor_updates.append(payload)

        transport = BluetoothTransport(
            "00:16:53:AA:BB:CC",
            socket_module=socket_module,
            platform_name="Linux",
            manager=manager,
            pairing_token="secret",
            monotonic_ms=lambda: 2_000,
        )

        connected = await transport.connect(on_sensor_data)
        fake_file.feed(
            {
                "type": "sensor_update",
                "sensors": {"S3": {"angle": 17}},
                "motors": {"A": {"running": False}},
                "system": {"battery_pct": 84},
            }
        )
        await asyncio.sleep(0.01)

        assert connected is True
        assert socket_module.calls == [(31, 1, 3)]
        assert fake_socket.connected_to == ("00:16:53:AA:BB:CC", 1)
        assert decoded_writes(fake_file) == [
            {
                "id": "auth.pair",
                "method": "auth.pair",
                "params": {"token": "secret"},
            }
        ]
        assert sensor_updates[0]["sensors"]["S3"]["angle"] == 17
        assert manager.connection_state.active_transport == (
            TransportKind.BLUETOOTH
        )
        cached = manager.get_sensor_value(
            "sensors.S3.angle",
            now_ms=2_050,
            default=0,
        )
        assert cached.value == 17
        assert cached.stale is False

        await transport.disconnect()

    asyncio.run(scenario())


def test_send_command_validates_normalizes_and_resolves_ack_from_receive_loop():
    async def scenario():
        fake_file = FakeBluetoothFile()
        transport = BluetoothTransport(
            "00:16:53:AA:BB:CC",
            socket_module=FakeSocketModule(FakeBluetoothSocket(fake_file)),
            platform_name="Linux",
            manager=DegradationManager(bluetooth_supported=True),
        )
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
        await asyncio.sleep(0.01)

        assert decoded_writes(fake_file) == [
            {
                "id": "cmd-1",
                "method": "motor.runTimed",
                "params": {"port": "A", "speed": 100, "time": 60},
            }
        ]

        fake_file.feed({"type": "ack", "id": "cmd-1", "ok": True})
        ack = await command_task

        assert ack == {"type": "ack", "id": "cmd-1", "ok": True}
        assert transport.pending_command_ids == ()

        await transport.disconnect()

    asyncio.run(scenario())


def test_validation_failure_never_writes_to_bluetooth_socket():
    async def scenario():
        fake_file = FakeBluetoothFile()
        transport = BluetoothTransport(
            "00:16:53:AA:BB:CC",
            socket_module=FakeSocketModule(FakeBluetoothSocket(fake_file)),
            platform_name="Linux",
            manager=DegradationManager(bluetooth_supported=True),
        )
        assert await transport.connect(lambda _payload: None) is True

        with pytest.raises(ValidationError):
            await transport.send_command(
                {"id": "cmd-1", "method": "motor.fly", "params": {}}
            )

        assert fake_file.writes == []

        await transport.disconnect()

    asyncio.run(scenario())


def test_unsupported_host_records_bluetooth_failure_without_opening_socket():
    async def scenario():
        fake_file = FakeBluetoothFile()
        socket_module = FakeSocketModule(FakeBluetoothSocket(fake_file))
        manager = DegradationManager(bluetooth_supported=True)
        transport = BluetoothTransport(
            "00:16:53:AA:BB:CC",
            socket_module=socket_module,
            platform_name="Darwin",
            manager=manager,
        )

        assert await transport.connect(lambda _payload: None) is False
        assert socket_module.calls == []
        assert manager.connection_state.bluetooth_failed is True
        assert manager.connection_state.connected is False

    asyncio.run(scenario())


def test_command_timeout_records_bluetooth_failure_and_clears_pending():
    async def scenario():
        fake_file = FakeBluetoothFile()
        manager = DegradationManager(bluetooth_supported=True)
        transport = BluetoothTransport(
            "00:16:53:AA:BB:CC",
            socket_module=FakeSocketModule(FakeBluetoothSocket(fake_file)),
            platform_name="Linux",
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
        assert manager.connection_state.bluetooth_failed is True
        assert manager.connection_state.connected is False

        await transport.disconnect()

    asyncio.run(scenario())


def test_disconnect_rejects_pending_commands_and_closes_socket():
    async def scenario():
        fake_file = FakeBluetoothFile()
        fake_socket = FakeBluetoothSocket(fake_file)
        manager = DegradationManager(bluetooth_supported=True)
        transport = BluetoothTransport(
            "00:16:53:AA:BB:CC",
            socket_module=FakeSocketModule(fake_socket),
            platform_name="Linux",
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
        await asyncio.sleep(0.01)

        await transport.disconnect()

        with pytest.raises(ConnectionError):
            await command_task

        assert transport.pending_command_ids == ()
        assert fake_socket.closed is True
        assert manager.connection_state.connected is False

    asyncio.run(scenario())
