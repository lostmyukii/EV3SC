#!/usr/bin/env python3
"""Run a token-safe simulated Desktop fleet rehearsal evidence gate."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


ROOT = Path(__file__).resolve().parents[1]
WEISILE_LINK_ROOT = ROOT / "weisile-link"
if str(WEISILE_LINK_ROOT) not in sys.path:
    sys.path.insert(0, str(WEISILE_LINK_ROOT))

from weisile_link.desktop.maintenance import DesktopMaintenanceService  # noqa: E402
from weisile_link.desktop.profiles import (  # noqa: E402
    DesktopProfileStore,
    MemoryCredentialBackend,
    save_claimed_profile,
)
from weisile_link.desktop.runtime import DesktopRuntimeService  # noqa: E402
from weisile_link.desktop.supervisor import DesktopSupervisorService  # noqa: E402


DEFAULT_DEVICE_COUNT = 10
DEFAULT_SCRATCHAI_URL = "http://101.42.92.6:18612/"
EXPECTED_SENSORS = {
    "S1": "color",
    "S2": "ultrasonic",
    "S3": "gyro",
    "S4": "touch",
}
FORBIDDEN_EVIDENCE_MARKERS = (
    "pairing_token",
    "weisile_pairing_token",
    "token_ref",
    "secret-token",
)


class FleetRehearsalError(RuntimeError):
    """Raised when simulated fleet evidence cannot be trusted."""


class SimulatedFleetTransport:
    """Small EV3 transport used only by the Desktop fleet rehearsal gate."""

    def __init__(self, state: Dict[str, Any], ev3_bt: str, pairing_token: str):
        self.state = state
        self.ev3_bt = ev3_bt
        self.pairing_token = pairing_token

    async def connect(self, on_sensor_data):
        self.state.setdefault("connects", []).append(
            {
                "ev3_bt": self.ev3_bt,
                "token_supplied": bool(self.pairing_token),
            }
        )
        await on_sensor_data(
            {
                "type": "sensor_update",
                "sensors": {
                    "S1": {"type": "color", "reflected": 42},
                    "S2": {"type": "ultrasonic", "distance_cm": 25.0},
                    "S3": {"type": "gyro", "angle": 0},
                    "S4": {"type": "touch", "pressed": 0},
                },
                "motors": {},
                "system": {"battery_v": 7.5},
            }
        )
        return True

    async def disconnect(self):
        self.state["disconnects"] = self.state.get("disconnects", 0) + 1


def simulated_transport_factory(state: Dict[str, Any]):
    def build(
        ev3_bt: str,
        *,
        pairing_token: str = "",
        native_adapter_path: str = "",
        manager: Any = None,
    ) -> SimulatedFleetTransport:
        state.setdefault("transport_builds", []).append(
            {
                "ev3_bt": ev3_bt,
                "native_adapter_configured": bool(native_adapter_path),
                "token_supplied": bool(pairing_token),
            }
        )
        return SimulatedFleetTransport(state, ev3_bt, pairing_token)

    return build


def build_fleet_roster(
    *,
    device_count: int = DEFAULT_DEVICE_COUNT,
    classroom_id: str = "simulated-room-302",
    scratchai_url: str = DEFAULT_SCRATCHAI_URL,
) -> Dict[str, Any]:
    """Build a token-free classroom roster package for simulated EV3s."""
    if device_count < 1:
        raise FleetRehearsalError("device_count must be at least 1")
    return {
        "classroom_id": classroom_id,
        "scratchai_url": scratchai_url,
        "devices": [
            {
                "brick_id": f"VSLE-EV3-{index:04d}",
                "label": f"EV3-{index:02d}",
                "ev3_bt": "A0:E6:F8:19:{:02X}:{:02X}".format(
                    88 + ((index - 1) // 255),
                    index % 255,
                ),
                "expected_sensors": dict(EXPECTED_SENSORS),
            }
            for index in range(1, device_count + 1)
        ],
    }


def run_fleet_rehearsal(
    *,
    root: Path = ROOT,
    device_count: int = DEFAULT_DEVICE_COUNT,
    config_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """Import, pair, select, and supervise a simulated classroom fleet."""
    root = Path(root).resolve()
    config_path = Path(config_path) if config_path else (
        root / ".tmp" / "desktop-fleet-rehearsal" / "config.json"
    )
    if config_path.exists():
        config_path.unlink()

    roster = build_fleet_roster(device_count=device_count)
    credential_backend = MemoryCredentialBackend()
    profile_store = DesktopProfileStore(config_path)
    profile_store.import_roster(roster)

    transport_state: Dict[str, Any] = {}
    transport_factory = simulated_transport_factory(transport_state)
    maintenance = DesktopMaintenanceService(
        credential_backend=credential_backend,
        profile_store=profile_store,
        transport_factory=transport_factory,
    )
    runtime = DesktopRuntimeService(
        credential_backend=credential_backend,
        profile_store=profile_store,
        transport_factory=transport_factory,
    )
    launched_commands: List[List[str]] = []
    supervisor = DesktopSupervisorService(
        runtime_service=runtime,
        process_launcher=lambda command: launched_commands.append(list(command)),
        port_checker=lambda _host, _port: True,
        python_executable="WeisileLink",
    )

    for index, device in enumerate(roster["devices"], start=1):
        save_claimed_profile(
            {
                "brick_id": device["brick_id"],
                "brick_name": device["label"],
                "transport": "vsle-bluetooth",
                "ev3_bt": device["ev3_bt"],
                "pairing_token": f"simulated-secret-token-{index:04d}-1234567890",
                "server_version": "0.1.0",
                "capabilities": {
                    "sensors": ["color", "ultrasonic", "gyro", "touch"],
                    "motors": ["A", "B", "C", "D"],
                    "ai_quest": True,
                },
            },
            credential_backend=credential_backend,
            profile_store=profile_store,
        )

    device_results = []
    for device in roster["devices"]:
        brick_id = device["brick_id"]
        selection = maintenance.select_device(brick_id=brick_id)
        startup = asyncio.run(runtime.ready_status(timeout_s=0.1))
        supervision = asyncio.run(
            supervisor.start(
                config_path=str(config_path),
                port_timeout_s=0.01,
                port_interval_s=0.01,
            )
        )
        device_results.append(
            {
                "brick_id": brick_id,
                "label": device["label"],
                "selected": selection.ok and selection.mutated,
                "startup_state": startup.state.value,
                "startup_sensor_updates": startup.checks.get(
                    "sensor_updates_observed", 0
                ),
                "supervisor_state": supervision.state.value,
                "process_started": supervision.process_started,
                "local_ports_ready": all(supervision.ports.values()),
            }
        )

    evidence = {
        "evidence_kind": "desktop_fleet_rehearsal_simulated",
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "status": "pending",
        "simulated_only": True,
        "release_artifact_evidence_ready": False,
        "minimum_required_devices": DEFAULT_DEVICE_COUNT,
        "device_count": device_count,
        "roster_imported": True,
        "profiles_paired": len(profile_store.load().get("profiles", [])),
        "selected_profiles": sum(1 for item in device_results if item["selected"]),
        "startup_ready": sum(
            1 for item in device_results if item["startup_state"] == "ready"
        ),
        "supervisor_ready": sum(
            1 for item in device_results if item["supervisor_state"] == "ready"
        ),
        "commands_launched": len(launched_commands),
        "token_safe": True,
        "devices": device_results,
        "next_gate": (
            "Collect signed clean-machine macOS/Windows release evidence and "
            "real EV3 Bluetooth install smoke artifacts."
        ),
    }
    evidence["token_safe"] = _is_token_safe(evidence)
    if _fleet_passed(evidence):
        evidence["status"] = "passed"
    else:
        evidence["status"] = "blocked"
    if not evidence["token_safe"]:
        raise FleetRehearsalError("fleet evidence contains credential material")
    return evidence


def render_fleet_rehearsal_report(evidence: Dict[str, Any]) -> str:
    """Render the fleet rehearsal evidence as Markdown."""
    lines = [
        "# Desktop Fleet Rehearsal",
        "",
        f"Status: {evidence.get('status', 'blocked')}",
        f"Device count: {evidence.get('device_count', 0)}",
        "token-safe evidence: {}".format(
            "yes" if evidence.get("token_safe") else "no"
        ),
        "Simulated only: {}".format(
            "yes" if evidence.get("simulated_only") else "no"
        ),
        "Release-artifact evidence ready: {}".format(
            "yes" if evidence.get("release_artifact_evidence_ready") else "no"
        ),
        "",
        (
            "This gate validates classroom fleet profile handling before signed "
            "clean-machine package evidence. It does not replace real EV3 or "
            "release-artifact smoke evidence."
        ),
        "",
        "| Brick ID | Label | Startup | Supervisor | Selection |",
        "| --- | --- | --- | --- | --- |",
    ]
    for device in evidence.get("devices", []):
        lines.append(
            "| {brick_id} | {label} | {startup_state} | {supervisor_state} | {selection} |".format(
                brick_id=device.get("brick_id", ""),
                label=device.get("label", ""),
                startup_state=device.get("startup_state", ""),
                supervisor_state=device.get("supervisor_state", ""),
                selection="pass" if device.get("selected") else "fail",
            )
        )
    lines.extend(
        [
            "",
            "## Next Gate",
            str(evidence.get("next_gate") or ""),
            "",
        ]
    )
    return "\n".join(lines)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run simulated Desktop fleet rehearsal evidence gate."
    )
    parser.add_argument("--device-count", type=int, default=DEFAULT_DEVICE_COUNT)
    parser.add_argument("--config", default="")
    parser.add_argument(
        "--evidence",
        default=str(ROOT / "docs/desktop/evidence/desktop-fleet-rehearsal.json"),
    )
    parser.add_argument(
        "--report",
        default=str(ROOT / "docs/desktop/DESKTOP_FLEET_REHEARSAL.md"),
    )
    args = parser.parse_args(argv)

    if args.device_count < DEFAULT_DEVICE_COUNT:
        print("device-count must be at least 10", file=sys.stderr)
        return 1

    evidence_path = Path(args.evidence)
    report_path = Path(args.report)
    evidence = run_fleet_rehearsal(
        root=ROOT,
        device_count=args.device_count,
        config_path=Path(args.config) if args.config else None,
    )
    report = render_fleet_rehearsal_report(evidence)
    _write_json(evidence_path, evidence)
    _write_text(report_path, report)
    print(f"desktop fleet rehearsal {evidence['status']}: {report_path}")
    return 0 if evidence["status"] == "passed" else 1


def _fleet_passed(evidence: Dict[str, Any]) -> bool:
    device_count = int(evidence.get("device_count") or 0)
    minimum_required = int(
        evidence.get("minimum_required_devices") or DEFAULT_DEVICE_COUNT
    )
    return (
        device_count >= minimum_required
        and evidence.get("roster_imported") is True
        and evidence.get("profiles_paired") == device_count
        and evidence.get("selected_profiles") == device_count
        and evidence.get("startup_ready") == device_count
        and evidence.get("supervisor_ready") == device_count
        and evidence.get("token_safe") is True
    )


def _is_token_safe(payload: Dict[str, Any]) -> bool:
    encoded = json.dumps(payload, sort_keys=True).lower()
    return not any(marker in encoded for marker in FORBIDDEN_EVIDENCE_MARKERS)


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
