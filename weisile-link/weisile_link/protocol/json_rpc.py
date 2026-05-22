"""JSON-RPC 2.0 helpers for Scratch Link compatible endpoints.

Sources:
- `/Users/yukii/Desktop/scratch ai/scratch-link/Documentation/NetworkProtocol.md`
- JSON-RPC 2.0 envelope shape referenced by VSLE spec Section 10.4
"""

import json
from typing import Any, Dict, Optional, Union

from .errors import ErrorCode, JsonRpcParseError

JsonRpcId = Union[str, int, None]


def _error_code_value(code: Union[ErrorCode, str]) -> str:
    return code.value if isinstance(code, ErrorCode) else str(code)


def make_result(request_id: JsonRpcId, result: Any) -> Dict[str, Any]:
    """Create a JSON-RPC 2.0 success response."""
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "result": result,
    }


def make_error(
    request_id: JsonRpcId,
    code: Union[ErrorCode, str],
    message: str,
    data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create a JSON-RPC 2.0 error response."""
    error: Dict[str, Any] = {
        "code": _error_code_value(code),
        "message": message,
    }
    if data is not None:
        error["data"] = data
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": error,
    }


def parse_json_rpc_request(raw: str) -> Dict[str, Any]:
    """Parse and minimally validate a JSON-RPC request object."""
    try:
        request = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise JsonRpcParseError(
            ErrorCode.EV3_INVALID_COMMAND,
            "Invalid JSON-RPC request JSON",
            {"retryable": False},
        ) from exc

    if not isinstance(request, dict):
        raise JsonRpcParseError(
            ErrorCode.EV3_INVALID_COMMAND,
            "JSON-RPC request must be an object",
            {"retryable": False},
        )

    if request.get("jsonrpc") != "2.0" or not isinstance(
        request.get("method"), str
    ):
        raise JsonRpcParseError(
            ErrorCode.EV3_INVALID_COMMAND,
            "JSON-RPC request must include jsonrpc='2.0' and method",
            {"retryable": False},
        )

    params = request.get("params", {})
    if not isinstance(params, dict):
        raise JsonRpcParseError(
            ErrorCode.EV3_INVALID_COMMAND,
            "JSON-RPC params must be an object",
            {"retryable": False},
        )

    return request
