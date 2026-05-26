from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, Iterable


SECRET_NAMES = (
    "WEISILE_PAIRING_TOKEN",
    "DEEPSEEK_API_KEY",
    "SILICONFLOW_API_KEY",
    "OPENAI_API_KEY",
)
SECRET_KEY_FRAGMENTS = ("TOKEN", "API_KEY", "SECRET", "PASSWORD")
BLUETOOTH_ADDRESS_RE = re.compile(r"\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b")
LONG_LABEL_RE = re.compile(r"(label=).{65,}")


def _is_secret_key(key: str) -> bool:
    normalized = key.upper()
    return any(fragment in normalized for fragment in SECRET_KEY_FRAGMENTS)


def _is_device_identifier_key(key: str) -> bool:
    normalized = key.upper()
    return "BT" in normalized or "BLUETOOTH" in normalized


def redact_secret_text(
    text: str,
    *,
    include_device_identifiers: bool = False,
) -> str:
    """Redact diagnostics text for teacher-safe support bundles."""
    redacted = text
    for name in SECRET_NAMES:
        redacted = re.sub(
            rf"({name}=)[^\s]+",
            rf"\1<redacted>",
            redacted,
        )
    redacted = LONG_LABEL_RE.sub(r"\1<truncated>", redacted)
    if not include_device_identifiers:
        redacted = BLUETOOTH_ADDRESS_RE.sub(
            "<redacted-bluetooth-address>",
            redacted,
        )
    return redacted


def _safe_config_value(
    key: str,
    value: Any,
    *,
    include_device_identifiers: bool,
) -> Any:
    if _is_secret_key(key):
        return "<redacted>"
    if (
        not include_device_identifiers
        and _is_device_identifier_key(key)
        and isinstance(value, str)
    ):
        return "<redacted>"
    if isinstance(value, str):
        return redact_secret_text(
            value,
            include_device_identifiers=include_device_identifiers,
        )
    return value


def build_diagnostics_bundle(
    *,
    version: str,
    health: Dict[str, Any],
    config: Dict[str, Any],
    recent_logs: Iterable[str],
    include_student_data: bool = False,
    student_data: Any = None,
    include_device_identifiers: bool = False,
) -> Dict[str, Any]:
    """Build a diagnostics payload with secrets redacted by default."""
    safe_config = {
        key: _safe_config_value(
            key,
            value,
            include_device_identifiers=include_device_identifiers,
        )
        for key, value in config.items()
    }
    bundle: Dict[str, Any] = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "version": version,
        "health": health,
        "config": safe_config,
        "recent_logs": [
            redact_secret_text(
                line,
                include_device_identifiers=include_device_identifiers,
            )
            for line in recent_logs
        ],
    }
    if include_student_data:
        bundle["student_data"] = student_data
    return bundle
