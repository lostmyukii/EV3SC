#!/usr/bin/env python3
"""VSLE EV3 WebSocket server for ev3dev.

Sources:
- VSLE spec Sections 6.1, 10.5, 14.2, 15.4, and 16.
- ev3dev2 motor/sensor/sound/display/power/button documentation.
- websockets asyncio server documentation.

The module is importable on non-EV3 developer machines. ev3dev2 and
websockets are imported lazily only when the real hardware adapter or server
runner is used.
"""

import asyncio
import csv
import io
import json
import os
import signal
import socket
import time
from typing import Any, Callable, Dict, List, Optional, Set

WS_PORT = int(os.getenv("EV3_WS_PORT", "8765"))
BT_RFCOMM_CHANNEL = int(os.getenv("EV3_BT_RFCOMM_CHANNEL", "1"))
SENSOR_INTERVAL = 0.02
SLOW_SNAPSHOT_INTERVAL = float(os.getenv("EV3_SLOW_SNAPSHOT_INTERVAL", "1.0"))
MAX_COLLECTED_POINTS = int(os.getenv("MAX_COLLECTED_POINTS", "10000"))
PAIRING_TOKEN = os.getenv("WEISILE_PAIRING_TOKEN", "")

MOTOR_PORTS = {"A", "B", "C", "D"}
SENSOR_PORTS = {"S1", "S2", "S3", "S4"}
LCD_X_MAX = 177
LCD_Y_MAX = 127
MAX_LABEL_LENGTH = 64
SOUND_EXTENSIONS = {".wav"}
IMAGE_EXTENSIONS = {".png", ".bmp", ".jpg", ".jpeg"}
STATUS_LIGHT_COLORS = {"green", "orange", "red", "amber", "yellow"}
MOTOR_PID_MODES = {"speed", "position"}
MOTOR_PID_TERMS = {"kp", "ki", "kd"}
MOTOR_PID_VALUE_MAX = 10000
MOTOR_PID_ATTR_SUFFIX = {"kp": "p", "ki": "i", "kd": "d"}


class EV3CommandError(Exception):
    """Structured command validation or hardware execution failure."""

    def __init__(
        self,
        code: str,
        message: str,
        retryable: bool = False,
        data: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.data = data or {}


class BluetoothLineEndpoint:
    """Async JSON-line adapter for one RFCOMM client socket."""

    def __init__(self, client_socket: Any) -> None:
        self.client_socket = client_socket
        self._buffer = b""
        self._closed = False
        self._send_lock = None
        self._latest_sensor_message = None
        self._sensor_send_task = None
        self._sensor_send_failed = False

    async def recv(self) -> str:
        """Read one newline-terminated UTF-8 JSON message."""
        loop = _get_event_loop()
        while b"\n" not in self._buffer:
            chunk = await loop.run_in_executor(
                None,
                self.client_socket.recv,
                4096,
            )
            if not chunk:
                raise ConnectionError("Bluetooth RFCOMM client closed")
            self._buffer += chunk

        line, self._buffer = self._buffer.split(b"\n", 1)
        return line.decode("utf-8")

    async def send(self, message: str) -> None:
        """Send one newline-terminated UTF-8 JSON message."""
        await self._send_now(message)

    async def send_latest_sensor(self, message: str) -> None:
        """Queue the newest sensor payload without blocking the 50Hz loop."""
        if self._closed:
            return
        if self._sensor_send_failed:
            raise ConnectionError("Bluetooth RFCOMM sensor send failed")
        self._latest_sensor_message = message
        if self._sensor_send_task is None or self._sensor_send_task.done():
            self._sensor_send_task = _create_task(
                self._drain_latest_sensor_messages()
            )

    async def _drain_latest_sensor_messages(self) -> None:
        while not self._closed:
            message = self._latest_sensor_message
            self._latest_sensor_message = None
            if message is None:
                return
            try:
                await self._send_now(message)
            except Exception:
                self._sensor_send_failed = True
                return

    async def _send_now(self, message: str) -> None:
        payload = message.encode("utf-8")
        if not payload.endswith(b"\n"):
            payload += b"\n"
        loop = _get_event_loop()
        lock = self._get_send_lock()
        await lock.acquire()
        try:
            await loop.run_in_executor(None, self.client_socket.sendall, payload)
        finally:
            lock.release()

    def _get_send_lock(self) -> Any:
        if self._send_lock is None:
            self._send_lock = asyncio.Lock()
        return self._send_lock

    async def close(self, code: Any = None, reason: Any = None) -> None:
        """Close the RFCOMM client socket."""
        if self._closed:
            return
        self._closed = True
        if self._sensor_send_task is not None:
            self._sensor_send_task.cancel()
            try:
                await self._sensor_send_task
            except asyncio.CancelledError:
                pass
            self._sensor_send_task = None
        loop = _get_event_loop()
        await loop.run_in_executor(None, self.client_socket.close)

    def __aiter__(self) -> "BluetoothLineEndpoint":
        return self

    async def __anext__(self) -> str:
        try:
            return await self.recv()
        except ConnectionError:
            raise StopAsyncIteration


def build_bluetooth_listener(
    socket_module: Any = socket,
    address: str = "",
    channel: int = BT_RFCOMM_CHANNEL,
    backlog: int = 1,
) -> Any:
    """Build a stdlib RFCOMM listener for EV3-side JSON-line transport."""
    listener = socket_module.socket(
        socket_module.AF_BLUETOOTH,
        socket_module.SOCK_STREAM,
        socket_module.BTPROTO_RFCOMM,
    )
    listener.bind((address, channel))
    listener.listen(backlog)
    return listener


class ValidatedCommand:
    """Validated EV3 command ready for hardware dispatch."""

    def __init__(self, method: str, params: Dict[str, Any]) -> None:
        self.method = method
        self.params = params


def _get_event_loop() -> Any:
    """Return the active asyncio loop on Python 3.5 through modern Python."""
    get_running_loop = getattr(asyncio, "get_running_loop", None)
    if get_running_loop is not None:
        try:
            return get_running_loop()
        except RuntimeError:
            pass
    return asyncio.get_event_loop()


def _create_task(coro: Any) -> Any:
    """Create an asyncio task on Python 3.5 through modern Python."""
    create_task = getattr(asyncio, "create_task", None)
    if create_task is not None:
        return create_task(coro)
    return asyncio.ensure_future(coro, loop=_get_event_loop())


def _run_async(coro: Any) -> None:
    """Run the server coroutine on Python 3.5 through modern Python."""
    run = getattr(asyncio, "run", None)
    if run is not None:
        run(coro)
        return
    loop = asyncio.get_event_loop()
    loop.run_until_complete(coro)


def _number(params: Dict[str, Any], field: str, default: Any = None) -> float:
    value = params.get(field, default)
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise EV3CommandError(
            "EV3_INVALID_COMMAND",
            "{} must be numeric".format(field),
            False,
            {"field": field},
        ) from exc


def _int_or_float(value: float) -> Any:
    value = float(value)
    return int(value) if value.is_integer() else value


def _clamp(value: float, lower: float, upper: float) -> Any:
    return _int_or_float(max(lower, min(upper, value)))


def _motor_port(params: Dict[str, Any], field: str = "port") -> str:
    port = str(params.get(field, "")).upper()
    if port not in MOTOR_PORTS:
        raise EV3CommandError(
            "EV3_INVALID_PORT",
            "Invalid EV3 motor port",
            False,
            {"port": params.get(field)},
        )
    return port


def _sensor_port(params: Dict[str, Any], field: str = "port") -> str:
    port = str(params.get(field, "")).upper()
    if port not in SENSOR_PORTS:
        raise EV3CommandError(
            "EV3_INVALID_PORT",
            "Invalid EV3 sensor port",
            False,
            {"port": params.get(field)},
        )
    return port


def _speed(params: Dict[str, Any], field: str = "speed") -> Any:
    return _clamp(_number(params, field, 0), -100, 100)


def _duration(params: Dict[str, Any], field: str, default: Any = 0) -> Any:
    return _clamp(_number(params, field, default), 0, 60)


def _frequency(params: Dict[str, Any]) -> Any:
    return _clamp(_number(params, "freq"), 20, 20000)


def _volume(params: Dict[str, Any]) -> Any:
    return _clamp(_number(params, "volume", 100), 0, 100)


def _coord(params: Dict[str, Any], field: str, upper: int) -> Any:
    return _clamp(_number(params, field), 0, upper)


def _label(params: Dict[str, Any], field: str = "label") -> str:
    value = str(params.get(field, ""))
    if len(value) > MAX_LABEL_LENGTH:
        raise EV3CommandError(
            "EV3_INVALID_COMMAND",
            "label must be 64 characters or fewer",
            False,
            {"field": field},
        )
    return value


def _milliseconds(
    params: Dict[str, Any],
    field: str = "interval_ms",
    default: Any = 100,
) -> Any:
    return _clamp(_number(params, field, default), 20, 60000)


def _motor_pid(params: Dict[str, Any]) -> Dict[str, Any]:
    mode = str(params.get("mode", "")).lower()
    term = str(params.get("term", "")).lower()
    if mode not in MOTOR_PID_MODES:
        raise EV3CommandError(
            "EV3_INVALID_COMMAND",
            "PID mode is not allowed",
            False,
            {"field": "mode"},
        )
    if term not in MOTOR_PID_TERMS:
        raise EV3CommandError(
            "EV3_INVALID_COMMAND",
            "PID term is not allowed",
            False,
            {"field": "term"},
        )
    return {
        "port": _motor_port(params),
        "mode": mode,
        "term": term,
        "value": _clamp(_number(params, "value"), 0, MOTOR_PID_VALUE_MAX),
    }


def _asset_name(params: Dict[str, Any], field: str, extensions: Set[str]) -> str:
    value = str(params.get(field, "")).strip()
    lower_value = value.lower()
    if (
        not value
        or len(value) > MAX_LABEL_LENGTH
        or "/" in value
        or "\\" in value
        or "\x00" in value
        or not any(lower_value.endswith(extension) for extension in extensions)
    ):
        raise EV3CommandError(
            "EV3_INVALID_COMMAND",
            "{} must be a safe asset filename".format(field),
            False,
            {"field": field},
        )
    return value


def validate_command(message: Dict[str, Any]) -> ValidatedCommand:
    """Validate the EV3 command allowlist and normalize params."""
    method = str(message.get("method", ""))
    params = message.get("params", {})
    if not isinstance(params, dict):
        raise EV3CommandError(
            "EV3_INVALID_COMMAND",
            "EV3 command params must be an object",
            False,
        )

    if method == "motor.runForever":
        normalized = {"port": _motor_port(params), "speed": _speed(params)}
    elif method == "motor.runTimed":
        normalized = {
            "port": _motor_port(params),
            "speed": _speed(params),
            "time": _duration(params, "time"),
        }
    elif method in {"motor.runToAbsPos", "motor.runToRelPos"}:
        normalized = {
            "port": _motor_port(params),
            "degrees": _number(params, "degrees"),
            "speed": _speed(params),
        }
    elif method in {"motor.stop", "motor.resetPosition"}:
        normalized = {"port": _motor_port(params)}
    elif method == "motor.stopAll":
        normalized = {}
    elif method == "motor.setPID":
        normalized = _motor_pid(params)
    elif method == "motor.syncRun":
        normalized = {
            "port_l": _motor_port(params, "port_l"),
            "port_r": _motor_port(params, "port_r"),
            "speed": _speed(params),
            "time": _duration(params, "time"),
        }
    elif method == "motor.syncTurn":
        normalized = {
            "port_l": _motor_port(params, "port_l"),
            "port_r": _motor_port(params, "port_r"),
            "speed": _speed(params),
            "turn": _speed(params, "turn"),
        }
    elif method in {"sound.playTone", "sound.playToneWait"}:
        normalized = {
            "freq": _frequency(params),
            "duration": _duration(params, "duration", 0.5),
            "volume": _volume(params),
        }
    elif method == "sound.playFile":
        normalized = {"file": _asset_name(params, "file", SOUND_EXTENSIONS)}
    elif method in {"sound.beep", "sound.stop", "display.clear"}:
        normalized = {}
    elif method == "sound.setVolume":
        normalized = {"volume": _volume(params)}
    elif method == "display.text":
        normalized = {
            "text": str(params.get("text", "")),
            "line": _clamp(_number(params, "line", 1), 1, 8),
        }
    elif method == "display.number":
        normalized = {
            "number": _int_or_float(_number(params, "number", 0)),
            "line": _clamp(_number(params, "line", 1), 1, 8),
        }
    elif method == "display.image":
        normalized = {"image": _asset_name(params, "image", IMAGE_EXTENSIONS)}
    elif method == "display.textAt":
        normalized = {
            "text": str(params.get("text", "")),
            "x": _coord(params, "x", LCD_X_MAX),
            "y": _coord(params, "y", LCD_Y_MAX),
        }
    elif method == "display.drawLine":
        normalized = {
            "x1": _coord(params, "x1", LCD_X_MAX),
            "y1": _coord(params, "y1", LCD_Y_MAX),
            "x2": _coord(params, "x2", LCD_X_MAX),
            "y2": _coord(params, "y2", LCD_Y_MAX),
        }
    elif method == "display.drawCircle":
        normalized = {
            "x": _coord(params, "x", LCD_X_MAX),
            "y": _coord(params, "y", LCD_Y_MAX),
            "r": _clamp(_number(params, "r"), 0, LCD_Y_MAX),
        }
    elif method == "display.update":
        normalized = {}
    elif method == "gyro.reset":
        normalized = {"port": _sensor_port(params)}
    elif method == "system.setStatusLight":
        color = str(params.get("color", "")).lower()
        if color not in STATUS_LIGHT_COLORS:
            raise EV3CommandError(
                "EV3_INVALID_COMMAND",
                "status light color is not allowed",
                False,
                {"field": "color"},
            )
        normalized = {"color": color}
    elif method in {"system.statusLightOff", "system.stopAll"}:
        normalized = {}
    elif method in {"data.startCollect", "data.addPoint"}:
        normalized = {"label": _label(params)}
    elif method == "data.startAutoCollect":
        normalized = {
            "interval_ms": _milliseconds(params),
            "label": _label(params),
        }
    elif method in {
        "data.stopCollect",
        "data.getAll",
        "data.clear",
        "data.uploadToTrainer",
        "data.exportCSV",
    }:
        normalized = {}
    else:
        raise EV3CommandError(
            "EV3_INVALID_COMMAND",
            "EV3 command method is not allowed",
            False,
        )

    return ValidatedCommand(method, normalized)


class EV3DevHardware:
    """Thin ev3dev2 adapter used on the EV3 brick."""

    def __init__(self) -> None:
        from ev3dev2.button import Button
        from ev3dev2.display import Display
        from ev3dev2.led import Leds
        from ev3dev2.motor import (
            LargeMotor,
            MediumMotor,
            OUTPUT_A,
            OUTPUT_B,
            OUTPUT_C,
            OUTPUT_D,
            SpeedPercent,
        )
        from ev3dev2.power import PowerSupply
        from ev3dev2.sensor.lego import (
            ColorSensor,
            GyroSensor,
            InfraredSensor,
            TouchSensor,
            UltrasonicSensor,
        )
        from ev3dev2.sound import Sound

        self._speed_percent = SpeedPercent
        self._sensor_classes = [
            ColorSensor,
            UltrasonicSensor,
            GyroSensor,
            TouchSensor,
            InfraredSensor,
        ]
        self._motor_classes = [LargeMotor, MediumMotor]
        self._motor_ports = {
            "A": OUTPUT_A,
            "B": OUTPUT_B,
            "C": OUTPUT_C,
            "D": OUTPUT_D,
        }
        self._sensor_ports = {
            "S1": "in1",
            "S2": "in2",
            "S3": "in3",
            "S4": "in4",
        }
        self.motors = self._detect_motors()
        self.sensors = self._detect_sensors()
        self.power = PowerSupply()
        self.sound = Sound()
        self._play_wait = Sound.PLAY_WAIT_FOR_COMPLETE
        self._play_no_wait = Sound.PLAY_NO_WAIT_FOR_COMPLETE
        self._last_sound_handle = None
        self.display = Display()
        self.buttons = Button()
        self.leds = Leds()
        self._led_groups = (
            getattr(Leds, "LEFT", "LEFT"),
            getattr(Leds, "RIGHT", "RIGHT"),
        )
        self._snapshot_clock = time.monotonic
        self._slow_snapshot_interval = SLOW_SNAPSHOT_INTERVAL
        self._slow_snapshot_at = 0.0
        self._slow_snapshot = None  # type: Optional[Dict[str, Any]]

    def _detect_motors(self) -> Dict[str, Any]:
        motors = {}
        for port_name, ev3_port in self._motor_ports.items():
            for motor_class in self._motor_classes:
                try:
                    motors[port_name] = motor_class(ev3_port)
                    break
                except Exception:
                    continue
        return motors

    def _detect_sensors(self) -> Dict[str, Any]:
        sensors = {}
        for port_name, ev3_port in self._sensor_ports.items():
            for sensor_class in self._sensor_classes:
                try:
                    sensors[port_name] = sensor_class(ev3_port)
                    break
                except Exception:
                    continue
        return sensors

    def _motor(self, port: str) -> Any:
        motor = self.motors.get(port)
        if motor is None:
            raise EV3CommandError(
                "EV3_INVALID_PORT",
                "EV3 motor port is not connected",
                False,
                {"port": port},
            )
        return motor

    def motor_run_forever(self, port: str, speed: int) -> None:
        self._motor(port).on(self._speed_percent(speed), brake=False, block=False)

    def motor_run_timed(self, port: str, speed: int, seconds: float) -> None:
        self._motor(port).on_for_seconds(
            self._speed_percent(speed), seconds, brake=True, block=False
        )

    def motor_run_to_abs_pos(self, port: str, degrees: float, speed: int) -> None:
        self._motor(port).on_to_position(
            self._speed_percent(speed), degrees, brake=True, block=False
        )

    def motor_run_to_rel_pos(self, port: str, degrees: float, speed: int) -> None:
        motor = self._motor(port)
        target = getattr(motor, "position", 0) + degrees
        motor.on_to_position(
            self._speed_percent(speed), target, brake=True, block=False
        )

    def motor_stop(self, port: str) -> None:
        self._motor(port).stop()

    def motor_stop_all(self) -> None:
        for motor in self.motors.values():
            try:
                motor.stop()
            except Exception:
                continue

    def motor_reset_position(self, port: str) -> None:
        self._motor(port).reset()

    def motor_set_pid(
        self,
        port: str,
        mode: str,
        term: str,
        value: float,
    ) -> None:
        motor = self._motor(port)
        attr = self._motor_pid_attr(mode, term)
        if not hasattr(motor, attr):
            raise EV3CommandError(
                "EV3_HARDWARE_ERROR",
                "Motor PID attribute is not supported",
                True,
                {"port": port, "mode": mode, "term": term},
            )
        setattr(motor, attr, value)
        self._invalidate_slow_snapshot()

    def _motor_pid_attr(self, mode: str, term: str) -> str:
        return "{}_{}".format(mode, MOTOR_PID_ATTR_SUFFIX[term])

    def sync_run(self, port_l: str, port_r: str, speed: int, seconds: float) -> None:
        self.motor_run_timed(port_l, speed, seconds)
        self.motor_run_timed(port_r, speed, seconds)

    def sync_turn(self, port_l: str, port_r: str, speed: int, turn: int) -> None:
        self.motor_run_forever(port_l, speed + turn)
        self.motor_run_forever(port_r, speed - turn)

    def sound_play_tone(
        self, freq: int, duration: float, volume: int, wait: bool = False
    ) -> None:
        play_type = self._play_wait if wait else self._play_no_wait
        handle = self.sound.play_tone(
            freq,
            duration,
            volume=volume,
            play_type=play_type,
        )
        if not wait:
            self._last_sound_handle = handle

    def sound_beep(self) -> None:
        self._last_sound_handle = self.sound.beep(play_type=self._play_no_wait)

    def sound_stop(self) -> None:
        handle = self._last_sound_handle
        self._last_sound_handle = None
        if handle is None:
            return
        if hasattr(handle, "terminate"):
            handle.terminate()
            return
        try:
            os.kill(int(handle), signal.SIGTERM)
        except (OSError, TypeError, ValueError):
            return

    def sound_set_volume(self, volume: int) -> None:
        self.sound.set_volume(volume)

    def sound_play_file(self, file: str) -> None:
        self._last_sound_handle = self.sound.play_file(
            file,
            play_type=self._play_no_wait,
        )

    def display_text(self, text: str, line: int) -> None:
        self.display.text_pixels(text, x=0, y=(line - 1) * 16, clear_screen=False)
        self.display.update()

    def display_number(self, number: Any, line: int) -> None:
        self.display_text(str(number), line)

    def display_text_at(self, text: str, x: int, y: int) -> None:
        self.display.text_pixels(text, x=x, y=y, clear_screen=False)
        self.display.update()

    def display_clear(self) -> None:
        self.display.clear()
        self.display.update()

    def display_image(self, image: str) -> None:
        from PIL import Image

        picture = Image.open(image)
        self.display.image.paste(picture, (0, 0))
        self.display.update()

    def display_update(self) -> None:
        self.display.update()

    def display_draw_line(self, x1: int, y1: int, x2: int, y2: int) -> None:
        self.display.line(False, x1, y1, x2, y2)
        self.display.update()

    def display_draw_circle(self, x: int, y: int, radius: int) -> None:
        self.display.circle(False, x, y, radius)
        self.display.update()

    def status_light_set(self, color: str) -> None:
        ev3_color = color.upper()
        for group in self._led_groups:
            self.leds.set_color(group, ev3_color)

    def status_light_off(self) -> None:
        for group in self._led_groups:
            self.leds.set_color(group, "BLACK")

    def system_stop_all(self) -> None:
        self.motor_stop_all()
        self.sound_stop()
        self.status_light_off()

    def gyro_reset(self, port: str) -> None:
        sensor = self.sensors.get(port)
        if sensor is None or not hasattr(sensor, "reset"):
            raise EV3CommandError(
                "EV3_INVALID_PORT",
                "EV3 gyro port is not connected",
                False,
                {"port": port},
            )
        sensor.reset()

    def read_all(self) -> Dict[str, Any]:
        slow_snapshot = self._get_slow_snapshot()
        motors = self._read_motors(include_pid=False)
        for port, pid in slow_snapshot.get("motor_pid", {}).items():
            motor_data = motors.get(port)
            if isinstance(motor_data, dict) and "error" not in motor_data:
                motor_data["pid"] = pid
        return {
            "sensors": self._read_sensors(),
            "motors": motors,
            "system": dict(slow_snapshot.get("system", {})),
        }

    def _get_slow_snapshot(self) -> Dict[str, Any]:
        snapshot = getattr(self, "_slow_snapshot", None)
        if snapshot is None:
            return {"motor_pid": {}, "system": {}}
        return snapshot

    def refresh_slow_snapshot(self) -> Dict[str, Any]:
        clock = getattr(self, "_snapshot_clock", time.monotonic)
        now = clock()
        snapshot = self._read_slow_snapshot()
        self._slow_snapshot = snapshot
        self._slow_snapshot_at = now
        return snapshot

    def _read_slow_snapshot(self) -> Dict[str, Any]:
        motor_pid = {}
        for port, motor in self.motors.items():
            try:
                motor_pid[port] = self._read_motor_pid(motor)
            except Exception as exc:
                motor_pid[port] = {"error": str(exc)}
        return {
            "motor_pid": motor_pid,
            "system": self._read_system(),
        }

    def _invalidate_slow_snapshot(self) -> None:
        self._slow_snapshot_at = 0.0

    def _read_sensors(self) -> Dict[str, Any]:
        data = {}
        for port, sensor in self.sensors.items():
            try:
                data[port] = self._read_sensor(sensor)
            except Exception as exc:
                data[port] = {"error": str(exc)}
        return data

    def _read_sensor(self, sensor: Any) -> Dict[str, Any]:
        if hasattr(sensor, "reflected_light_intensity"):
            return {
                "type": "color",
                "color": sensor.color,
                "reflected": sensor.reflected_light_intensity,
                "ambient": sensor.ambient_light_intensity,
                "rgb": list(sensor.rgb),
            }
        if hasattr(sensor, "distance_centimeters"):
            return {
                "type": "ultrasonic",
                "distance_cm": sensor.distance_centimeters,
                "distance_inch": sensor.distance_inches,
            }
        if hasattr(sensor, "rate") and hasattr(sensor, "angle"):
            return {"type": "gyro", "angle": sensor.angle, "rate": sensor.rate}
        if hasattr(sensor, "is_pressed"):
            return {"type": "touch", "pressed": sensor.is_pressed}
        if hasattr(sensor, "proximity"):
            return {
                "type": "infrared",
                "distance": sensor.proximity,
                "beacon": self._read_ir_beacon_channels(sensor),
                "remote": self._read_ir_remote_channels(sensor),
            }
        return {"type": "unknown"}

    def _read_ir_beacon_channels(self, sensor: Any) -> Dict[str, Any]:
        data = {}
        for channel in range(1, 5):
            heading = 0
            distance = 0
            try:
                if hasattr(sensor, "heading_and_distance"):
                    heading, distance = sensor.heading_and_distance(channel)
                else:
                    if hasattr(sensor, "heading"):
                        heading = sensor.heading(channel)
                    if hasattr(sensor, "distance"):
                        distance = sensor.distance(channel)
            except Exception:
                heading = 0
                distance = 0
            data[str(channel)] = {
                "heading": 0 if heading is None else heading,
                "distance": 0 if distance is None else distance,
            }
        return data

    def _read_ir_remote_channels(self, sensor: Any) -> Dict[str, Any]:
        data = {}
        for channel in range(1, 5):
            buttons = []
            try:
                if hasattr(sensor, "buttons_pressed"):
                    buttons = list(sensor.buttons_pressed(channel) or [])
                else:
                    buttons = [
                        name
                        for name in [
                            "top_left",
                            "bottom_left",
                            "top_right",
                            "bottom_right",
                            "beacon",
                        ]
                        if hasattr(sensor, name) and getattr(sensor, name)(channel)
                    ]
            except Exception:
                buttons = []
            data[str(channel)] = {"buttons": buttons}
        return data

    def _read_motors(self, include_pid: bool = True) -> Dict[str, Any]:
        data = {}
        for port, motor in self.motors.items():
            try:
                snapshot = {
                    "position": motor.position,
                    "speed": motor.speed,
                    "running": motor.is_running,
                }
                if include_pid:
                    snapshot["pid"] = self._read_motor_pid(motor)
                data[port] = snapshot
            except Exception as exc:
                data[port] = {"error": str(exc)}
        return data

    def _read_motor_pid(self, motor: Any) -> Dict[str, Any]:
        return {
            mode: {
                term: getattr(
                    motor,
                    self._motor_pid_attr(mode, term),
                    0,
                )
                for term in sorted(MOTOR_PID_TERMS)
            }
            for mode in sorted(MOTOR_PID_MODES)
        }

    def _read_system(self) -> Dict[str, Any]:
        return {
            "battery_pct": getattr(self.power, "measured_battery_level", 0),
            "battery_v": getattr(self.power, "measured_volts", 0),
            "buttons": {
                "up": self.buttons.up,
                "down": self.buttons.down,
                "left": self.buttons.left,
                "right": self.buttons.right,
                "center": self.buttons.enter,
            },
        }


class VSLEEV3Server:
    """Command, sensor, and WebSocket orchestration for one EV3 brick."""

    def __init__(
        self,
        hardware: Any,
        pairing_token: str = PAIRING_TOKEN,
        max_collected_points: int = MAX_COLLECTED_POINTS,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.hardware = hardware
        self.pairing_token = pairing_token
        self.max_collected_points = max_collected_points
        self.clock = clock
        self.clients = set()  # type: Set[Any]
        self.collecting = False
        self.collect_label = ""
        self.auto_collect_interval_s = None  # type: Optional[float]
        self.last_auto_collect_at = None  # type: Optional[float]
        self.collected_data = []  # type: List[Dict[str, Any]]
        self._stopping = False
        self._stop_event = None  # type: Optional[Any]

    async def authenticate_client(self, websocket: Any) -> bool:
        """Require `auth.pair` before accepting commands when token is set."""
        if not self.pairing_token:
            return True

        try:
            raw = await asyncio.wait_for(websocket.recv(), timeout=5)
            message = json.loads(raw)
        except (asyncio.TimeoutError, json.JSONDecodeError):
            await websocket.close(code=1008, reason="pairing required")
            return False

        token = message.get("params", {}).get("token")
        if message.get("method") != "auth.pair" or token != self.pairing_token:
            await websocket.close(code=1008, reason="pairing failed")
            return False

        await self._send_json(
            websocket,
            {"type": "ack", "id": message.get("id"), "ok": True},
        )
        return True

    async def handle_client(self, websocket: Any, _path: str = "") -> None:
        """Handle one WebSocket client and stop motors on disconnect."""
        if not await self.authenticate_client(websocket):
            return

        self.clients.add(websocket)
        try:
            while True:
                try:
                    raw = await websocket.recv()
                except Exception:
                    break
                response = self.handle_raw_message(raw)
                try:
                    await self._send_json(websocket, response)
                except Exception:
                    break
        finally:
            self.clients.discard(websocket)
            self.hardware.motor_stop_all()

    async def handle_bluetooth_endpoint(
        self,
        endpoint: BluetoothLineEndpoint,
    ) -> None:
        """Handle one Bluetooth RFCOMM JSON-line client."""
        await self.handle_client(endpoint)

    def handle_raw_message(self, raw: str) -> Dict[str, Any]:
        """Decode a JSON command and return an EV3 ack envelope."""
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            return self._error_ack(
                None,
                EV3CommandError("EV3_INVALID_COMMAND", "Invalid JSON command", False),
            )
        return self.handle_command(message)

    def handle_command(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and execute one EV3 command."""
        request_id = message.get("id")
        try:
            command = validate_command(message)
            result = self._execute_command(command)
        except EV3CommandError as exc:
            return self._error_ack(request_id, exc)
        except Exception as exc:
            return self._error_ack(
                request_id,
                EV3CommandError(
                    "EV3_HARDWARE_ERROR",
                    str(exc),
                    True,
                    {"exception_type": type(exc).__name__},
                ),
            )

        if result is None:
            return {"type": "ack", "id": request_id, "ok": True}
        return {"type": "ack", "id": request_id, "ok": True, **result}

    def _execute_command(self, command: ValidatedCommand) -> Optional[Dict[str, Any]]:
        method = command.method
        params = command.params

        if method == "motor.runForever":
            self.hardware.motor_run_forever(params["port"], params["speed"])
        elif method == "motor.runTimed":
            self.hardware.motor_run_timed(
                params["port"], params["speed"], params["time"]
            )
        elif method == "motor.runToAbsPos":
            self.hardware.motor_run_to_abs_pos(
                params["port"], params["degrees"], params["speed"]
            )
        elif method == "motor.runToRelPos":
            self.hardware.motor_run_to_rel_pos(
                params["port"], params["degrees"], params["speed"]
            )
        elif method == "motor.stop":
            self.hardware.motor_stop(params["port"])
        elif method == "motor.stopAll":
            self.hardware.motor_stop_all()
        elif method == "motor.syncRun":
            self.hardware.sync_run(
                params["port_l"],
                params["port_r"],
                params["speed"],
                params["time"],
            )
        elif method == "motor.syncTurn":
            self.hardware.sync_turn(
                params["port_l"],
                params["port_r"],
                params["speed"],
                params["turn"],
            )
        elif method == "motor.resetPosition":
            self.hardware.motor_reset_position(params["port"])
        elif method == "motor.setPID":
            self.hardware.motor_set_pid(
                params["port"],
                params["mode"],
                params["term"],
                params["value"],
            )
        elif method in {"sound.playTone", "sound.playToneWait"}:
            self.hardware.sound_play_tone(
                params["freq"],
                params["duration"],
                params["volume"],
                wait=method.endswith("Wait"),
            )
        elif method == "sound.playFile":
            self.hardware.sound_play_file(params["file"])
        elif method == "sound.beep":
            self.hardware.sound_beep()
        elif method == "sound.stop":
            self.hardware.sound_stop()
        elif method == "sound.setVolume":
            self.hardware.sound_set_volume(params["volume"])
        elif method == "display.text":
            self.hardware.display_text(params["text"], params["line"])
        elif method == "display.number":
            self.hardware.display_number(params["number"], params["line"])
        elif method == "display.clear":
            self.hardware.display_clear()
        elif method == "display.image":
            self.hardware.display_image(params["image"])
        elif method == "display.textAt":
            self.hardware.display_text_at(params["text"], params["x"], params["y"])
        elif method == "display.drawLine":
            self.hardware.display_draw_line(
                params["x1"], params["y1"], params["x2"], params["y2"]
            )
        elif method == "display.drawCircle":
            self.hardware.display_draw_circle(params["x"], params["y"], params["r"])
        elif method == "display.update":
            self.hardware.display_update()
        elif method == "gyro.reset":
            self.hardware.gyro_reset(params["port"])
        elif method == "system.setStatusLight":
            self.hardware.status_light_set(params["color"])
        elif method == "system.statusLightOff":
            self.hardware.status_light_off()
        elif method == "system.stopAll":
            self.hardware.system_stop_all()
        elif method == "data.startCollect":
            self.collecting = True
            self.collect_label = params["label"]
            self.auto_collect_interval_s = None
            self.last_auto_collect_at = None
        elif method == "data.stopCollect":
            self.collecting = False
            self.auto_collect_interval_s = None
            self.last_auto_collect_at = None
        elif method == "data.addPoint":
            self.record_data_point(params["label"])
        elif method == "data.getAll":
            return {"data": list(self.collected_data)}
        elif method == "data.clear":
            self.collected_data.clear()
        elif method == "data.exportCSV":
            return {
                "filename": "vsle_ev3_data.csv",
                "csv": self.export_data_csv(),
            }
        elif method == "data.uploadToTrainer":
            raise EV3CommandError(
                "TRAINER_UNAVAILABLE",
                "WeisileAI Trainer upload endpoint is not connected",
                True,
            )
        elif method == "data.startAutoCollect":
            self.collecting = True
            self.collect_label = params["label"]
            self.auto_collect_interval_s = params["interval_ms"] / 1000
            self.last_auto_collect_at = None

        return None

    def _error_ack(self, request_id: Any, error: EV3CommandError) -> Dict[str, Any]:
        return {
            "type": "ack",
            "id": request_id,
            "ok": False,
            "code": error.code,
            "error": error.message,
            "retryable": error.retryable,
            **error.data,
        }

    def build_sensor_update(self) -> Dict[str, Any]:
        """Build one 50Hz sensor update payload."""
        snapshot = self.hardware.read_all()
        system = dict(snapshot.get("system", {}))
        system.update(
            {
                "collected_points": len(self.collected_data),
                "collecting": self.collecting,
                "collect_label": self.collect_label,
            }
        )
        return {
            "type": "sensor_update",
            "timestamp": self.clock(),
            "sensors": snapshot.get("sensors", {}),
            "motors": snapshot.get("motors", {}),
            "system": system,
        }

    def record_data_point(self, label: Optional[str] = None) -> None:
        """Append one bounded labeled data point from the latest sensors."""
        if len(self.collected_data) >= self.max_collected_points:
            raise EV3CommandError(
                "DATA_BUFFER_FULL",
                "Collection buffer reached configured cap",
                False,
                {
                    "collected_points": len(self.collected_data),
                    "max_collected_points": self.max_collected_points,
                },
            )
        payload = self.build_sensor_update()
        payload["label"] = label if label is not None else self.collect_label
        self.collected_data.append(payload)

    def maybe_record_collected_data(self) -> bool:
        """Record when collection is enabled and interval rules allow it."""
        if not self.collecting:
            return False
        now = self.clock()
        if self.auto_collect_interval_s is not None:
            if (
                self.last_auto_collect_at is not None
                and now - self.last_auto_collect_at < self.auto_collect_interval_s
            ):
                return False
            self.last_auto_collect_at = now
        self.record_data_point()
        return True

    def export_data_csv(self) -> str:
        """Return collected data as flat CSV for classroom export."""
        rows = [self._flatten_data_point(point) for point in self.collected_data]
        if not rows:
            return "label,timestamp\n"
        fieldnames = sorted({key for row in rows for key in row.keys()})
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
        return output.getvalue()

    def _flatten_data_point(
        self, point: Dict[str, Any], prefix: str = ""
    ) -> Dict[str, Any]:
        flat = {}  # type: Dict[str, Any]
        for key, value in point.items():
            name = "{}.{}".format(prefix, key) if prefix else key
            if isinstance(value, dict):
                flat.update(self._flatten_data_point(value, name))
            elif isinstance(value, list):
                flat[name] = json.dumps(value, separators=(",", ":"))
            else:
                flat[name] = value
        return flat

    async def sensor_broadcast_loop(self) -> None:
        """Broadcast sensor updates at 50Hz and keep bounded local data."""
        next_tick = time.monotonic()
        while not self._stopping:
            if self.clients:
                try:
                    self.maybe_record_collected_data()
                except EV3CommandError:
                    self.collecting = False
                payload = self.build_sensor_update()
                await self._broadcast(payload)

            next_tick += SENSOR_INTERVAL
            sleep_for = next_tick - time.monotonic()
            if sleep_for <= 0:
                next_tick = time.monotonic()
                sleep_for = 0
            await asyncio.sleep(sleep_for)

    async def slow_snapshot_loop(self) -> None:
        """Refresh slow hardware fields outside the 50Hz sensor hot path."""
        refresh = getattr(self.hardware, "refresh_slow_snapshot", None)
        if refresh is None:
            return
        loop = _get_event_loop()
        while not self._stopping:
            try:
                await loop.run_in_executor(None, refresh)
            except Exception:
                pass
            interval = getattr(
                self.hardware,
                "_slow_snapshot_interval",
                SLOW_SNAPSHOT_INTERVAL,
            )
            await asyncio.sleep(max(0.0, interval))

    async def _broadcast(self, payload: Dict[str, Any]) -> None:
        full_message = json.dumps(payload)
        bluetooth_message = None
        disconnected = set()
        for websocket in set(self.clients):
            try:
                message = full_message
                if isinstance(websocket, BluetoothLineEndpoint):
                    if bluetooth_message is None:
                        bluetooth_message = json.dumps(
                            self._compact_bluetooth_sensor_update(payload),
                            separators=(",", ":"),
                        )
                    message = bluetooth_message
                    await websocket.send_latest_sensor(message)
                else:
                    await websocket.send(message)
            except Exception:
                disconnected.add(websocket)
        self.clients -= disconnected

    def _compact_bluetooth_sensor_update(
        self,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Return a small high-frequency payload for RFCOMM sensor streams."""
        if payload.get("type") != "sensor_update":
            return payload

        motors = {}
        for port, values in payload.get("motors", {}).items():
            if not isinstance(values, dict):
                continue
            compact_motor = {}
            for key in ("position", "speed", "running"):
                if key in values:
                    compact_motor[key] = values[key]
            motors[port] = compact_motor

        return {
            "type": "sensor_update",
            "timestamp": payload.get("timestamp"),
            "sensors": payload.get("sensors", {}),
            "motors": motors,
            "system": {},
        }

    async def _send_json(self, websocket: Any, payload: Dict[str, Any]) -> None:
        await websocket.send(json.dumps(payload))

    async def run(
        self,
        host: str = "0.0.0.0",
        port: int = WS_PORT,
        serve: Optional[Callable[..., Any]] = None,
        enable_bluetooth: bool = False,
        bluetooth_address: str = "",
        bluetooth_channel: int = BT_RFCOMM_CHANNEL,
        socket_module: Any = socket,
    ) -> None:
        """Run the WebSocket server and optional Bluetooth fallback server."""
        if serve is None:
            import websockets

            serve = websockets.serve
        self._stopping = False

        loop = _get_event_loop()
        for signame in ("SIGINT", "SIGTERM"):
            sig = getattr(signal, signame, None)
            if sig is not None:
                try:
                    loop.add_signal_handler(sig, self.stop)
                except (NotImplementedError, RuntimeError):
                    pass

        self._stop_event = asyncio.Event()
        sensor_task = _create_task(self.sensor_broadcast_loop())
        slow_snapshot_task = _create_task(self.slow_snapshot_loop())
        bluetooth_task = None
        if enable_bluetooth:
            bluetooth_task = _create_task(
                self.run_bluetooth(
                    address=bluetooth_address,
                    channel=bluetooth_channel,
                    socket_module=socket_module,
                )
            )
        server = await serve(self.handle_client, host, port, ping_interval=5)
        try:
            if hasattr(server, "serve_forever"):
                await server.serve_forever()
            else:
                await self._stop_event.wait()
        finally:
            self.stop()
            if not hasattr(server, "serve_forever"):
                server.close()
                await server.wait_closed()
            sensor_task.cancel()
            slow_snapshot_task.cancel()
            if bluetooth_task is not None:
                bluetooth_task.cancel()
            self.hardware.motor_stop_all()
            try:
                await sensor_task
            except asyncio.CancelledError:
                pass
            try:
                await slow_snapshot_task
            except asyncio.CancelledError:
                pass
            if bluetooth_task is not None:
                try:
                    await bluetooth_task
                except asyncio.CancelledError:
                    pass

    async def run_bluetooth(
        self,
        address: str = "",
        channel: int = BT_RFCOMM_CHANNEL,
        socket_module: Any = socket,
    ) -> None:
        """Run a stdlib RFCOMM JSON-line server until cancelled."""
        listener = build_bluetooth_listener(
            socket_module=socket_module,
            address=address,
            channel=channel,
        )
        loop = _get_event_loop()
        tasks = set()  # type: Set[Any]
        try:
            while not self._stopping:
                client_socket, _client_address = await loop.run_in_executor(
                    None,
                    listener.accept,
                )
                endpoint = BluetoothLineEndpoint(client_socket)
                task = _create_task(self.handle_bluetooth_endpoint(endpoint))
                tasks.add(task)
                task.add_done_callback(tasks.discard)
        finally:
            listener.close()
            for task in set(tasks):
                task.cancel()
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)

    def stop(self) -> None:
        """Request server shutdown and stop all motors for safety."""
        self._stopping = True
        if self._stop_event is not None and not self._stop_event.is_set():
            self._stop_event.set()
        self.hardware.motor_stop_all()


def main() -> None:
    """CLI entrypoint for systemd."""
    host = os.getenv("EV3_WS_HOST", "0.0.0.0")
    port = int(os.getenv("EV3_WS_PORT", str(WS_PORT)))
    enable_bluetooth = os.getenv("EV3_ENABLE_BLUETOOTH", "0") == "1"
    bluetooth_address = os.getenv("EV3_BT_ADDRESS", "")
    bluetooth_channel = int(os.getenv("EV3_BT_RFCOMM_CHANNEL", str(BT_RFCOMM_CHANNEL)))
    server = VSLEEV3Server(EV3DevHardware(), pairing_token=PAIRING_TOKEN)
    _run_async(
        server.run(
            host=host,
            port=port,
            enable_bluetooth=enable_bluetooth,
            bluetooth_address=bluetooth_address,
            bluetooth_channel=bluetooth_channel,
        )
    )


if __name__ == "__main__":
    main()
