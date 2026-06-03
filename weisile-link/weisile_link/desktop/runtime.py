from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Optional, Tuple
from urllib.parse import urlsplit

from weisile_link.desktop.pairing import (
    APP_VERSION,
    DesktopPairingService,
    DesktopReadyCheck,
    create_vsle_bluetooth_transport,
)
from weisile_link.desktop.profiles import (
    CredentialBackend,
    DesktopProfile,
    DesktopProfileError,
    DesktopProfileStore,
    credential_backend_for_platform,
    resolve_profile_environment,
)
from weisile_link.json_rpc_server import DEFAULT_ALLOWED_ORIGINS


class DesktopHealthState(str, Enum):
    READY = "ready"
    STARTING = "starting"
    NEEDS_PAIRING = "needs_pairing"
    NEEDS_ATTENTION = "needs_attention"


@dataclass(frozen=True)
class DesktopStartupPlan:
    state: DesktopHealthState
    message: str
    scratchai_url: str
    host: str
    port: int
    trainer_port: int
    transport: str = ""
    ev3_bt: str = ""
    native_adapter_path: str = ""
    allowed_origins: Tuple[str, ...] = field(default_factory=tuple)
    profile: Dict[str, Any] = field(default_factory=dict)
    checks: Dict[str, Any] = field(default_factory=dict)
    pairing_token: str = field(default="", repr=False, compare=False)

    def safe_payload(self) -> Dict[str, Any]:
        payload = {
            "state": self.state.value,
            "message": self.message,
            "scratchai_url": self.scratchai_url,
            "bridge": {
                "host": self.host,
                "port": self.port,
                "trainer_port": self.trainer_port,
            },
            "transport": self.transport,
            "profile": dict(self.profile),
            "checks": dict(self.checks),
            "native_adapter_configured": bool(self.native_adapter_path),
            "allowed_origins": list(self.allowed_origins),
        }
        _assert_safe_payload(payload)
        return payload


RuntimeConfigFactory = Callable[[argparse.Namespace, DesktopStartupPlan], Any]
RuntimeRunner = Callable[[Any], Awaitable[None]]


class DesktopRuntimeService:
    """Resolve saved Desktop profiles into teacher-facing startup state."""

    def __init__(
        self,
        *,
        credential_backend: CredentialBackend,
        profile_store: DesktopProfileStore,
        transport_factory: Callable[..., Any] = create_vsle_bluetooth_transport,
        app_version: str = APP_VERSION,
    ) -> None:
        self.credential_backend = credential_backend
        self.profile_store = profile_store
        self.transport_factory = transport_factory
        self.app_version = app_version

    def prepare_startup(
        self,
        *,
        brick_id: str = "",
        native_adapter_path: str = "",
        host: str = "127.0.0.1",
        port: int = 20111,
        trainer_port: int = 8766,
        allowed_origins: Tuple[str, ...] = (),
    ) -> DesktopStartupPlan:
        payload = self.profile_store.load()
        scratchai_url = str(
            payload.get("scratchai_url") or self.profile_store.scratchai_url
        )
        try:
            profile = self.profile_store.get_profile(brick_id or None)
        except DesktopProfileError as exc:
            return self._state_plan(
                DesktopHealthState.NEEDS_PAIRING,
                str(exc),
                scratchai_url=scratchai_url,
                host=host,
                port=port,
                trainer_port=trainer_port,
            )

        try:
            env = resolve_profile_environment(
                profile,
                credential_backend=self.credential_backend,
            )
        except DesktopProfileError as exc:
            return self._state_plan(
                DesktopHealthState.NEEDS_PAIRING,
                str(exc),
                scratchai_url=scratchai_url,
                host=host,
                port=port,
                trainer_port=trainer_port,
                profile=profile.to_config(),
            )

        origins = classroom_allowed_origins(scratchai_url, allowed_origins)
        checks = {
            "profile": True,
            "credential": True,
            "local_bridge": "configured",
            "sensor_stream": "pending",
        }
        return DesktopStartupPlan(
            state=DesktopHealthState.STARTING,
            message="Starting WeisileLink from saved EV3 profile.",
            scratchai_url=scratchai_url,
            host=host,
            port=port,
            trainer_port=trainer_port,
            transport=env["WEISILE_TRANSPORT"],
            ev3_bt=env["EV3_BT"],
            native_adapter_path=native_adapter_path,
            allowed_origins=origins,
            profile=profile.to_config(),
            checks=checks,
            pairing_token=env["WEISILE_PAIRING_TOKEN"],
        )

    async def ready_status(
        self,
        *,
        brick_id: str = "",
        native_adapter_path: str = "",
        host: str = "127.0.0.1",
        port: int = 20111,
        trainer_port: int = 8766,
        allowed_origins: Tuple[str, ...] = (),
        timeout_s: float = 5.0,
    ) -> DesktopStartupPlan:
        plan = self.prepare_startup(
            brick_id=brick_id,
            native_adapter_path=native_adapter_path,
            host=host,
            port=port,
            trainer_port=trainer_port,
            allowed_origins=allowed_origins,
        )
        if plan.state != DesktopHealthState.STARTING:
            return plan

        profile = _profile_from_plan(plan)
        check = await DesktopPairingService(
            credential_backend=self.credential_backend,
            profile_store=self.profile_store,
            transport_factory=self.transport_factory,
            app_version=self.app_version,
        ).ready_check(
            profile,
            native_adapter_path=native_adapter_path,
            timeout_s=timeout_s,
        )
        return _plan_with_ready_check(plan, check)

    def _state_plan(
        self,
        state: DesktopHealthState,
        message: str,
        *,
        scratchai_url: str,
        host: str,
        port: int,
        trainer_port: int,
        profile: Optional[Dict[str, Any]] = None,
    ) -> DesktopStartupPlan:
        checks = {
            "profile": bool(profile),
            "credential": False,
            "local_bridge": "not_started",
            "sensor_stream": "not_checked",
        }
        return DesktopStartupPlan(
            state=state,
            message=message,
            scratchai_url=scratchai_url,
            host=host,
            port=port,
            trainer_port=trainer_port,
            profile=profile or {},
            checks=checks,
            allowed_origins=classroom_allowed_origins(scratchai_url, ()),
        )


async def run_desktop_start_command(
    argv: Optional[list[str]] = None,
    *,
    service_factory: Optional[
        Callable[[argparse.Namespace], DesktopRuntimeService]
    ] = None,
    runtime_config_factory: Optional[RuntimeConfigFactory] = None,
    runtime_runner: Optional[RuntimeRunner] = None,
) -> int:
    parser = build_desktop_start_parser()
    args = parser.parse_args(argv)
    service = (
        service_factory(args)
        if service_factory is not None
        else _service_from_args(args)
    )
    origins = tuple(args.allowed_origin or ())
    if args.check_only:
        plan = await service.ready_status(
            brick_id=args.brick_id,
            native_adapter_path=args.native_adapter,
            host=args.host,
            port=args.port,
            trainer_port=args.trainer_port,
            allowed_origins=origins,
            timeout_s=args.ready_timeout,
        )
        print(json.dumps(plan.safe_payload(), indent=2, sort_keys=True))
        return _exit_code_for_state(plan.state)

    plan = service.prepare_startup(
        brick_id=args.brick_id,
        native_adapter_path=args.native_adapter,
        host=args.host,
        port=args.port,
        trainer_port=args.trainer_port,
        allowed_origins=origins,
    )
    print(json.dumps(plan.safe_payload(), indent=2, sort_keys=True), flush=True)
    if plan.state != DesktopHealthState.STARTING:
        return _exit_code_for_state(plan.state)
    if runtime_config_factory is None or runtime_runner is None:
        raise DesktopProfileError("Desktop runtime runner is not configured")
    await runtime_runner(runtime_config_factory(args, plan))
    return 0


def build_desktop_start_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="weisile_link desktop-start",
        description="Start WeisileLink from a saved Desktop EV3 profile.",
    )
    parser.add_argument("--config", default="")
    parser.add_argument("--brick-id", default="")
    parser.add_argument("--native-adapter", default="")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=20111)
    parser.add_argument("--trainer-port", type=int, default=8766)
    parser.add_argument("--allowed-origin", action="append", default=[])
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--ready-timeout", type=float, default=5.0)
    parser.add_argument("--app-version", default=APP_VERSION)
    return parser


def classroom_allowed_origins(
    scratchai_url: str,
    extra_origins: Tuple[str, ...],
) -> Tuple[str, ...]:
    origins = list(DEFAULT_ALLOWED_ORIGINS)
    scratch_origin = _origin_from_url(scratchai_url)
    if scratch_origin:
        origins.append(scratch_origin)
    origins.extend(origin.strip().rstrip("/") for origin in extra_origins)
    return tuple(dict.fromkeys(origin for origin in origins if origin))


def _service_from_args(args: argparse.Namespace) -> DesktopRuntimeService:
    config_path = Path(args.config) if args.config else None
    return DesktopRuntimeService(
        credential_backend=credential_backend_for_platform(),
        profile_store=DesktopProfileStore(config_path),
        app_version=args.app_version,
    )


def _origin_from_url(url: str) -> str:
    parsed = urlsplit(str(url or ""))
    if not parsed.scheme or not parsed.netloc:
        return ""
    return "{}://{}".format(parsed.scheme, parsed.netloc).rstrip("/")


def _profile_from_plan(plan: DesktopStartupPlan) -> DesktopProfile:
    profile = plan.profile
    return DesktopProfile(
        brick_id=str(profile["brick_id"]),
        name=str(profile.get("name") or profile["brick_id"]),
        transport=plan.transport,
        ev3_bt=plan.ev3_bt,
        token_ref=str(profile["token_ref"]),
        last_seen_at=str(profile.get("last_seen_at") or ""),
        server_version=str(profile.get("server_version") or ""),
        capabilities=dict(profile.get("capabilities") or {}),
        expected_sensors=dict(profile.get("expected_sensors") or {}),
    )


def _plan_with_ready_check(
    plan: DesktopStartupPlan,
    check: DesktopReadyCheck,
) -> DesktopStartupPlan:
    checks = dict(plan.checks)
    checks["ev3_authenticated"] = check.connected
    checks["sensor_updates_observed"] = check.sensor_updates_observed
    checks["sensor_stream"] = "fresh" if check.ok else "failed"
    checks["expected_sensors"] = dict(check.expected_sensors)
    checks["observed_sensors"] = dict(check.observed_sensors)
    checks["missing_expected_sensors"] = dict(check.missing_expected_sensors)
    if check.ok:
        return DesktopStartupPlan(
            **{
                **plan.__dict__,
                "state": DesktopHealthState.READY,
                "message": "Ready for ScratchAI.",
                "checks": checks,
            }
        )
    checks["error"] = check.error
    return DesktopStartupPlan(
        **{
            **plan.__dict__,
            "state": DesktopHealthState.NEEDS_ATTENTION,
            "message": check.error or "EV3 ready check failed.",
            "checks": checks,
        }
    )


def _exit_code_for_state(state: DesktopHealthState) -> int:
    if state in {DesktopHealthState.READY, DesktopHealthState.STARTING}:
        return 0
    if state == DesktopHealthState.NEEDS_ATTENTION:
        return 2
    return 3


def _assert_safe_payload(payload: Dict[str, Any]) -> None:
    encoded = json.dumps(payload, sort_keys=True).lower()
    forbidden = ("pairing_token", "weisile_pairing_token")
    if any(key in encoded for key in forbidden):
        raise DesktopProfileError("Desktop output must not include raw tokens")
