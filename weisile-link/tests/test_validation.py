import pytest

from weisile_link.protocol.errors import ErrorCode, ValidationError
from weisile_link.protocol.validation import validate_ev3_command


def test_unknown_method_raises_invalid_command():
    with pytest.raises(ValidationError) as exc_info:
        validate_ev3_command("motor.flyAway", {})

    error = exc_info.value
    assert error.code == ErrorCode.EV3_INVALID_COMMAND
    assert error.data == {"method": "motor.flyAway", "retryable": False}


def test_invalid_motor_port_raises_invalid_port():
    with pytest.raises(ValidationError) as exc_info:
        validate_ev3_command(
            "motor.runTimed",
            {"port": "Z", "speed": 50, "time": 2},
        )

    error = exc_info.value
    assert error.code == ErrorCode.EV3_INVALID_PORT
    assert error.data == {
        "method": "motor.runTimed",
        "port": "Z",
        "retryable": False,
    }


def test_invalid_sensor_port_raises_invalid_port():
    with pytest.raises(ValidationError) as exc_info:
        validate_ev3_command("gyro.reset", {"port": "A"})

    error = exc_info.value
    assert error.code == ErrorCode.EV3_INVALID_PORT
    assert error.data == {
        "method": "gyro.reset",
        "port": "A",
        "retryable": False,
    }


def test_motor_run_timed_returns_normalized_params():
    command = validate_ev3_command(
        "motor.runTimed",
        {"port": "a", "speed": "125", "time": "90"},
    )

    assert command.method == "motor.runTimed"
    assert command.params == {"port": "A", "speed": 100, "time": 60}


def test_play_tone_clamps_frequency_duration_and_volume():
    command = validate_ev3_command(
        "sound.playTone",
        {"freq": 5, "duration": 90, "volume": 101},
    )

    assert command.params == {"freq": 20, "duration": 60, "volume": 100}


def test_display_coordinates_are_clamped_to_lcd_bounds():
    command = validate_ev3_command(
        "display.drawLine",
        {"x1": -5, "y1": 200, "x2": 500, "y2": -1},
    )

    assert command.params == {"x1": 0, "y1": 127, "x2": 177, "y2": 0}


def test_sound_file_and_display_image_validate_safe_asset_names():
    sound = validate_ev3_command("sound.playFile", {"file": "ready.wav"})
    image = validate_ev3_command("display.image", {"image": "smile.png"})

    assert sound.params == {"file": "ready.wav"}
    assert image.params == {"image": "smile.png"}

    with pytest.raises(ValidationError) as exc_info:
        validate_ev3_command("sound.playFile", {"file": "../secret.wav"})

    error = exc_info.value
    assert error.code == ErrorCode.EV3_INVALID_COMMAND
    assert error.data == {
        "method": "sound.playFile",
        "field": "file",
        "retryable": False,
    }


def test_display_number_text_at_and_update_commands_normalize_params():
    number = validate_ev3_command(
        "display.number",
        {"number": "42.5", "line": 12},
    )
    text_at = validate_ev3_command(
        "display.textAt",
        {"text": "Hi", "x": -5, "y": 999},
    )
    update = validate_ev3_command("display.update", {})

    assert number.params == {"number": 42.5, "line": 8}
    assert text_at.params == {"text": "Hi", "x": 0, "y": 127}
    assert update.params == {}


def test_label_longer_than_64_characters_is_rejected():
    with pytest.raises(ValidationError) as exc_info:
        validate_ev3_command("data.startCollect", {"label": "x" * 65})

    error = exc_info.value
    assert error.code == ErrorCode.EV3_INVALID_COMMAND
    assert error.data == {
        "method": "data.startCollect",
        "field": "label",
        "retryable": False,
    }
