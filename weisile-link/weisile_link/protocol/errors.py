"""Shared protocol errors.

Sources:
- Scratch Link network protocol uses JSON-RPC 2.0 envelopes.
- VSLE spec Section 16.1 defines the EV3-facing error code names.
"""

from enum import Enum
from typing import Any, Dict, Optional


class ErrorCode(str, Enum):
    """VSLE bridge error code names from the platform specification."""

    EV3_TRANSPORT_DISCONNECTED = "EV3_TRANSPORT_DISCONNECTED"
    EV3_COMMAND_TIMEOUT = "EV3_COMMAND_TIMEOUT"
    EV3_INVALID_COMMAND = "EV3_INVALID_COMMAND"
    EV3_INVALID_PORT = "EV3_INVALID_PORT"
    EV3_SENSOR_STALE = "EV3_SENSOR_STALE"
    EV3_HARDWARE_ERROR = "EV3_HARDWARE_ERROR"
    TRAINER_UNAVAILABLE = "TRAINER_UNAVAILABLE"
    DATA_BUFFER_FULL = "DATA_BUFFER_FULL"


class ProtocolError(Exception):
    """Base exception carrying a structured VSLE protocol error."""

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        data: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data or {}


class JsonRpcParseError(ProtocolError):
    """Raised when an incoming JSON-RPC request is malformed."""


class ValidationError(ProtocolError):
    """Raised when an EV3 command fails allowlist or parameter validation."""
