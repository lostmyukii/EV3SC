"""EV3 command allowlist and parameter validation.

Sources:
- VSLE spec Section 10.5 payload validation rules.
- VSLE spec WeisileLink command reference.
- Scratch VM EV3 extension direct command names are source references only;
  this module validates VSLE JSON command envelopes.
"""

from dataclasses import dataclass
from typing import Any, Callable, Dict

from .errors import ErrorCode, ValidationError

MOTOR_PORTS = {"A", "B", "C", "D"}
SENSOR_PORTS = {"S1", "S2", "S3", "S4"}
LCD_X_MAX = 177
LCD_Y_MAX = 127
MAX_LABEL_LENGTH = 64


@dataclass(frozen=True)
class ValidatedCommand:
    """Normalized EV3 command ready for transport dispatch."""

    method: str
    params: Dict[str, Any]


def _invalid_command(method: str, message: str, **data: Any) -> ValidationError:
    return ValidationError(
        ErrorCode.EV3_INVALID_COMMAND,
        message,
        {"method": method, **data, "retryable": False},
    )


def _invalid_port(method: str, port: Any) -> ValidationError:
    return ValidationError(
        ErrorCode.EV3_INVALID_PORT,
        "Invalid EV3 port",
        {"method": method, "port": port, "retryable": False},
    )


def _number(
    method: str, params: Dict[str, Any], field: str, default: Any = None
) -> float:
    value = params.get(field, default)
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise _invalid_command(
            method, f"{field} must be numeric", field=field
        ) from exc


def _int_or_float(value: float) -> Any:
    as_float = float(value)
    return int(as_float) if as_float.is_integer() else as_float


def _clamp(value: float, lower: float, upper: float) -> Any:
    return _int_or_float(max(lower, min(upper, value)))


def _motor_port(
    method: str, params: Dict[str, Any], field: str = "port"
) -> str:
    port = str(params.get(field, "")).upper()
    if port not in MOTOR_PORTS:
        raise _invalid_port(method, params.get(field))
    return port


def _sensor_port(
    method: str, params: Dict[str, Any], field: str = "port"
) -> str:
    port = str(params.get(field, "")).upper()
    if port not in SENSOR_PORTS:
        raise _invalid_port(method, params.get(field))
    return port


def _speed(
    method: str, params: Dict[str, Any], field: str = "speed", default: Any = 0
) -> Any:
    return _clamp(_number(method, params, field, default), -100, 100)


def _duration(
    method: str, params: Dict[str, Any], field: str, default: Any = 0
) -> Any:
    return _clamp(_number(method, params, field, default), 0, 60)


def _frequency(method: str, params: Dict[str, Any], field: str = "freq") -> Any:
    return _clamp(_number(method, params, field), 20, 20000)


def _volume(
    method: str,
    params: Dict[str, Any],
    field: str = "volume",
    default: Any = 100,
) -> Any:
    return _clamp(_number(method, params, field, default), 0, 100)


def _coord(
    method: str,
    params: Dict[str, Any],
    field: str,
    upper: int,
) -> Any:
    return _clamp(_number(method, params, field), 0, upper)


def _label(method: str, params: Dict[str, Any], field: str = "label") -> str:
    value = str(params.get(field, ""))
    if len(value) > MAX_LABEL_LENGTH:
        raise _invalid_command(
            method, "label must be 64 characters or fewer", field=field
        )
    return value


def _empty(_method: str, _params: Dict[str, Any]) -> Dict[str, Any]:
    return {}


def _single_motor(method: str, params: Dict[str, Any]) -> Dict[str, Any]:
    return {"port": _motor_port(method, params)}


def _motor_speed(method: str, params: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "port": _motor_port(method, params),
        "speed": _speed(method, params),
    }


def _motor_timed(method: str, params: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "port": _motor_port(method, params),
        "speed": _speed(method, params),
        "time": _duration(method, params, "time"),
    }


def _motor_position(method: str, params: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "port": _motor_port(method, params),
        "degrees": _number(method, params, "degrees"),
        "speed": _speed(method, params, default=50),
    }


def _sync_run(method: str, params: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "port_l": _motor_port(method, params, "port_l"),
        "port_r": _motor_port(method, params, "port_r"),
        "speed": _speed(method, params),
        "time": _duration(method, params, "time"),
    }


def _sync_turn(method: str, params: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "port_l": _motor_port(method, params, "port_l"),
        "port_r": _motor_port(method, params, "port_r"),
        "speed": _speed(method, params),
        "turn": _speed(method, params, "turn"),
    }


def _tone(method: str, params: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "freq": _frequency(method, params),
        "duration": _duration(method, params, "duration", 0.5),
        "volume": _volume(method, params),
    }


def _set_volume(method: str, params: Dict[str, Any]) -> Dict[str, Any]:
    return {"volume": _volume(method, params)}


def _display_text(method: str, params: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "text": str(params.get("text", "")),
        "line": _clamp(_number(method, params, "line", 1), 1, 8),
    }


def _display_line(method: str, params: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "x1": _coord(method, params, "x1", LCD_X_MAX),
        "y1": _coord(method, params, "y1", LCD_Y_MAX),
        "x2": _coord(method, params, "x2", LCD_X_MAX),
        "y2": _coord(method, params, "y2", LCD_Y_MAX),
    }


def _display_circle(method: str, params: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "x": _coord(method, params, "x", LCD_X_MAX),
        "y": _coord(method, params, "y", LCD_Y_MAX),
        "r": _clamp(_number(method, params, "r"), 0, LCD_Y_MAX),
    }


def _gyro_reset(method: str, params: Dict[str, Any]) -> Dict[str, Any]:
    return {"port": _sensor_port(method, params)}


def _data_label(method: str, params: Dict[str, Any]) -> Dict[str, Any]:
    return {"label": _label(method, params)}


CommandValidator = Callable[[str, Dict[str, Any]], Dict[str, Any]]

COMMAND_VALIDATORS: Dict[str, CommandValidator] = {
    "motor.runForever": _motor_speed,
    "motor.runTimed": _motor_timed,
    "motor.runToAbsPos": _motor_position,
    "motor.runToRelPos": _motor_position,
    "motor.stop": _single_motor,
    "motor.stopAll": _empty,
    "motor.syncRun": _sync_run,
    "motor.syncTurn": _sync_turn,
    "motor.resetPosition": _single_motor,
    "sound.playTone": _tone,
    "sound.playToneWait": _tone,
    "sound.beep": _empty,
    "sound.stop": _empty,
    "sound.setVolume": _set_volume,
    "display.text": _display_text,
    "display.clear": _empty,
    "display.drawLine": _display_line,
    "display.drawCircle": _display_circle,
    "gyro.reset": _gyro_reset,
    "data.startCollect": _data_label,
    "data.stopCollect": _empty,
    "data.addPoint": _data_label,
    "data.getAll": _empty,
    "data.clear": _empty,
}


def validate_ev3_command(
    method: str, params: Dict[str, Any]
) -> ValidatedCommand:
    """Validate and normalize an EV3 command envelope."""
    validator = COMMAND_VALIDATORS.get(method)
    if validator is None:
        raise _invalid_command(method, "EV3 command method is not allowed")

    if not isinstance(params, dict):
        raise _invalid_command(method, "EV3 command params must be an object")

    return ValidatedCommand(method=method, params=validator(method, params))
