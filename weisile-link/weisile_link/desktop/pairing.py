from __future__ import annotations

import argparse
import asyncio
import json
import platform
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Optional

from weisile_link.desktop.profiles import (
    CredentialBackend,
    DesktopProfile,
    DesktopProfileError,
    DesktopProfileStore,
    credential_backend_for_platform,
    resolve_profile_environment,
    save_claimed_profile,
)
from weisile_link.runtime.degradation import DegradationManager
from weisile_link.transport.bluetooth_transport import VSLEBluetoothTransport
from weisile_link.transport.native_adapter_process import NativeAdapterProcess


APP_VERSION = "0.1.0"
SensorCallback = Callable[[Dict[str, Any]], Optional[Awaitable[None]]]


@dataclass(frozen=True)
class DesktopReadyCheck:
    ok: bool
    connected: bool
    sensor_updates_observed: int
    error: str = ""
    expected_sensors: Dict[str, str] = field(default_factory=dict)
    observed_sensors: Dict[str, str] = field(default_factory=dict)
    missing_expected_sensors: Dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class DesktopPairingResult:
    paired: bool
    ready: bool
    profile: Dict[str, Any]
    ready_check: Dict[str, Any]


def create_vsle_bluetooth_transport(
    ev3_bt: str,
    *,
    pairing_token: str = "",
    native_adapter_path: str = "",
    manager: Optional[DegradationManager] = None,
) -> VSLEBluetoothTransport:
    """Build the full VSLE Bluetooth transport used by Desktop pairing."""
    native_adapter = (
        NativeAdapterProcess(native_adapter_path)
        if native_adapter_path
        else None
    )
    return VSLEBluetoothTransport(
        ev3_bt,
        pairing_token=pairing_token,
        native_adapter=native_adapter,
        manager=manager or DegradationManager(),
    )


class DesktopPairingService:
    """First-run Desktop pairing flow for one EV3 brick."""

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

    async def pair_ev3(
        self,
        *,
        ev3_bt: str,
        claim_code: str,
        host_id: str,
        host_public_key: str = "",
        native_adapter_path: str = "",
        ready_timeout_s: float = 5.0,
    ) -> DesktopPairingResult:
        """Claim, store, and ready-check one first-boot EV3."""
        claim_transport = self.transport_factory(
            ev3_bt,
            pairing_token="",
            native_adapter_path=native_adapter_path,
            manager=DegradationManager(),
        )
        claim_result = await claim_transport.claim(
            claim_code=claim_code,
            host_id=host_id,
            host_public_key=host_public_key,
            app_version=self.app_version,
        )
        claim_payload = dict(claim_result)
        claim_payload.setdefault("ev3_bt", ev3_bt)
        profile = save_claimed_profile(
            claim_payload,
            credential_backend=self.credential_backend,
            profile_store=self.profile_store,
        )
        ready_check = await self.ready_check(
            profile,
            native_adapter_path=native_adapter_path,
            timeout_s=ready_timeout_s,
        )
        return DesktopPairingResult(
            paired=True,
            ready=ready_check.ok,
            profile=profile.to_config(),
            ready_check=asdict(ready_check),
        )

    async def ready_check(
        self,
        profile: DesktopProfile,
        *,
        native_adapter_path: str = "",
        timeout_s: float = 5.0,
    ) -> DesktopReadyCheck:
        """Reconnect from the saved profile and wait for a sensor frame."""
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
        observed = 0
        observed_sensors: Dict[str, str] = {}
        expected_sensors = dict(profile.expected_sensors)
        missing_expected_sensors = dict(expected_sensors)
        received = asyncio.Event()

        async def on_sensor_data(payload: Dict[str, Any]) -> None:
            nonlocal observed, observed_sensors, missing_expected_sensors
            if payload.get("type") == "sensor_update":
                observed += 1
                observed_sensors.update(_observed_sensor_types(payload))
                missing_expected_sensors = _missing_expected_sensors(
                    expected_sensors,
                    observed_sensors,
                )
                if not expected_sensors or not missing_expected_sensors:
                    received.set()

        try:
            connected = await transport.connect(on_sensor_data)
            if not connected:
                return DesktopReadyCheck(
                    ok=False,
                    connected=False,
                    sensor_updates_observed=observed,
                    error="EV3 Bluetooth connection failed",
                    expected_sensors=expected_sensors,
                    observed_sensors=observed_sensors,
                    missing_expected_sensors=missing_expected_sensors,
                )
            try:
                await asyncio.wait_for(received.wait(), timeout=timeout_s)
            except asyncio.TimeoutError:
                return DesktopReadyCheck(
                    ok=False,
                    connected=True,
                    sensor_updates_observed=observed,
                    error=_ready_timeout_error(
                        expected_sensors,
                        missing_expected_sensors,
                    ),
                    expected_sensors=expected_sensors,
                    observed_sensors=observed_sensors,
                    missing_expected_sensors=missing_expected_sensors,
                )
            return DesktopReadyCheck(
                ok=True,
                connected=True,
                sensor_updates_observed=observed,
                expected_sensors=expected_sensors,
                observed_sensors=observed_sensors,
                missing_expected_sensors={},
            )
        except Exception as exc:
            return DesktopReadyCheck(
                ok=False,
                connected=False,
                sensor_updates_observed=observed,
                error=str(exc) or type(exc).__name__,
                expected_sensors=expected_sensors,
                observed_sensors=observed_sensors,
                missing_expected_sensors=missing_expected_sensors,
            )
        finally:
            disconnect = getattr(transport, "disconnect", None)
            if disconnect is not None:
                await disconnect()


async def run_pairing_command(
    argv: Optional[list[str]] = None,
    *,
    service_factory: Optional[
        Callable[[argparse.Namespace], DesktopPairingService]
    ] = None,
) -> int:
    """Run the minimal first-run pairing CLI used by packaged Desktop builds."""
    parser = build_pairing_parser()
    args = parser.parse_args(argv)
    service = (
        service_factory(args)
        if service_factory is not None
        else _service_from_args(args)
    )
    result = await service.pair_ev3(
        ev3_bt=args.ev3_bt,
        claim_code=args.claim_code,
        host_id=args.host_id,
        host_public_key=args.host_public_key,
        native_adapter_path=args.native_adapter,
        ready_timeout_s=args.ready_timeout,
    )
    print(json.dumps(_safe_result(result), indent=2, sort_keys=True))
    return 0 if result.ready else 2


def build_pairing_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="weisile_link desktop-pair",
        description="Pair a first-boot VSLE EV3 without USB.",
    )
    parser.add_argument("--ev3-bt", required=True, help="EV3 Bluetooth address")
    parser.add_argument(
        "--claim-code", required=True, help="EV3 LCD claim code"
    )
    parser.add_argument(
        "--host-id",
        default=platform.node() or "teacher-computer",
        help="Teacher computer identifier recorded on the EV3",
    )
    parser.add_argument("--host-public-key", default="")
    parser.add_argument("--native-adapter", default="")
    parser.add_argument("--config", default="")
    parser.add_argument("--ready-timeout", type=float, default=5.0)
    parser.add_argument("--app-version", default=APP_VERSION)
    return parser


def _service_from_args(args: argparse.Namespace) -> DesktopPairingService:
    config_path = Path(args.config) if args.config else None
    return DesktopPairingService(
        credential_backend=credential_backend_for_platform(),
        profile_store=DesktopProfileStore(config_path),
        app_version=args.app_version,
    )


def _safe_result(result: DesktopPairingResult) -> Dict[str, Any]:
    payload = {
        "paired": result.paired,
        "ready": result.ready,
        "profile": dict(result.profile),
        "ready_check": dict(result.ready_check),
    }
    encoded = json.dumps(payload).lower()
    if "pairing_token" in encoded or "weisile_pairing_token" in encoded:
        raise DesktopProfileError("Pairing output must not include raw tokens")
    return payload


def _observed_sensor_types(payload: Dict[str, Any]) -> Dict[str, str]:
    sensors = payload.get("sensors")
    if not isinstance(sensors, dict):
        return {}
    observed: Dict[str, str] = {}
    for raw_port, raw_value in sensors.items():
        port = str(raw_port or "").upper()
        if port not in {"S1", "S2", "S3", "S4"}:
            continue
        if isinstance(raw_value, dict):
            sensor_type = _sensor_type_from_payload(raw_value)
            if sensor_type:
                observed[port] = sensor_type
    return observed


def _sensor_type_from_payload(payload: Dict[str, Any]) -> str:
    explicit = str(payload.get("type") or "").strip().lower()
    if explicit:
        return explicit
    keys = set(payload)
    if keys & {"color", "reflected", "ambient", "rgb"}:
        return "color"
    if keys & {"distance_cm", "distance_inch", "distance"}:
        return "ultrasonic"
    if keys & {"angle", "rate"}:
        return "gyro"
    if "pressed" in keys:
        return "touch"
    if keys & {"proximity", "remote", "beacon"}:
        return "infrared"
    return ""


def _missing_expected_sensors(
    expected: Dict[str, str],
    observed: Dict[str, str],
) -> Dict[str, str]:
    missing: Dict[str, str] = {}
    for port, expected_type in expected.items():
        observed_type = observed.get(port, "")
        if observed_type != expected_type:
            missing[port] = expected_type
    return missing


def _ready_timeout_error(
    expected: Dict[str, str],
    missing: Dict[str, str],
) -> str:
    if not expected:
        return "No sensor update received before timeout"
    if not missing:
        return "No sensor update received before timeout"
    summary = ", ".join(
        "{} {}".format(port, sensor_type)
        for port, sensor_type in sorted(missing.items())
    )
    return "Expected sensors not observed before timeout: {}".format(summary)
