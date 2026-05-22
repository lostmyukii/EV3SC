"""Map WeisileLink runtime failures to Scratch-facing JSON-RPC errors.

Sources:
- VSLE spec Section 10.4 requires Scratch-facing JSON-RPC 2.0 errors.
- VSLE spec Section 16.1 defines the error code system and retryability.
"""

from dataclasses import dataclass
from typing import Any, Dict, Optional, Union

from .errors import ErrorCode, ProtocolError
from .json_rpc import JsonRpcId, make_error, make_result

Retryable = Union[bool, str]


@dataclass(frozen=True)
class ErrorCatalogEntry:
    """Spec-defined error metadata used by all JSON-RPC error responses."""

    message: str
    retryable: Retryable


ERROR_CATALOG: Dict[ErrorCode, ErrorCatalogEntry] = {
    ErrorCode.EV3_TRANSPORT_DISCONNECTED: ErrorCatalogEntry(
        "No active BT/WiFi transport",
        True,
    ),
    ErrorCode.EV3_COMMAND_TIMEOUT: ErrorCatalogEntry(
        "Command ack not received before timeout",
        True,
    ),
    ErrorCode.EV3_INVALID_COMMAND: ErrorCatalogEntry(
        "Method not in allowlist",
        False,
    ),
    ErrorCode.EV3_INVALID_PORT: ErrorCatalogEntry(
        "Motor/sensor port is invalid or absent",
        False,
    ),
    ErrorCode.EV3_SENSOR_STALE: ErrorCatalogEntry(
        "Sensor cache older than freshness budget",
        True,
    ),
    ErrorCode.EV3_HARDWARE_ERROR: ErrorCatalogEntry(
        "ev3dev2 raised hardware exception",
        "maybe",
    ),
    ErrorCode.TRAINER_UNAVAILABLE: ErrorCatalogEntry(
        "WeisileAI Trainer subscription/upload unavailable",
        True,
    ),
    ErrorCode.DATA_BUFFER_FULL: ErrorCatalogEntry(
        "Collection buffer reached configured cap",
        False,
    ),
}


def _as_error_code(value: Any) -> ErrorCode:
    try:
        return ErrorCode(str(value))
    except ValueError:
        return ErrorCode.EV3_HARDWARE_ERROR


def _data_with_retryability(
    code: ErrorCode,
    data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    merged = dict(data or {})
    merged.setdefault("retryable", ERROR_CATALOG[code].retryable)
    return merged


def protocol_error_to_json_rpc(
    request_id: JsonRpcId,
    error: ProtocolError,
) -> Dict[str, Any]:
    """Convert a structured protocol error to a JSON-RPC 2.0 error."""
    code = error.code
    message = error.message or ERROR_CATALOG[code].message
    return make_error(
        request_id,
        code,
        message,
        _data_with_retryability(code, error.data),
    )


def exception_to_protocol_error(
    exc: Exception,
    method: Optional[str] = None,
) -> ProtocolError:
    """Classify runtime exceptions into the Section 16 error code system."""
    if isinstance(exc, ProtocolError):
        exc.data = _data_with_retryability(exc.code, exc.data)
        return exc

    data: Dict[str, Any] = {}
    if method is not None:
        data["method"] = method

    if isinstance(exc, TimeoutError):
        code = ErrorCode.EV3_COMMAND_TIMEOUT
    elif isinstance(exc, (ConnectionError, OSError)):
        code = ErrorCode.EV3_TRANSPORT_DISCONNECTED
    elif isinstance(exc, BufferError):
        code = ErrorCode.DATA_BUFFER_FULL
    else:
        code = ErrorCode.EV3_HARDWARE_ERROR
        data["exception_type"] = type(exc).__name__

    data = _data_with_retryability(code, data)
    return ProtocolError(code, ERROR_CATALOG[code].message, data)


def ev3_ack_to_json_rpc(
    request_id: JsonRpcId,
    ack: Dict[str, Any],
) -> Dict[str, Any]:
    """Translate EV3 ack envelopes into Scratch-facing JSON-RPC responses."""
    if ack.get("ok") is True:
        return make_result(request_id, ack)

    code = _as_error_code(ack.get("code", ErrorCode.EV3_HARDWARE_ERROR))
    data = {
        key: value
        for key, value in ack.items()
        if key not in {"type", "ok", "error", "code"}
    }
    if "id" in data:
        data["ack_id"] = data.pop("id")

    return make_error(
        request_id,
        code,
        str(ack.get("error") or ERROR_CATALOG[code].message),
        _data_with_retryability(code, data),
    )
