from __future__ import annotations

import argparse
import asyncio
import json
import platform
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from weisile_link.desktop.pairing import (
    APP_VERSION,
    create_vsle_bluetooth_transport,
)
from weisile_link.desktop.profiles import (
    CredentialBackend,
    DesktopProfileError,
    DesktopProfileStore,
    credential_backend_for_platform,
    resolve_profile_environment,
    save_rotated_profile_token,
)
from weisile_link.runtime.degradation import DegradationManager


@dataclass(frozen=True)
class DesktopMaintenanceResult:
    action: str
    ok: bool
    profile: Dict[str, Any]
    message: str = ""
    recovery_required: bool = False
    mutated: bool = False


class DesktopMaintenanceService:
    """Fleet maintenance actions that never expose raw pairing tokens."""

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

    def rename_device(self, *, brick_id: str, name: str) -> DesktopMaintenanceResult:
        payload = self.profile_store.rename_device(brick_id, name)
        try:
            profile = self.profile_store.get_profile(brick_id).to_config()
        except DesktopProfileError:
            profile = _roster_profile(payload, brick_id)
        return DesktopMaintenanceResult(
            action="rename",
            ok=True,
            mutated=True,
            profile=profile,
            message="Device renamed.",
        )

    async def rotate_token(
        self,
        *,
        brick_id: str,
        host_id: str,
        native_adapter_path: str = "",
    ) -> DesktopMaintenanceResult:
        profile = self.profile_store.get_profile(brick_id)
        env = resolve_profile_environment(
            profile,
            credential_backend=self.credential_backend,
        )
        transport = self.transport_factory(
            profile.ev3_bt,
            pairing_token=env["WEISILE_PAIRING_TOKEN"],
            native_adapter_path=native_adapter_path,
            manager=DegradationManager(),
        )
        rotated = await transport.rotate_pairing_token(
            host_id=host_id,
            app_version=self.app_version,
        )
        updated = save_rotated_profile_token(
            profile,
            rotated,
            credential_backend=self.credential_backend,
            profile_store=self.profile_store,
        )
        return DesktopMaintenanceResult(
            action="rotate_token",
            ok=True,
            mutated=True,
            profile=updated.to_config(),
            message="Pairing token rotated and stored securely.",
        )

    def recover_lost_token(
        self,
        *,
        brick_id: str,
        confirm_delete_profile: bool = False,
    ) -> DesktopMaintenanceResult:
        profile = self.profile_store.get_profile(brick_id)
        if not confirm_delete_profile:
            return DesktopMaintenanceResult(
                action="recover_lost_token",
                ok=False,
                recovery_required=True,
                mutated=False,
                profile=profile.to_config(),
                message=(
                    "Lost pairing tokens cannot be recovered from Desktop. "
                    "Re-claim the EV3 with a fresh claim code or use the USB "
                    "support recovery flow."
                ),
            )

        removed = self.profile_store.remove_profile(brick_id)
        try:
            self.credential_backend.delete_pairing_token(removed.token_ref)
        except DesktopProfileError:
            pass
        return DesktopMaintenanceResult(
            action="recover_lost_token",
            ok=True,
            recovery_required=True,
            mutated=True,
            profile={"brick_id": removed.brick_id, "name": removed.name},
            message=(
                "Local profile removed; roster data is preserved. Re-run "
                "desktop-pair after resetting or recovering the EV3 claim code."
            ),
        )


def build_device_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="weisile_link desktop-device",
        description="Maintain non-secret Desktop EV3 device profile metadata.",
    )
    parser.add_argument("--config", default="")
    subparsers = parser.add_subparsers(dest="command", required=True)

    rename = subparsers.add_parser("rename")
    rename.add_argument("--brick-id", required=True)
    rename.add_argument("--name", required=True)
    return parser


def build_token_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="weisile_link desktop-token",
        description="Rotate or recover Desktop EV3 pairing credentials.",
    )
    parser.add_argument("--config", default="")
    subparsers = parser.add_subparsers(dest="command", required=True)

    rotate = subparsers.add_parser("rotate")
    rotate.add_argument("--brick-id", required=True)
    rotate.add_argument(
        "--host-id",
        default=platform.node() or "teacher-computer",
    )
    rotate.add_argument("--native-adapter", default="")
    rotate.add_argument("--app-version", default=APP_VERSION)

    recover = subparsers.add_parser("recover")
    recover.add_argument("--brick-id", required=True)
    recover.add_argument(
        "--confirm-delete-profile",
        action="store_true",
        help="Remove the local profile so the EV3 can be claimed again.",
    )
    return parser


def run_device_command(
    argv: Optional[list[str]] = None,
    *,
    service_factory: Optional[
        Callable[[argparse.Namespace], DesktopMaintenanceService]
    ] = None,
) -> int:
    parser = build_device_parser()
    args = parser.parse_args(argv)
    service = (
        service_factory(args)
        if service_factory is not None
        else _service_from_args(args)
    )
    try:
        if args.command == "rename":
            result = service.rename_device(brick_id=args.brick_id, name=args.name)
        else:
            raise DesktopProfileError("Unsupported device command")
        print(json.dumps(_safe_result(result), indent=2, sort_keys=True))
        return 0
    except (DesktopProfileError, PermissionError, ConnectionError, TimeoutError) as exc:
        print(str(exc), file=sys.stderr)
        return 2


def _roster_profile(payload: Dict[str, Any], brick_id: str) -> Dict[str, Any]:
    for item in payload.get("roster", {}).get("devices", []):
        if item.get("brick_id") == brick_id:
            return {
                "brick_id": item.get("brick_id", ""),
                "name": item.get("label", item.get("brick_id", "")),
                "ev3_bt": item.get("ev3_bt", ""),
                "expected_sensors": dict(item.get("expected_sensors") or {}),
            }
    return {"brick_id": brick_id}


async def run_token_command(
    argv: Optional[list[str]] = None,
    *,
    service_factory: Optional[
        Callable[[argparse.Namespace], DesktopMaintenanceService]
    ] = None,
) -> int:
    parser = build_token_parser()
    args = parser.parse_args(argv)
    service = (
        service_factory(args)
        if service_factory is not None
        else _service_from_args(args)
    )
    try:
        if args.command == "rotate":
            result = await service.rotate_token(
                brick_id=args.brick_id,
                host_id=args.host_id,
                native_adapter_path=args.native_adapter,
            )
        elif args.command == "recover":
            result = service.recover_lost_token(
                brick_id=args.brick_id,
                confirm_delete_profile=args.confirm_delete_profile,
            )
        else:
            raise DesktopProfileError("Unsupported token command")
        print(json.dumps(_safe_result(result), indent=2, sort_keys=True))
        return 0 if result.ok else 2
    except (DesktopProfileError, PermissionError, ConnectionError, TimeoutError) as exc:
        print(str(exc), file=sys.stderr)
        return 2


def _service_from_args(args: argparse.Namespace) -> DesktopMaintenanceService:
    config_path = Path(args.config) if args.config else None
    app_version = getattr(args, "app_version", APP_VERSION)
    return DesktopMaintenanceService(
        credential_backend=credential_backend_for_platform(),
        profile_store=DesktopProfileStore(config_path),
        app_version=app_version,
    )


def _safe_result(result: DesktopMaintenanceResult) -> Dict[str, Any]:
    payload = {
        **asdict(result),
        "profile": dict(result.profile),
    }
    encoded = json.dumps(payload).lower()
    if "pairing_token" in encoded or "weisile_pairing_token" in encoded:
        raise DesktopProfileError("Maintenance output must not include raw tokens")
    return payload
