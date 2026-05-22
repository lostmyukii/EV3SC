import pytest

from weisile_link.protocol.error_mapping import (
    ERROR_CATALOG,
    ev3_ack_to_json_rpc,
    exception_to_protocol_error,
    protocol_error_to_json_rpc,
)
from weisile_link.protocol.errors import ErrorCode, ProtocolError


def test_error_catalog_covers_all_spec_codes_with_retryability():
    assert set(ERROR_CATALOG) == set(ErrorCode)
    assert ERROR_CATALOG[ErrorCode.EV3_TRANSPORT_DISCONNECTED].retryable is True
    assert ERROR_CATALOG[ErrorCode.EV3_COMMAND_TIMEOUT].retryable is True
    assert ERROR_CATALOG[ErrorCode.EV3_INVALID_COMMAND].retryable is False
    assert ERROR_CATALOG[ErrorCode.EV3_INVALID_PORT].retryable is False
    assert ERROR_CATALOG[ErrorCode.EV3_SENSOR_STALE].retryable is True
    assert ERROR_CATALOG[ErrorCode.EV3_HARDWARE_ERROR].retryable == "maybe"
    assert ERROR_CATALOG[ErrorCode.TRAINER_UNAVAILABLE].retryable is True
    assert ERROR_CATALOG[ErrorCode.DATA_BUFFER_FULL].retryable is False


def test_protocol_error_to_json_rpc_includes_retryability_and_context():
    error = ProtocolError(
        ErrorCode.EV3_COMMAND_TIMEOUT,
        "Command ack not received before timeout",
        {"method": "motor.runTimed", "timeout_s": 5},
    )

    response = protocol_error_to_json_rpc("req-1", error)

    assert response == {
        "jsonrpc": "2.0",
        "id": "req-1",
        "error": {
            "code": "EV3_COMMAND_TIMEOUT",
            "message": "Command ack not received before timeout",
            "data": {
                "method": "motor.runTimed",
                "timeout_s": 5,
                "retryable": True,
            },
        },
    }


@pytest.mark.parametrize(
    ("exc", "code"),
    [
        (TimeoutError("late ack"), ErrorCode.EV3_COMMAND_TIMEOUT),
        (
            ConnectionError("socket closed"),
            ErrorCode.EV3_TRANSPORT_DISCONNECTED,
        ),
        (OSError("network unreachable"), ErrorCode.EV3_TRANSPORT_DISCONNECTED),
        (BufferError("full"), ErrorCode.DATA_BUFFER_FULL),
    ],
)
def test_exception_to_protocol_error_maps_runtime_failures(exc, code):
    error = exception_to_protocol_error(exc, method="motor.stopAll")

    assert error.code == code
    assert error.data["method"] == "motor.stopAll"
    assert error.data["retryable"] == ERROR_CATALOG[code].retryable


def test_unknown_exception_maps_to_hardware_error_with_original_type():
    error = exception_to_protocol_error(
        RuntimeError("motor driver fault"),
        method="motor.runForever",
    )

    assert error.code == ErrorCode.EV3_HARDWARE_ERROR
    assert error.data == {
        "method": "motor.runForever",
        "retryable": "maybe",
        "exception_type": "RuntimeError",
    }


def test_ev3_ack_success_maps_to_json_rpc_result():
    response = ev3_ack_to_json_rpc(
        4,
        {"type": "ack", "id": "cmd-4", "ok": True, "battery_pct": 88},
    )

    assert response == {
        "jsonrpc": "2.0",
        "id": 4,
        "result": {"type": "ack", "id": "cmd-4", "ok": True, "battery_pct": 88},
    }


def test_ev3_ack_failure_maps_to_json_rpc_error():
    response = ev3_ack_to_json_rpc(
        5,
        {
            "type": "ack",
            "id": "cmd-5",
            "ok": False,
            "error": "motor port disconnected",
            "code": "EV3_INVALID_PORT",
            "port": "A",
        },
    )

    assert response == {
        "jsonrpc": "2.0",
        "id": 5,
        "error": {
            "code": "EV3_INVALID_PORT",
            "message": "motor port disconnected",
            "data": {
                "ack_id": "cmd-5",
                "port": "A",
                "retryable": False,
            },
        },
    }
