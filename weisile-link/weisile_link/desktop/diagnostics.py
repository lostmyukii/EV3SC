from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from weisile_link.desktop.pairing import APP_VERSION
from weisile_link.desktop.profiles import (
    DesktopProfileError,
    DesktopProfileStore,
    credential_backend_for_platform,
    resolve_profile_environment,
)
from weisile_link.desktop.runtime import (
    DesktopHealthState,
    DesktopRuntimeService,
)
from weisile_link.desktop.supervisor import PortChecker, tcp_port_open


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


def sanitize_diagnostics_value(
    value: Any,
    *,
    include_device_identifiers: bool = False,
) -> Any:
    """Recursively redact secrets and device IDs from diagnostics payloads."""
    if isinstance(value, dict):
        return {
            key: _safe_config_value(
                str(key),
                sanitize_diagnostics_value(
                    item,
                    include_device_identifiers=include_device_identifiers,
                ),
                include_device_identifiers=include_device_identifiers,
            )
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [
            sanitize_diagnostics_value(
                item,
                include_device_identifiers=include_device_identifiers,
            )
            for item in value
        ]
    if isinstance(value, tuple):
        return [
            sanitize_diagnostics_value(
                item,
                include_device_identifiers=include_device_identifiers,
            )
            for item in value
        ]
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
    safe_config = sanitize_diagnostics_value(
        config,
        include_device_identifiers=include_device_identifiers,
    )
    safe_health = sanitize_diagnostics_value(
        health,
        include_device_identifiers=include_device_identifiers,
    )
    bundle: Dict[str, Any] = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "version": version,
        "health": safe_health,
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


@dataclass(frozen=True)
class DesktopDiagnosticCheck:
    name: str
    ok: bool
    status: str
    detail: str = ""
    data: Dict[str, Any] = field(default_factory=dict)

    def safe_payload(
        self,
        *,
        include_device_identifiers: bool = False,
    ) -> Dict[str, Any]:
        return sanitize_diagnostics_value(
            asdict(self),
            include_device_identifiers=include_device_identifiers,
        )


@dataclass(frozen=True)
class DesktopDiagnosticsResult:
    state: DesktopHealthState
    summary: str
    checks: List[DesktopDiagnosticCheck]
    bundle: Dict[str, Any]

    def safe_payload(
        self,
        *,
        include_device_identifiers: bool = False,
    ) -> Dict[str, Any]:
        payload = {
            "state": self.state.value,
            "summary": self.summary,
            "checks": [
                check.safe_payload(
                    include_device_identifiers=include_device_identifiers,
                )
                for check in self.checks
            ],
            "bundle": self.bundle,
        }
        safe = sanitize_diagnostics_value(
            payload,
            include_device_identifiers=include_device_identifiers,
        )
        _assert_no_forbidden_diagnostics(safe)
        return safe


class DesktopDiagnosticsService:
    """Teacher-safe diagnostics for installed WeisileLink Desktop assets."""

    def __init__(
        self,
        *,
        runtime_service: DesktopRuntimeService,
        profile_store: DesktopProfileStore,
        port_checker: Optional[PortChecker] = None,
        app_version: str = APP_VERSION,
    ) -> None:
        self.runtime_service = runtime_service
        self.profile_store = profile_store
        self.port_checker = port_checker or tcp_port_open
        self.app_version = app_version

    async def collect(
        self,
        *,
        brick_id: str = "",
        native_adapter_path: str = "",
        host: str = "127.0.0.1",
        port: int = 20111,
        trainer_port: int = 8766,
        ready_timeout_s: float = 5.0,
        include_device_identifiers: bool = False,
        recent_logs: Iterable[str] = (),
    ) -> DesktopDiagnosticsResult:
        checks: List[DesktopDiagnosticCheck] = []
        payload = self.profile_store.load()
        scratchai_url = str(
            payload.get("scratchai_url") or self.profile_store.scratchai_url
        )
        profile = None
        try:
            profile = self.profile_store.get_profile(brick_id or None)
            checks.append(
                DesktopDiagnosticCheck(
                    name="profile",
                    ok=True,
                    status="found",
                    detail="Desktop profile found.",
                    data=profile.to_config(),
                )
            )
        except DesktopProfileError as exc:
            checks.append(
                DesktopDiagnosticCheck(
                    name="profile",
                    ok=False,
                    status="missing",
                    detail=str(exc),
                )
            )

        credential_ok = False
        if profile is not None:
            try:
                env = resolve_profile_environment(
                    profile,
                    credential_backend=self.runtime_service.credential_backend,
                )
                credential_ok = bool(env.get("WEISILE_PAIRING_TOKEN"))
                checks.append(
                    DesktopDiagnosticCheck(
                        name="credential",
                        ok=credential_ok,
                        status="available" if credential_ok else "missing",
                        detail="Secure credential is available.",
                        data={
                            "transport": env.get("WEISILE_TRANSPORT", ""),
                            "ev3_bt": env.get("EV3_BT", ""),
                        },
                    )
                )
            except DesktopProfileError as exc:
                checks.append(
                    DesktopDiagnosticCheck(
                        name="credential",
                        ok=False,
                        status="missing",
                        detail=str(exc),
                    )
                )

        checks.append(_native_adapter_check(native_adapter_path))
        checks.extend(
            [
                _port_check(
                    "scratch_link_port",
                    host,
                    port,
                    self.port_checker,
                ),
                _port_check(
                    "trainer_port",
                    host,
                    trainer_port,
                    self.port_checker,
                ),
            ]
        )

        if profile is not None and credential_ok:
            ready = await self.runtime_service.ready_status(
                brick_id=brick_id,
                native_adapter_path=native_adapter_path,
                host=host,
                port=port,
                trainer_port=trainer_port,
                timeout_s=ready_timeout_s,
            )
            ready_payload = ready.safe_payload()
            checks.append(
                DesktopDiagnosticCheck(
                    name="ev3_ready_check",
                    ok=ready.state == DesktopHealthState.READY,
                    status=ready.state.value,
                    detail=ready.message,
                    data=ready_payload.get("checks", {}),
                )
            )
        else:
            checks.append(
                DesktopDiagnosticCheck(
                    name="ev3_ready_check",
                    ok=False,
                    status="not_checked",
                    detail="Profile and credential are required first.",
                )
            )

        state = _state_from_checks(checks)
        summary = _summary_for_state(state)
        health = {
            "state": state.value,
            "summary": summary,
            "checks": [
                check.safe_payload(
                    include_device_identifiers=include_device_identifiers,
                )
                for check in checks
            ],
        }
        config = {
            "scratchai_url": scratchai_url,
            "host": host,
            "port": port,
            "trainer_port": trainer_port,
            "native_adapter_path": native_adapter_path,
            "profile": profile.to_config() if profile is not None else {},
        }
        bundle = build_diagnostics_bundle(
            version=self.app_version,
            health=health,
            config=config,
            recent_logs=recent_logs,
            include_device_identifiers=include_device_identifiers,
        )
        return DesktopDiagnosticsResult(
            state=state,
            summary=summary,
            checks=checks,
            bundle=bundle,
        )


async def run_diagnostics_command(
    argv: Optional[List[str]] = None,
    *,
    service_factory: Optional[
        Callable[[argparse.Namespace], DesktopDiagnosticsService]
    ] = None,
) -> int:
    parser = build_diagnostics_parser()
    args = parser.parse_args(argv)
    service = (
        service_factory(args)
        if service_factory is not None
        else _service_from_args(args)
    )
    result = await service.collect(
        brick_id=args.brick_id,
        native_adapter_path=args.native_adapter,
        host=args.host,
        port=args.port,
        trainer_port=args.trainer_port,
        ready_timeout_s=args.ready_timeout,
        include_device_identifiers=args.include_device_identifiers,
        recent_logs=_read_recent_logs(args.log_file),
    )
    payload = result.safe_payload(
        include_device_identifiers=args.include_device_identifiers
    )
    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(
            json.dumps(payload, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    print(json.dumps(payload, indent=2, sort_keys=True))
    return _exit_code_for_state(result.state)


def build_diagnostics_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="weisile_link desktop-diagnostics",
        description="Run teacher-safe WeisileLink Desktop diagnostics.",
    )
    parser.add_argument("--config", default="")
    parser.add_argument("--brick-id", default="")
    parser.add_argument("--native-adapter", default="")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=20111)
    parser.add_argument("--trainer-port", type=int, default=8766)
    parser.add_argument("--ready-timeout", type=float, default=5.0)
    parser.add_argument("--output", default="")
    parser.add_argument("--log-file", action="append", default=[])
    parser.add_argument(
        "--include-device-identifiers",
        action="store_true",
        help="Include Bluetooth addresses and other device identifiers.",
    )
    parser.add_argument("--app-version", default=APP_VERSION)
    return parser


def _service_from_args(args: argparse.Namespace) -> DesktopDiagnosticsService:
    config_path = Path(args.config) if args.config else None
    profile_store = DesktopProfileStore(config_path)
    runtime_service = DesktopRuntimeService(
        credential_backend=credential_backend_for_platform(),
        profile_store=profile_store,
        app_version=args.app_version,
    )
    return DesktopDiagnosticsService(
        runtime_service=runtime_service,
        profile_store=profile_store,
        app_version=args.app_version,
    )


def _native_adapter_check(path: str) -> DesktopDiagnosticCheck:
    if not path:
        return DesktopDiagnosticCheck(
            name="native_adapter",
            ok=False,
            status="not_configured",
            detail="Native Bluetooth adapter path was not provided.",
        )
    adapter = Path(path)
    exists = adapter.is_file()
    executable = exists and os.access(adapter, os.X_OK)
    return DesktopDiagnosticCheck(
        name="native_adapter",
        ok=executable,
        status="available" if executable else "missing",
        detail=path,
        data={"exists": exists, "executable": executable},
    )


def _port_check(
    name: str,
    host: str,
    port: int,
    checker: PortChecker,
) -> DesktopDiagnosticCheck:
    open_ = bool(checker(host, port))
    return DesktopDiagnosticCheck(
        name=name,
        ok=open_,
        status="listening" if open_ else "closed",
        detail="{}:{}".format(host, port),
        data={"host": host, "port": port},
    )


def _state_from_checks(
    checks: List[DesktopDiagnosticCheck],
) -> DesktopHealthState:
    by_name = {check.name: check for check in checks}
    if not by_name.get("profile", DesktopDiagnosticCheck("", False, "")).ok:
        return DesktopHealthState.NEEDS_PAIRING
    if not by_name.get("credential", DesktopDiagnosticCheck("", False, "")).ok:
        return DesktopHealthState.NEEDS_PAIRING
    if all(check.ok for check in checks):
        return DesktopHealthState.READY
    return DesktopHealthState.NEEDS_ATTENTION


def _summary_for_state(state: DesktopHealthState) -> str:
    if state == DesktopHealthState.READY:
        return "Ready for ScratchAI."
    if state == DesktopHealthState.NEEDS_PAIRING:
        return "Pair this EV3 before starting a lesson."
    if state == DesktopHealthState.STARTING:
        return "WeisileLink is starting."
    return "Open guided diagnostics."


def _exit_code_for_state(state: DesktopHealthState) -> int:
    if state == DesktopHealthState.READY:
        return 0
    if state == DesktopHealthState.NEEDS_ATTENTION:
        return 2
    if state == DesktopHealthState.NEEDS_PAIRING:
        return 3
    return 1


def _read_recent_logs(
    paths: Iterable[str], *, max_chars: int = 20_000
) -> List[str]:
    lines: List[str] = []
    remaining = max_chars
    for item in paths:
        if remaining <= 0:
            break
        path = Path(item)
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if len(text) > remaining:
            text = text[-remaining:]
        lines.extend(text.splitlines())
        remaining -= len(text)
    return lines


def _assert_no_forbidden_diagnostics(payload: Dict[str, Any]) -> None:
    encoded = json.dumps(payload, sort_keys=True).lower()
    forbidden = ('"pairing_token":', '"weisile_pairing_token":')
    if any(key in encoded for key in forbidden):
        raise DesktopProfileError("Diagnostics must not include raw tokens")
