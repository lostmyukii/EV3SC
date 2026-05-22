import pytest

from weisile_link.protocol.errors import ErrorCode, JsonRpcParseError
from weisile_link.protocol.json_rpc import (
    make_error,
    make_result,
    parse_json_rpc_request,
)


def test_make_result_uses_json_rpc_20_envelope():
    response = make_result(7, {"protocol": "1.2"})

    assert response == {
        "jsonrpc": "2.0",
        "id": 7,
        "result": {"protocol": "1.2"},
    }


def test_make_error_uses_json_rpc_20_error_envelope():
    response = make_error(
        9,
        ErrorCode.EV3_INVALID_PORT,
        "EV3 motor port is not connected",
        {"method": "motor.runTimed", "port": "Z", "retryable": False},
    )

    assert response == {
        "jsonrpc": "2.0",
        "id": 9,
        "error": {
            "code": "EV3_INVALID_PORT",
            "message": "EV3 motor port is not connected",
            "data": {
                "method": "motor.runTimed",
                "port": "Z",
                "retryable": False,
            },
        },
    }


def test_parse_json_rpc_request_accepts_request_object():
    request = parse_json_rpc_request(
        '{"jsonrpc":"2.0","id":"abc","method":"motor.stop","params":{"port":"A"}}'
    )

    assert request == {
        "jsonrpc": "2.0",
        "id": "abc",
        "method": "motor.stop",
        "params": {"port": "A"},
    }


def test_parse_json_rpc_request_rejects_invalid_json_with_structured_error():
    with pytest.raises(JsonRpcParseError) as exc_info:
        parse_json_rpc_request("{not valid json")

    error = exc_info.value
    assert error.code == ErrorCode.EV3_INVALID_COMMAND
    assert error.data == {"retryable": False}


def test_parse_json_rpc_request_rejects_missing_method():
    with pytest.raises(JsonRpcParseError) as exc_info:
        parse_json_rpc_request('{"jsonrpc":"2.0","id":1,"params":{}}')

    error = exc_info.value
    assert error.code == ErrorCode.EV3_INVALID_COMMAND
    assert error.data == {"retryable": False}
