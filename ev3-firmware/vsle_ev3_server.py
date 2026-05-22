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
import json
import os
import signal
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Set

WS_PORT = int(os.getenv("EV3_WS_PORT", "8765"))
SENSOR_INTERVAL = 0.02
MAX_COLLECTED_POINTS = int(os.getenv("MAX_COLLECTED_POINTS", "10000"))
PAIRING_TOKEN = os.getenv("WEISILE_PAIRING_TOKEN", "")

MOTOR_PORTS = {"A", "B", "C", "D"}
SENSOR_PORTS = {"S1", "S2", "S3", "S4"}
LCD_X_MAX = 177
LCD_Y_MAX = 127
MAX_LABEL_LENGTH = 64


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


@dataclass(frozen=True)
class ValidatedCommand:
    """Validated EV3 command ready for hardware dispatch."""

    method: str
    params: Dict[str, Any]


def _number(params: Dict[str, Any], field: str, default: Any = None) -> float:
    value = params.get(field, default)
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise EV3CommandError(
            "EV3_INVALID_COMMAND",
            f"{field} must be numeric",
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
    elif method in {"sound.beep", "sound.stop", "display.clear"}:
        normalized = {}
    elif method == "sound.setVolume":
        normalized = {"volume": _volume(params)}
    elif method == "display.text":
        normalized = {
            "text": str(params.get("text", "")),
            "line": _clamp(_number(params, "line", 1), 1, 8),
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
    elif method == "gyro.reset":
        normalized = {"port": _sensor_port(params)}
    elif method in {"data.startCollect", "data.addPoint"}:
        normalized = {"label": _label(params)}
    elif method in {"data.stopCollect", "data.getAll", "data.clear"}:
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
        self._motor(port).on(
            self._speed_percent(speed), brake=False, block=False
        )

    def motor_run_timed(self, port: str, speed: int, seconds: float) -> None:
        self._motor(port).on_for_seconds(
            self._speed_percent(speed), seconds, brake=True, block=False
        )

    def motor_run_to_abs_pos(
        self, port: str, degrees: float, speed: int
    ) -> None:
        self._motor(port).on_to_position(
            self._speed_percent(speed), degrees, brake=True, block=False
        )

    def motor_run_to_rel_pos(
        self, port: str, degrees: float, speed: int
    ) -> None:
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

    def sync_run(
        self, port_l: str, port_r: str, speed: int, seconds: float
    ) -> None:
        self.motor_run_timed(port_l, speed, seconds)
        self.motor_run_timed(port_r, speed, seconds)

    def sync_turn(
        self, port_l: str, port_r: str, speed: int, turn: int
    ) -> None:
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

    def display_text(self, text: str, line: int) -> None:
        self.display.text_pixels(
            text, x=0, y=(line - 1) * 16, clear_screen=False
        )
        self.display.update()

    def display_clear(self) -> None:
        self.display.clear()
        self.display.update()

    def display_draw_line(self, x1: int, y1: int, x2: int, y2: int) -> None:
        self.display.line(False, x1, y1, x2, y2)
        self.display.update()

    def display_draw_circle(self, x: int, y: int, radius: int) -> None:
        self.display.circle(False, x, y, radius)
        self.display.update()

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
        return {
            "sensors": self._read_sensors(),
            "motors": self._read_motors(),
            "system": self._read_system(),
        }

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
                        if hasattr(sensor, name)
                        and getattr(sensor, name)(channel)
                    ]
            except Exception:
                buttons = []
            data[str(channel)] = {"buttons": buttons}
        return data

    def _read_motors(self) -> Dict[str, Any]:
        data = {}
        for port, motor in self.motors.items():
            try:
                data[port] = {
                    "position": motor.position,
                    "speed": motor.speed,
                    "running": motor.is_running,
                }
            except Exception as exc:
                data[port] = {"error": str(exc)}
        return data

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
        self.clients: Set[Any] = set()
        self.collecting = False
        self.collect_label = ""
        self.collected_data: List[Dict[str, Any]] = []
        self._stopping = False

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
            async for raw in websocket:
                response = self.handle_raw_message(raw)
                await self._send_json(websocket, response)
        finally:
            self.clients.discard(websocket)
            self.hardware.motor_stop_all()

    def handle_raw_message(self, raw: str) -> Dict[str, Any]:
        """Decode a JSON command and return an EV3 ack envelope."""
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            return self._error_ack(
                None,
                EV3CommandError(
                    "EV3_INVALID_COMMAND", "Invalid JSON command", False
                ),
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

    def _execute_command(
        self, command: ValidatedCommand
    ) -> Optional[Dict[str, Any]]:
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
        elif method in {"sound.playTone", "sound.playToneWait"}:
            self.hardware.sound_play_tone(
                params["freq"],
                params["duration"],
                params["volume"],
                wait=method.endswith("Wait"),
            )
        elif method == "sound.beep":
            self.hardware.sound_beep()
        elif method == "sound.stop":
            self.hardware.sound_stop()
        elif method == "sound.setVolume":
            self.hardware.sound_set_volume(params["volume"])
        elif method == "display.text":
            self.hardware.display_text(params["text"], params["line"])
        elif method == "display.clear":
            self.hardware.display_clear()
        elif method == "display.drawLine":
            self.hardware.display_draw_line(
                params["x1"], params["y1"], params["x2"], params["y2"]
            )
        elif method == "display.drawCircle":
            self.hardware.display_draw_circle(
                params["x"], params["y"], params["r"]
            )
        elif method == "gyro.reset":
            self.hardware.gyro_reset(params["port"])
        elif method == "data.startCollect":
            self.collecting = True
            self.collect_label = params["label"]
        elif method == "data.stopCollect":
            self.collecting = False
        elif method == "data.addPoint":
            self.record_data_point(params["label"])
        elif method == "data.getAll":
            return {"data": list(self.collected_data)}
        elif method == "data.clear":
            self.collected_data.clear()

        return None

    def _error_ack(
        self, request_id: Any, error: EV3CommandError
    ) -> Dict[str, Any]:
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
        return {
            "type": "sensor_update",
            "timestamp": self.clock(),
            "sensors": snapshot.get("sensors", {}),
            "motors": snapshot.get("motors", {}),
            "system": snapshot.get("system", {}),
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

    async def sensor_broadcast_loop(self) -> None:
        """Broadcast sensor updates at 50Hz and keep bounded local data."""
        next_tick = time.monotonic()
        while not self._stopping:
            if self.clients:
                payload = self.build_sensor_update()
                if self.collecting:
                    try:
                        self.record_data_point()
                    except EV3CommandError:
                        self.collecting = False
                await self._broadcast(payload)

            next_tick += SENSOR_INTERVAL
            sleep_for = next_tick - time.monotonic()
            if sleep_for <= 0:
                next_tick = time.monotonic()
                sleep_for = 0
            await asyncio.sleep(sleep_for)

    async def _broadcast(self, payload: Dict[str, Any]) -> None:
        message = json.dumps(payload)
        disconnected = set()
        for websocket in set(self.clients):
            try:
                await websocket.send(message)
            except Exception:
                disconnected.add(websocket)
        self.clients -= disconnected

    async def _send_json(self, websocket: Any, payload: Dict[str, Any]) -> None:
        await websocket.send(json.dumps(payload))

    async def run(
        self,
        host: str = "0.0.0.0",
        port: int = WS_PORT,
        serve: Optional[Callable[..., Any]] = None,
    ) -> None:
        """Run the WebSocket server until cancelled or signaled."""
        if serve is None:
            import websockets

            serve = websockets.serve
        self._stopping = False

        loop = asyncio.get_running_loop()
        for signame in ("SIGINT", "SIGTERM"):
            sig = getattr(signal, signame, None)
            if sig is not None:
                try:
                    loop.add_signal_handler(sig, self.stop)
                except (NotImplementedError, RuntimeError):
                    pass

        sensor_task = asyncio.create_task(self.sensor_broadcast_loop())
        server = await serve(self.handle_client, host, port, ping_interval=5)
        try:
            await server.serve_forever()
        finally:
            self.stop()
            sensor_task.cancel()
            self.hardware.motor_stop_all()
            try:
                await sensor_task
            except asyncio.CancelledError:
                pass

    def stop(self) -> None:
        """Request server shutdown and stop all motors for safety."""
        self._stopping = True
        self.hardware.motor_stop_all()


def main() -> None:
    """CLI entrypoint for systemd."""
    host = os.getenv("EV3_WS_HOST", "0.0.0.0")
    port = int(os.getenv("EV3_WS_PORT", str(WS_PORT)))
    server = VSLEEV3Server(EV3DevHardware(), pairing_token=PAIRING_TOKEN)
    asyncio.run(server.run(host=host, port=port))


if __name__ == "__main__":
    main()
