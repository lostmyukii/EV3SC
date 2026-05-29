import asyncio
import ast
import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT / "ev3-firmware" / "vsle_ev3_server.py"


def load_server_module():
    spec = importlib.util.spec_from_file_location("vsle_ev3_server", SERVER_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_ev3_server_keeps_python35_runtime_compatibility():
    source = SERVER_PATH.read_text(encoding="utf-8")

    tree = ast.parse(source, filename=str(SERVER_PATH), feature_version=(3, 5))
    assert "from dataclasses import" not in source
    assert "asyncio.run(" not in source
    assert "asyncio.create_task(" not in source
    assert "asyncio.get_running_loop(" not in source
    assert not any(isinstance(node, ast.JoinedStr) for node in ast.walk(tree))
    assert not any(isinstance(node, ast.AnnAssign) for node in ast.walk(tree))


class FakeHardware:
    def __init__(self):
        self.actions = []
        self.sensor_payload = {
            "sensors": {"S2": {"type": "ultrasonic", "distance_cm": 24.5}},
            "motors": {"A": {"position": 90, "speed": 0, "running": False}},
            "system": {
                "battery_pct": 87,
                "battery_v": 7.5,
                "buttons": {"up": False, "center": True},
            },
        }

    def motor_run_forever(self, port, speed):
        self.actions.append(("motor_run_forever", port, speed))

    def motor_run_timed(self, port, speed, seconds):
        self.actions.append(("motor_run_timed", port, speed, seconds))

    def motor_run_to_abs_pos(self, port, degrees, speed):
        self.actions.append(("motor_run_to_abs_pos", port, degrees, speed))

    def motor_run_to_rel_pos(self, port, degrees, speed):
        self.actions.append(("motor_run_to_rel_pos", port, degrees, speed))

    def motor_stop(self, port):
        self.actions.append(("motor_stop", port))

    def motor_stop_all(self):
        self.actions.append(("motor_stop_all",))

    def motor_reset_position(self, port):
        self.actions.append(("motor_reset_position", port))

    def motor_set_pid(self, port, mode, term, value):
        self.actions.append(("motor_set_pid", port, mode, term, value))

    def sync_run(self, port_l, port_r, speed, seconds):
        self.actions.append(("sync_run", port_l, port_r, speed, seconds))

    def sync_turn(self, port_l, port_r, speed, turn):
        self.actions.append(("sync_turn", port_l, port_r, speed, turn))

    def sound_play_tone(self, freq, duration, volume, wait=False):
        self.actions.append(("sound_play_tone", freq, duration, volume, wait))

    def sound_beep(self):
        self.actions.append(("sound_beep",))

    def sound_stop(self):
        self.actions.append(("sound_stop",))

    def sound_set_volume(self, volume):
        self.actions.append(("sound_set_volume", volume))

    def sound_play_file(self, file):
        self.actions.append(("sound_play_file", file))

    def display_text(self, text, line):
        self.actions.append(("display_text", text, line))

    def display_number(self, number, line):
        self.actions.append(("display_number", number, line))

    def display_text_at(self, text, x, y):
        self.actions.append(("display_text_at", text, x, y))

    def display_clear(self):
        self.actions.append(("display_clear",))

    def display_image(self, image):
        self.actions.append(("display_image", image))

    def display_update(self):
        self.actions.append(("display_update",))

    def display_draw_line(self, x1, y1, x2, y2):
        self.actions.append(("display_draw_line", x1, y1, x2, y2))

    def display_draw_circle(self, x, y, radius):
        self.actions.append(("display_draw_circle", x, y, radius))

    def status_light_set(self, color):
        self.actions.append(("status_light_set", color))

    def status_light_off(self):
        self.actions.append(("status_light_off",))

    def system_stop_all(self):
        self.actions.append(("system_stop_all",))

    def gyro_reset(self, port):
        self.actions.append(("gyro_reset", port))

    def read_all(self):
        return self.sensor_payload


class FakeWebSocket:
    def __init__(self, incoming=None):
        self.incoming = list(incoming or [])
        self.sent = []
        self.closed = None

    async def recv(self):
        if not self.incoming:
            raise asyncio.TimeoutError()
        return self.incoming.pop(0)

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


class RecvOnlyWebSocket:
    def __init__(self, incoming=None):
        self.incoming = list(incoming or [])
        self.sent = []
        self.closed = None

    async def recv(self):
        if not self.incoming:
            raise asyncio.TimeoutError()
        return self.incoming.pop(0)

    async def send(self, message):
        self.sent.append(json.loads(message))

    async def close(self, code=None, reason=None):
        self.closed = (code, reason)


class FakeBluetoothSocket:
    def __init__(self):
        self.sent = []
        self.closed = False

    def sendall(self, payload):
        self.sent.append(payload)

    def close(self):
        self.closed = True


class FakeBluetoothListener:
    def __init__(self):
        self.bound = None
        self.listen_backlog = None
        self.closed = False

    def bind(self, address):
        self.bound = address

    def listen(self, backlog):
        self.listen_backlog = backlog

    def close(self):
        self.closed = True


class FakeSocketModule:
    AF_BLUETOOTH = 31
    SOCK_STREAM = 1
    BTPROTO_RFCOMM = 3

    def __init__(self):
        self.listener = FakeBluetoothListener()
        self.calls = []

    def socket(self, family, kind, proto):
        self.calls.append((family, kind, proto))
        return self.listener


def test_auth_pair_required_and_accepted():
    module = load_server_module()
    server = module.VSLEEV3Server(FakeHardware(), pairing_token="secret")
    ws = FakeWebSocket(
        [
            json.dumps(
                {
                    "id": "pair-1",
                    "method": "auth.pair",
                    "params": {"token": "secret"},
                }
            )
        ]
    )

    assert asyncio.run(server.authenticate_client(ws)) is True
    assert ws.sent == [{"type": "ack", "id": "pair-1", "ok": True}]
    assert ws.closed is None


def test_auth_pair_rejects_bad_token_and_closes_policy_violation():
    module = load_server_module()
    server = module.VSLEEV3Server(FakeHardware(), pairing_token="secret")
    ws = FakeWebSocket(
        [
            json.dumps(
                {
                    "id": "pair-1",
                    "method": "auth.pair",
                    "params": {"token": "wrong"},
                }
            )
        ]
    )

    assert asyncio.run(server.authenticate_client(ws)) is False
    assert ws.sent == []
    assert ws.closed == (1008, "pairing failed")


def test_invalid_command_fails_closed_without_hardware_action():
    module = load_server_module()
    hardware = FakeHardware()
    server = module.VSLEEV3Server(hardware, pairing_token="")

    response = server.handle_command({"id": "bad-1", "method": "motor.fly"})

    assert response == {
        "type": "ack",
        "id": "bad-1",
        "ok": False,
        "code": "EV3_INVALID_COMMAND",
        "error": "EV3 command method is not allowed",
        "retryable": False,
    }
    assert hardware.actions == []


def test_motor_run_timed_validates_and_clamps_before_dispatch():
    module = load_server_module()
    hardware = FakeHardware()
    server = module.VSLEEV3Server(hardware, pairing_token="")

    response = server.handle_command(
        {
            "id": "cmd-1",
            "method": "motor.runTimed",
            "params": {"port": "a", "speed": 125, "time": 90},
        }
    )

    assert response == {"type": "ack", "id": "cmd-1", "ok": True}
    assert hardware.actions == [("motor_run_timed", "A", 100, 60)]


def test_motor_set_pid_validates_clamps_and_dispatches_to_hardware():
    module = load_server_module()
    hardware = FakeHardware()
    server = module.VSLEEV3Server(hardware, pairing_token="")

    response = server.handle_command(
        {
            "id": "pid-1",
            "method": "motor.setPID",
            "params": {
                "port": "c",
                "mode": "POSITION",
                "term": "KD",
                "value": 12345,
            },
        }
    )

    assert response == {"type": "ack", "id": "pid-1", "ok": True}
    assert hardware.actions == [("motor_set_pid", "C", "position", "kd", 10000)]


def test_sound_display_and_gyro_commands_dispatch_to_hardware():
    module = load_server_module()
    hardware = FakeHardware()
    server = module.VSLEEV3Server(hardware, pairing_token="")

    commands = [
        {
            "id": "tone",
            "method": "sound.playTone",
            "params": {"freq": 440, "duration": 1, "volume": 80},
        },
        {
            "id": "tone-wait",
            "method": "sound.playToneWait",
            "params": {"freq": 880, "duration": 0.5, "volume": 70},
        },
        {
            "id": "file",
            "method": "sound.playFile",
            "params": {"file": "ready.wav"},
        },
        {"id": "beep", "method": "sound.beep"},
        {"id": "stop", "method": "sound.stop"},
        {
            "id": "volume",
            "method": "sound.setVolume",
            "params": {"volume": 42},
        },
        {
            "id": "text",
            "method": "display.text",
            "params": {"text": "Hi", "line": 2},
        },
        {
            "id": "number",
            "method": "display.number",
            "params": {"number": 12.5, "line": 3},
        },
        {"id": "clear", "method": "display.clear"},
        {
            "id": "image",
            "method": "display.image",
            "params": {"image": "smile.png"},
        },
        {
            "id": "text-at",
            "method": "display.textAt",
            "params": {"text": "XY", "x": 20, "y": 30},
        },
        {
            "id": "line",
            "method": "display.drawLine",
            "params": {"x1": 0, "y1": 1, "x2": 2, "y2": 3},
        },
        {
            "id": "circle",
            "method": "display.drawCircle",
            "params": {"x": 90, "y": 64, "r": 10},
        },
        {"id": "update", "method": "display.update"},
        {"id": "gyro", "method": "gyro.reset", "params": {"port": "S3"}},
    ]

    responses = [server.handle_command(command) for command in commands]

    assert all(response["ok"] is True for response in responses)
    assert hardware.actions == [
        ("sound_play_tone", 440, 1, 80, False),
        ("sound_play_tone", 880, 0.5, 70, True),
        ("sound_play_file", "ready.wav"),
        ("sound_beep",),
        ("sound_stop",),
        ("sound_set_volume", 42),
        ("display_text", "Hi", 2),
        ("display_number", 12.5, 3),
        ("display_clear",),
        ("display_image", "smile.png"),
        ("display_text_at", "XY", 20, 30),
        ("display_draw_line", 0, 1, 2, 3),
        ("display_draw_circle", 90, 64, 10),
        ("display_update",),
        ("gyro_reset", "S3"),
    ]


def test_system_commands_dispatch_to_hardware_and_validate_color():
    module = load_server_module()
    hardware = FakeHardware()
    server = module.VSLEEV3Server(hardware, pairing_token="")

    responses = [
        server.handle_command(
            {
                "id": "led",
                "method": "system.setStatusLight",
                "params": {"color": "GREEN"},
            }
        ),
        server.handle_command({"id": "off", "method": "system.statusLightOff"}),
        server.handle_command({"id": "stop", "method": "system.stopAll"}),
        server.handle_command(
            {
                "id": "bad-led",
                "method": "system.setStatusLight",
                "params": {"color": "purple"},
            }
        ),
    ]

    assert responses[:3] == [
        {"type": "ack", "id": "led", "ok": True},
        {"type": "ack", "id": "off", "ok": True},
        {"type": "ack", "id": "stop", "ok": True},
    ]
    assert responses[3]["ok"] is False
    assert responses[3]["code"] == "EV3_INVALID_COMMAND"
    assert hardware.actions == [
        ("status_light_set", "green"),
        ("status_light_off",),
        ("system_stop_all",),
    ]


def test_sensor_payload_includes_timestamp_and_fake_hardware_snapshot():
    module = load_server_module()
    server = module.VSLEEV3Server(
        FakeHardware(),
        pairing_token="",
        clock=lambda: 123.456,
    )

    payload = server.build_sensor_update()

    assert payload == {
        "type": "sensor_update",
        "timestamp": 123.456,
        "sensors": {"S2": {"type": "ultrasonic", "distance_cm": 24.5}},
        "motors": {"A": {"position": 90, "speed": 0, "running": False}},
        "system": {
            "battery_pct": 87,
            "battery_v": 7.5,
            "buttons": {"up": False, "center": True},
            "collected_points": 0,
            "collecting": False,
            "collect_label": "",
        },
    }


def test_ev3dev_motor_snapshot_includes_speed_and_position_pid_values():
    module = load_server_module()

    class FakeMotor:
        position = 90
        speed = 42
        is_running = False
        speed_p = 11.3
        speed_i = 0.05
        speed_d = 3.2
        position_p = 9
        position_i = 0
        position_d = 1

    hardware = object.__new__(module.EV3DevHardware)
    hardware.motors = {"A": FakeMotor()}

    assert hardware._read_motors() == {
        "A": {
            "position": 90,
            "speed": 42,
            "running": False,
            "pid": {
                "speed": {"kp": 11.3, "ki": 0.05, "kd": 3.2},
                "position": {"kp": 9, "ki": 0, "kd": 1},
            },
        }
    }


def test_ev3dev_read_all_caches_slow_snapshot_fields_between_refreshes():
    module = load_server_module()
    now = [100.0]
    sensor_reads = []

    class CountingMotor:
        def __init__(self):
            self.position = 90
            self.speed = 42
            self.is_running = False
            self.pid_values = {
                "speed_p": 11,
                "speed_i": 12,
                "speed_d": 13,
                "position_p": 21,
                "position_i": 22,
                "position_d": 23,
            }
            self.pid_reads = []

        def __getattr__(self, name):
            if name in self.pid_values:
                self.pid_reads.append(name)
                return self.pid_values[name]
            raise AttributeError(name)

    class CountingPower:
        def __init__(self):
            self.level = 87
            self.volts = 7.5
            self.reads = []

        @property
        def measured_battery_level(self):
            self.reads.append("battery_pct")
            return self.level

        @property
        def measured_volts(self):
            self.reads.append("battery_v")
            return self.volts

    class CountingButtons:
        def __init__(self):
            self.states = {
                "up": False,
                "down": False,
                "left": False,
                "right": False,
                "enter": True,
            }
            self.reads = []

        def _read(self, name):
            self.reads.append(name)
            return self.states[name]

        @property
        def up(self):
            return self._read("up")

        @property
        def down(self):
            return self._read("down")

        @property
        def left(self):
            return self._read("left")

        @property
        def right(self):
            return self._read("right")

        @property
        def enter(self):
            return self._read("enter")

    motor = CountingMotor()
    power = CountingPower()
    buttons = CountingButtons()
    hardware = object.__new__(module.EV3DevHardware)
    hardware.motors = {"A": motor}
    hardware.power = power
    hardware.buttons = buttons
    hardware._snapshot_clock = lambda: now[0]
    hardware._slow_snapshot_interval = 1.0
    hardware._slow_snapshot = None
    hardware._slow_snapshot_at = 0.0

    def read_sensors():
        sensor_reads.append(now[0])
        return {
            "S1": {
                "type": "touch",
                "pressed": len(sensor_reads) % 2 == 1,
            }
        }

    hardware._read_sensors = read_sensors

    first = hardware.read_all()
    motor.position = 91
    motor.pid_values["speed_p"] = 99
    power.level = 70
    buttons.states["enter"] = False
    now[0] = 100.1
    second = hardware.read_all()

    assert [first["sensors"]["S1"]["pressed"], second["sensors"]["S1"]["pressed"]] == [
        True,
        False,
    ]
    assert second["motors"]["A"]["position"] == 91
    assert second["motors"]["A"]["pid"]["speed"]["kp"] == 11
    assert second["system"]["battery_pct"] == 87
    assert second["system"]["buttons"]["center"] is True
    assert len(sensor_reads) == 2
    assert len(motor.pid_reads) == 6
    assert len(power.reads) == 2
    assert len(buttons.reads) == 5

    now[0] = 101.2
    third = hardware.read_all()

    assert third["motors"]["A"]["pid"]["speed"]["kp"] == 99
    assert third["system"]["battery_pct"] == 70
    assert third["system"]["buttons"]["center"] is False
    assert len(sensor_reads) == 3
    assert len(motor.pid_reads) == 12
    assert len(power.reads) == 4
    assert len(buttons.reads) == 10


def test_infrared_sensor_payload_includes_beacon_and_remote_channels():
    module = load_server_module()

    class FakeInfrared:
        proximity = 63

        def heading_and_distance(self, channel):
            return (-7, 44) if channel == 2 else (0, None)

        def buttons_pressed(self, channel):
            return ["top_left", "bottom_right"] if channel == 2 else []

    hardware = object.__new__(module.EV3DevHardware)
    payload = hardware._read_sensor(FakeInfrared())

    assert payload == {
        "type": "infrared",
        "distance": 63,
        "beacon": {
            "1": {"heading": 0, "distance": 0},
            "2": {"heading": -7, "distance": 44},
            "3": {"heading": 0, "distance": 0},
            "4": {"heading": 0, "distance": 0},
        },
        "remote": {
            "1": {"buttons": []},
            "2": {"buttons": ["top_left", "bottom_right"]},
            "3": {"buttons": []},
            "4": {"buttons": []},
        },
    }


def test_data_collection_is_bounded_and_can_be_exported_and_cleared():
    module = load_server_module()
    server = module.VSLEEV3Server(
        FakeHardware(),
        pairing_token="",
        max_collected_points=2,
        clock=lambda: 1,
    )

    assert server.handle_command(
        {"id": 1, "method": "data.startCollect", "params": {"label": "turn"}}
    ) == {"type": "ack", "id": 1, "ok": True}
    server.record_data_point("first")
    server.record_data_point("second")
    full = server.handle_command(
        {"id": 2, "method": "data.addPoint", "params": {"label": "third"}}
    )

    assert full["ok"] is False
    assert full["code"] == "DATA_BUFFER_FULL"
    assert len(server.collected_data) == 2

    exported = server.handle_command({"id": 3, "method": "data.getAll"})
    assert exported["ok"] is True
    assert len(exported["data"]) == 2

    csv_export = server.handle_command({"id": 5, "method": "data.exportCSV"})
    assert csv_export["ok"] is True
    assert csv_export["filename"] == "vsle_ev3_data.csv"
    assert "label" in csv_export["csv"]
    assert "first" in csv_export["csv"]

    upload = server.handle_command({"id": 6, "method": "data.uploadToTrainer"})
    assert upload["ok"] is False
    assert upload["code"] == "TRAINER_UNAVAILABLE"

    server.handle_command({"id": 4, "method": "data.clear"})
    assert server.collected_data == []


def test_auto_collect_records_on_configured_interval_only():
    module = load_server_module()
    now = [10.0]
    server = module.VSLEEV3Server(
        FakeHardware(),
        pairing_token="",
        max_collected_points=5,
        clock=lambda: now[0],
    )

    response = server.handle_command(
        {
            "id": 1,
            "method": "data.startAutoCollect",
            "params": {"interval_ms": 100, "label": "auto"},
        }
    )
    first = server.maybe_record_collected_data()
    second = server.maybe_record_collected_data()
    now[0] = 10.101
    third = server.maybe_record_collected_data()

    assert response == {"type": "ack", "id": 1, "ok": True}
    assert first is True
    assert second is False
    assert third is True
    assert [point["label"] for point in server.collected_data] == [
        "auto",
        "auto",
    ]


def test_client_disconnect_stops_all_motors_for_safety():
    module = load_server_module()
    hardware = FakeHardware()
    server = module.VSLEEV3Server(hardware, pairing_token="")
    ws = FakeWebSocket(
        [
            json.dumps(
                {
                    "id": "cmd-1",
                    "method": "motor.runForever",
                    "params": {"port": "A", "speed": 50},
                }
            )
        ]
    )

    asyncio.run(server.handle_client(ws))

    assert ("motor_run_forever", "A", 50) in hardware.actions
    assert hardware.actions[-1] == ("motor_stop_all",)
    assert server.clients == set()


def test_handle_client_accepts_websockets_protocol_without_async_iterator():
    module = load_server_module()
    hardware = FakeHardware()
    server = module.VSLEEV3Server(hardware, pairing_token="")
    ws = RecvOnlyWebSocket(
        [
            json.dumps(
                {
                    "id": "cmd-1",
                    "method": "sound.stop",
                    "params": {},
                }
            )
        ]
    )

    asyncio.run(server.handle_client(ws))

    assert ws.sent == [{"type": "ack", "id": "cmd-1", "ok": True}]
    assert hardware.actions[-2:] == [("sound_stop",), ("motor_stop_all",)]
    assert server.clients == set()


def test_bluetooth_endpoint_uses_same_auth_and_command_handler_as_wifi():
    module = load_server_module()
    hardware = FakeHardware()
    server = module.VSLEEV3Server(hardware, pairing_token="secret")
    endpoint = FakeWebSocket(
        [
            json.dumps(
                {
                    "id": "pair-1",
                    "method": "auth.pair",
                    "params": {"token": "secret"},
                }
            ),
            json.dumps(
                {
                    "id": "cmd-1",
                    "method": "motor.stop",
                    "params": {"port": "A"},
                }
            ),
        ]
    )

    asyncio.run(server.handle_bluetooth_endpoint(endpoint))

    assert endpoint.sent[0] == {"type": "ack", "id": "pair-1", "ok": True}
    assert endpoint.sent[1] == {"type": "ack", "id": "cmd-1", "ok": True}
    assert hardware.actions == [("motor_stop", "A"), ("motor_stop_all",)]


def test_run_uses_websockets_serve_with_configured_host_and_port():
    module = load_server_module()
    calls = []

    async def fake_serve(handler, host, port, **kwargs):
        calls.append((handler, host, port, kwargs))

        class FakeServer:
            async def serve_forever(self):
                return None

        return FakeServer()

    server = module.VSLEEV3Server(FakeHardware(), pairing_token="")

    asyncio.run(server.run(host="127.0.0.1", port=8765, serve=fake_serve))

    assert calls
    handler, host, port, kwargs = calls[0]
    assert handler == server.handle_client
    assert host == "127.0.0.1"
    assert port == 8765
    assert kwargs["ping_interval"] == 5


def test_bluetooth_line_endpoint_sends_json_lines_and_closes_socket():
    module = load_server_module()
    fake_socket = FakeBluetoothSocket()
    endpoint = module.BluetoothLineEndpoint(fake_socket)

    asyncio.run(endpoint.send(json.dumps({"type": "ack", "ok": True})))
    asyncio.run(endpoint.close(code=1000, reason="done"))

    assert fake_socket.sent == [b'{"type": "ack", "ok": true}\n']
    assert fake_socket.closed is True


def test_build_bluetooth_listener_uses_stdlib_rfcomm_socket():
    module = load_server_module()
    socket_module = FakeSocketModule()

    listener = module.build_bluetooth_listener(
        socket_module=socket_module,
        address="",
        channel=1,
        backlog=1,
    )

    assert listener is socket_module.listener
    assert socket_module.calls == [(31, 1, 3)]
    assert listener.bound == ("", 1)
    assert listener.listen_backlog == 1
