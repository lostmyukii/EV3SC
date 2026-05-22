"""Token-safe structured JSON logging for WeisileLink.

Sources:
- VSLE spec Section 17.1 requires structured JSON lines.
- VSLE spec Section 17.1 forbids pairing tokens and labels longer than
  64 characters in logs.
"""

import json
from datetime import datetime, timezone
from typing import Any, Callable, Dict

MAX_LOG_LABEL_LENGTH = 64
REDACTED = "[REDACTED]"
TOKEN_KEY_FRAGMENTS = ("token", "secret", "password")

Writer = Callable[[str], None]
Clock = Callable[[], str]


def utc_timestamp() -> str:
    """Return an ISO-8601 UTC timestamp with millisecond precision."""
    now = datetime.now(timezone.utc)
    return now.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _is_token_key(key: str) -> bool:
    normalized = key.lower()
    return any(fragment in normalized for fragment in TOKEN_KEY_FRAGMENTS)


def _sanitize_value(key: str, value: Any) -> Any:
    if _is_token_key(key):
        return REDACTED

    if isinstance(value, dict):
        return sanitize_log_data(value)

    if isinstance(value, list):
        return [
            sanitize_log_data(item) if isinstance(item, dict) else item
            for item in value
        ]

    if key == "label" and isinstance(value, str):
        return value[:MAX_LOG_LABEL_LENGTH]

    return value


def sanitize_log_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Redact secrets and truncate student-entered labels for logging."""
    return {key: _sanitize_value(key, value) for key, value in data.items()}


class StructuredLogger:
    """Write structured JSON lines with stable service metadata."""

    def __init__(
        self,
        service: str,
        writer: Writer = print,
        clock: Clock = utc_timestamp,
    ) -> None:
        self._service = service
        self._writer = writer
        self._clock = clock

    def log(self, level: str, event: str, **fields: Any) -> None:
        """Write one token-safe structured JSON log line."""
        record = {
            "ts": self._clock(),
            "level": level.upper(),
            "service": self._service,
            "event": event,
            **sanitize_log_data(fields),
        }
        self._writer(
            json.dumps(record, ensure_ascii=False, separators=(",", ":"))
        )

    def info(self, event: str, **fields: Any) -> None:
        """Write an INFO log event."""
        self.log("INFO", event, **fields)

    def warning(self, event: str, **fields: Any) -> None:
        """Write a WARNING log event."""
        self.log("WARNING", event, **fields)

    def error(self, event: str, **fields: Any) -> None:
        """Write an ERROR log event."""
        self.log("ERROR", event, **fields)
