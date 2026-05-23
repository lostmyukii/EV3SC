#!/usr/bin/env python3
"""Build and evaluate the real EV3 classroom rehearsal evidence gate."""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Sequence, Tuple


DEFAULT_ROOT = Path("/Users/yukii/Desktop/EV3SC")
DEFAULT_EXPECTED_REAL_EV3 = 10
DEFAULT_EXPECTED_TRANSPORTS = 30
MIN_SENSOR_HZ = 45.0
MIN_WORKFLOW_MINUTES = 45.0
MAX_RECONNECT_SECONDS = 5.0
MAX_DROPPED_UPDATE_PCT = 0.1
MAX_MEMORY_GROWTH_MB = 50.0


class RehearsalError(RuntimeError):
    """Raised when rehearsal evidence is invalid or unsafe to record."""


@dataclass(frozen=True)
class RehearsalGate:
    """One required real-hardware classroom rehearsal gate."""

    id: str
    label: str
    requirement: str
    evidence: str


@dataclass(frozen=True)
class RehearsalPlan:
    """Section 13.7 real EV3 classroom rehearsal plan."""

    root: Path
    expected_devices: int
    expected_transport_instances: int
    gates: Tuple[RehearsalGate, ...]
    evidence_paths: Tuple[Path, ...]


@dataclass(frozen=True)
class SmokeCaptureConfig:
    """Configuration for a one-brick real EV3 smoke evidence capture."""

    root: Path = DEFAULT_ROOT
    weisile_link_url: str = "ws://127.0.0.1:20111/scratch/bt"
    capture_seconds: float = 10.0
    operator: str = ""
    classroom_or_lab: str = ""
    transport_mode: str = "wifi"
    run_safe_motor_test: bool = False
    confirm_real_ev3: bool = False


def _require_inside_root(path: Path, root: Path) -> Path:
    resolved = path.resolve()
    root = root.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise RehearsalError(f"Path escapes EV3SC root: {resolved}") from error
    return resolved


def build_rehearsal_plan(
    *,
    root: Path = DEFAULT_ROOT,
    expected_devices: int = DEFAULT_EXPECTED_REAL_EV3,
    expected_transport_instances: int = DEFAULT_EXPECTED_TRANSPORTS,
) -> RehearsalPlan:
    """Return the Section 13.7 real EV3 classroom rehearsal gate plan."""

    root = root.resolve()
    if not root.is_dir():
        raise RehearsalError(f"EV3SC root does not exist: {root}")
    if expected_devices < 1:
        raise RehearsalError("expected_devices must be at least 1")
    if expected_transport_instances < expected_devices:
        raise RehearsalError(
            "expected_transport_instances must be greater than or equal to "
            "expected_devices"
        )

    evidence_dir = _require_inside_root(root / "docs/classroom/evidence", root)
    evidence_paths = (
        _require_inside_root(
            root / "docs/classroom/real_ev3_rehearsal_evidence.template.json",
            root,
        ),
        _require_inside_root(root / "docs/classroom/REAL_EV3_REHEARSAL.md", root),
        evidence_dir,
    )

    gates = (
        RehearsalGate(
            id="scratchai-unified-stack",
            label="ScratchAI unified stack",
            requirement=(
                "ScratchAI editor, EV3 extension-library entry, "
                "WeisileLink, EV3 firmware, and AI Quest middleware run from "
                "the EV3SC-owned source tree."
            ),
            evidence=(
                "`scratchai_unified_stack=true` plus local stack health logs "
                "from the rehearsal computer."
            ),
        ),
        RehearsalGate(
            id="real-ev3-endpoint",
            label="Real EV3 endpoint connected",
            requirement=(
                "At least one real ev3dev EV3 brick connects through the "
                "unified ScratchAI stack."
            ),
            evidence=(
                "`ev3_endpoint_connected=true` with EV3 IP/host evidence and "
                "WeisileLink connection logs."
            ),
        ),
        RehearsalGate(
            id="weisilelink-real-transport",
            label="WeisileLink real transport",
            requirement=(
                "WeisileLink uses a real WiFi or Bluetooth EV3 transport, "
                "not the local simulated preview transport."
            ),
            evidence=(
                "`weisilelink_real_transport=true` with the transport mode "
                "and bridge status output."
            ),
        ),
        RehearsalGate(
            id="motor-command-safety",
            label="Motor command and safety",
            requirement=(
                "Scratch EV3 blocks drive motors at classroom-safe values and "
                "the emergency stop path stops motors and sound."
            ),
            evidence=(
                "`motor_command_verified=true` and "
                "`emergency_stop_verified=true` with operator notes."
            ),
        ),
        RehearsalGate(
            id="sensor-stream-freshness",
            label="Sensor stream freshness",
            requirement=(
                "The 45-minute student workflow streams sensor data close to "
                "the 50Hz target without excessive drops or memory growth."
            ),
            evidence=(
                f"`sensor_stream_hz>={MIN_SENSOR_HZ}`, "
                f"`sensor_stream_duration_minutes>={MIN_WORKFLOW_MINUTES}`, "
                f"`dropped_update_pct<={MAX_DROPPED_UPDATE_PCT}`, and "
                f"`memory_growth_mb<{MAX_MEMORY_GROWTH_MB}`."
            ),
        ),
        RehearsalGate(
            id="aiquest-collection-training-export",
            label="AI Quest collection, training, and export",
            requirement=(
                "The 45-minute student workflow collects labeled EV3 data, "
                "uploads to Trainer, trains or selects a model, and exports "
                "model rules."
            ),
            evidence=(
                "`aiquest_collection_verified=true` and "
                "`aiquest_training_export_verified=true` with export logs."
            ),
        ),
        RehearsalGate(
            id="multi-device-rehearsal",
            label="30-device classroom rehearsal",
            requirement=(
                f"Start {expected_transport_instances} WeisileLink instances "
                "or simulated EV3 transports on the classroom LAN, connect at "
                f"least {expected_devices} real EV3 bricks if hardware is "
                "available, record disconnects, reconnect time, teacher "
                "recovery steps, and confirm the pilot required no code "
                "changes during class."
            ),
            evidence=(
                "`transport_instance_count`, `device_count`, disconnect, "
                "reconnect, recovery-step, and no-code-change evidence."
            ),
        ),
    )
    return RehearsalPlan(
        root=root,
        expected_devices=expected_devices,
        expected_transport_instances=expected_transport_instances,
        gates=gates,
        evidence_paths=evidence_paths,
    )


def pending_evidence_template(plan: RehearsalPlan) -> Dict[str, Any]:
    """Return a JSON-ready evidence template that does not claim hardware pass."""

    now = datetime.now(timezone.utc).isoformat()
    return {
        "schema": "vsle.realEv3ClassroomRehearsal.v1",
        "created_at": now,
        "run_started_at": "",
        "operator": "",
        "classroom_or_lab": "",
        "notes": "No real EV3 hardware evidence has been attached.",
        "scratchai_unified_stack": False,
        "ev3_endpoint_connected": False,
        "ev3_endpoint": "",
        "weisilelink_real_transport": False,
        "transport_mode": "",
        "smoke_confirmed_real_ev3": False,
        "motor_command_verified": False,
        "emergency_stop_verified": False,
        "sensor_stream_hz": 0.0,
        "sensor_stream_duration_minutes": 0.0,
        "aiquest_collection_verified": False,
        "aiquest_training_export_verified": False,
        "transport_instance_count": 0,
        "device_count": 0,
        "disconnects_recorded": False,
        "disconnect_count": 0,
        "reconnect_time_seconds_max": None,
        "dropped_update_pct": None,
        "memory_growth_mb": None,
        "teacher_recovery_steps_recorded": False,
        "pilot_required_code_changes": True,
        "evidence_files": [],
        "expected_devices": plan.expected_devices,
        "expected_transport_instances": plan.expected_transport_instances,
    }


def build_smoke_json_rpc_requests(
    *,
    peripheral_id: str = "vsle-ev3-wifi",
    run_safe_motor_test: bool = False,
) -> List[Dict[str, Any]]:
    """Build the JSON-RPC 2.0 request sequence for a one-brick smoke capture."""

    requests: List[Dict[str, Any]] = [
        {
            "jsonrpc": "2.0",
            "id": "smoke-version",
            "method": "getVersion",
        },
        {
            "jsonrpc": "2.0",
            "id": "smoke-discover",
            "method": "discover",
            "params": {"filters": [{"namePrefix": "EV3"}]},
        },
        {
            "jsonrpc": "2.0",
            "id": "smoke-connect",
            "method": "connect",
            "params": {"peripheralId": peripheral_id},
        },
        {
            "jsonrpc": "2.0",
            "id": "smoke-notifications",
            "method": "startNotifications",
        },
    ]
    if run_safe_motor_test:
        requests.append(
            {
                "jsonrpc": "2.0",
                "id": "smoke-motor",
                "method": "motor.runTimed",
                "params": {"port": "A", "speed": 10, "time": 0.25},
            }
        )
    requests.extend(
        [
            {
                "jsonrpc": "2.0",
                "id": "smoke-stop-all",
                "method": "motor.stopAll",
                "params": {},
            },
            {
                "jsonrpc": "2.0",
                "id": "smoke-sound-stop",
                "method": "sound.stop",
                "params": {},
            },
        ]
    )
    return requests


def _decode_notification_payload(message: Mapping[str, Any]) -> Dict[str, Any]:
    params = message.get("params")
    if not isinstance(params, Mapping):
        return {}
    encoded = params.get("message")
    if not isinstance(encoded, str) or not encoded:
        return {}
    try:
        raw = base64.b64decode(encoded).decode("utf-8")
        payload = json.loads(raw)
    except Exception:
        return {}
    if not isinstance(payload, dict):
        return {}
    return payload


async def _recv_until_response(
    websocket: Any,
    request_id: str,
    transcript: Dict[str, Any],
    *,
    timeout: float = 5.0,
) -> Dict[str, Any]:
    while True:
        raw = await asyncio.wait_for(websocket.recv(), timeout=timeout)
        message = json.loads(raw)
        transcript["messages"].append(message)
        if message.get("method") in {
            "didDiscoverPeripheral",
            "notifyDeviceDidReceiveMessage",
            "didReceiveMessage",
        }:
            if message.get("method") == "didDiscoverPeripheral":
                params = message.get("params") or {}
                peripheral_id = params.get("peripheralId")
                if peripheral_id:
                    transcript["peripheral_id"] = peripheral_id
            if message.get("method") == "notifyDeviceDidReceiveMessage":
                transcript["sensor_payloads"].append(_decode_notification_payload(message))
            continue
        if message.get("id") == request_id:
            return message


async def capture_smoke_transcript(config: SmokeCaptureConfig) -> Dict[str, Any]:
    """Capture one real EV3 smoke transcript through WeisileLink."""

    started_at = datetime.now(timezone.utc).isoformat()
    transcript: Dict[str, Any] = {
        "ok": False,
        "started_at": started_at,
        "weisile_link_url": config.weisile_link_url,
        "version_ok": False,
        "discover_ok": False,
        "connect_ok": False,
        "motor_ack": False,
        "emergency_stop_ack": False,
        "sensor_update_count": 0,
        "elapsed_seconds": 0.0,
        "errors": [],
        "peripheral_id": "vsle-ev3-wifi",
        "messages": [],
        "sensor_payloads": [],
        "evidence_files": [],
    }
    try:
        import websockets

        async with websockets.connect(
            config.weisile_link_url,
            open_timeout=5,
        ) as websocket:
            first_requests = build_smoke_json_rpc_requests(
                peripheral_id=transcript["peripheral_id"],
                run_safe_motor_test=False,
            )[:2]
            for request in first_requests:
                await websocket.send(json.dumps(request))
                response = await _recv_until_response(
                    websocket,
                    str(request["id"]),
                    transcript,
                )
                if request["method"] == "getVersion":
                    result = response.get("result")
                    transcript["version_ok"] = isinstance(result, dict) and (
                        result.get("implementation") == "WeisileLink"
                    )
                if request["method"] == "discover":
                    transcript["discover_ok"] = "error" not in response

            requests = build_smoke_json_rpc_requests(
                peripheral_id=str(transcript["peripheral_id"]),
                run_safe_motor_test=config.run_safe_motor_test,
            )[2:]
            for request in requests:
                await websocket.send(json.dumps(request))
                response = await _recv_until_response(
                    websocket,
                    str(request["id"]),
                    transcript,
                )
                ok = "error" not in response
                method = request["method"]
                if method == "connect":
                    transcript["connect_ok"] = ok
                elif method == "motor.runTimed":
                    transcript["motor_ack"] = ok
                elif method == "motor.stopAll":
                    transcript["emergency_stop_ack"] = ok
                elif method == "sound.stop":
                    transcript["sound_stop_ack"] = ok

            start = asyncio.get_running_loop().time()
            deadline = start + max(0.1, config.capture_seconds)
            while asyncio.get_running_loop().time() < deadline:
                remaining = deadline - asyncio.get_running_loop().time()
                try:
                    raw = await asyncio.wait_for(
                        websocket.recv(),
                        timeout=min(remaining, 1.0),
                    )
                except asyncio.TimeoutError:
                    continue
                message = json.loads(raw)
                transcript["messages"].append(message)
                if message.get("method") == "notifyDeviceDidReceiveMessage":
                    transcript["sensor_update_count"] += 1
                    transcript["sensor_payloads"].append(
                        _decode_notification_payload(message)
                    )
            transcript["elapsed_seconds"] = round(
                asyncio.get_running_loop().time() - start,
                3,
            )
            transcript["ok"] = (
                transcript["version_ok"]
                and transcript["discover_ok"]
                and transcript["connect_ok"]
                and transcript["emergency_stop_ack"]
                and transcript["sensor_update_count"] > 0
            )
            if config.run_safe_motor_test:
                transcript["ok"] = transcript["ok"] and transcript["motor_ack"]
    except Exception as error:
        transcript["errors"].append(str(error))
    return transcript


def smoke_capture_to_evidence(
    plan: RehearsalPlan,
    config: SmokeCaptureConfig,
    transcript: Mapping[str, Any],
) -> Dict[str, Any]:
    """Convert a one-brick smoke transcript into rehearsal evidence JSON."""

    evidence = pending_evidence_template(plan)
    elapsed = _number_evidence(transcript, "elapsed_seconds")
    sensor_updates = _int_evidence(transcript, "sensor_update_count")
    sensor_hz = round(sensor_updates / elapsed, 3) if elapsed > 0 else 0.0
    errors = [str(error) for error in transcript.get("errors", [])]
    bridge_ok = transcript.get("version_ok") is True
    connected = transcript.get("connect_ok") is True
    confirmed_real = config.confirm_real_ev3 is True
    motor_ack = transcript.get("motor_ack") is True
    emergency_ack = transcript.get("emergency_stop_ack") is True
    evidence.update(
        {
            "run_started_at": str(transcript.get("started_at") or ""),
            "operator": config.operator,
            "classroom_or_lab": config.classroom_or_lab,
            "notes": (
                "1-brick smoke capture. This does not replace the 45-minute "
                "Section 13.7 classroom rehearsal. "
                + ("Errors: " + "; ".join(errors) if errors else "No capture errors.")
                + (
                    " Real EV3 confirmation was provided."
                    if confirmed_real
                    else " Real EV3 confirmation was not provided."
                )
            ),
            "ev3_endpoint_connected": connected and confirmed_real,
            "ev3_endpoint": str(transcript.get("peripheral_id") or ""),
            "weisilelink_real_transport": (
                bridge_ok and connected and confirmed_real and not errors
            ),
            "transport_mode": config.transport_mode,
            "smoke_confirmed_real_ev3": confirmed_real,
            "motor_command_verified": motor_ack or (
                not config.run_safe_motor_test and emergency_ack
            ),
            "emergency_stop_verified": emergency_ack,
            "sensor_stream_hz": sensor_hz,
            "sensor_stream_duration_minutes": round(elapsed / 60.0, 3),
            "transport_instance_count": 1 if bridge_ok else 0,
            "device_count": 1 if connected and confirmed_real else 0,
            "disconnects_recorded": False,
            "pilot_required_code_changes": not bool(transcript.get("ok")),
            "evidence_files": list(transcript.get("evidence_files", [])),
        }
    )
    return evidence


def attach_smoke_capture_artifact_paths(
    root: Path,
    transcript: Dict[str, Any],
    *,
    evidence_path: Path | None = None,
    transcript_path: Path | None = None,
) -> None:
    """Record smoke capture artifacts using EV3SC-root-relative paths."""

    paths: List[str] = []
    for path in (evidence_path, transcript_path):
        if path is None:
            continue
        paths.append(str(_require_inside_root(path, root).relative_to(root)))
    transcript["evidence_files"] = paths


def _bool_evidence(evidence: Mapping[str, Any], key: str) -> bool:
    return evidence.get(key) is True


def _number_evidence(evidence: Mapping[str, Any], key: str) -> float:
    value = evidence.get(key)
    if value is None or value == "":
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _int_evidence(evidence: Mapping[str, Any], key: str) -> int:
    return int(_number_evidence(evidence, key))


def _result(
    gate: RehearsalGate,
    passed: bool,
    detail: str,
) -> Dict[str, Any]:
    return {
        "id": gate.id,
        "label": gate.label,
        "status": "PASS" if passed else "FAIL",
        "passed": passed,
        "requirement": gate.requirement,
        "evidence": gate.evidence,
        "detail": detail,
    }


def _gate_results(
    plan: RehearsalPlan,
    evidence: Mapping[str, Any],
) -> List[Dict[str, Any]]:
    by_id = {gate.id: gate for gate in plan.gates}
    sensor_hz = _number_evidence(evidence, "sensor_stream_hz")
    duration = _number_evidence(evidence, "sensor_stream_duration_minutes")
    dropped = evidence.get("dropped_update_pct")
    memory = evidence.get("memory_growth_mb")
    reconnect = evidence.get("reconnect_time_seconds_max")
    dropped_pct = _number_evidence(evidence, "dropped_update_pct")
    memory_growth = _number_evidence(evidence, "memory_growth_mb")
    reconnect_max = _number_evidence(evidence, "reconnect_time_seconds_max")
    device_count = _int_evidence(evidence, "device_count")
    transport_count = _int_evidence(evidence, "transport_instance_count")
    pilot_code_changes = evidence.get("pilot_required_code_changes") is True

    return [
        _result(
            by_id["scratchai-unified-stack"],
            _bool_evidence(evidence, "scratchai_unified_stack"),
            "Requires `scratchai_unified_stack=true` from the rehearsal run.",
        ),
        _result(
            by_id["real-ev3-endpoint"],
            _bool_evidence(evidence, "ev3_endpoint_connected"),
            "Requires `ev3_endpoint_connected=true` from a real EV3 brick.",
        ),
        _result(
            by_id["weisilelink-real-transport"],
            _bool_evidence(evidence, "weisilelink_real_transport"),
            "Requires `weisilelink_real_transport=true`, not simulation.",
        ),
        _result(
            by_id["motor-command-safety"],
            _bool_evidence(evidence, "motor_command_verified")
            and _bool_evidence(evidence, "emergency_stop_verified")
            and not pilot_code_changes,
            (
                "Requires motor command, emergency stop, and no in-class code "
                "changes."
            ),
        ),
        _result(
            by_id["sensor-stream-freshness"],
            sensor_hz >= MIN_SENSOR_HZ
            and duration >= MIN_WORKFLOW_MINUTES
            and dropped is not None
            and dropped_pct <= MAX_DROPPED_UPDATE_PCT
            and memory is not None
            and memory_growth < MAX_MEMORY_GROWTH_MB,
            (
                f"Measured {sensor_hz:.2f}Hz for {duration:.1f} minutes, "
                f"dropped {dropped_pct:.3f}%, memory +{memory_growth:.1f}MB."
            ),
        ),
        _result(
            by_id["aiquest-collection-training-export"],
            _bool_evidence(evidence, "aiquest_collection_verified")
            and _bool_evidence(evidence, "aiquest_training_export_verified"),
            "Requires AI Quest collection plus training/export evidence.",
        ),
        _result(
            by_id["multi-device-rehearsal"],
            transport_count >= plan.expected_transport_instances
            and device_count >= plan.expected_devices
            and _bool_evidence(evidence, "disconnects_recorded")
            and reconnect is not None
            and reconnect_max <= MAX_RECONNECT_SECONDS
            and _bool_evidence(evidence, "teacher_recovery_steps_recorded")
            and not pilot_code_changes,
            (
                f"Observed {transport_count} transports and {device_count} "
                f"real EV3 devices; max reconnect {reconnect_max:.1f}s."
            ),
        ),
    ]


def _validate_evidence_files(
    root: Path,
    evidence_files: Iterable[Any],
) -> List[str]:
    valid_files: List[str] = []
    for value in evidence_files:
        file_path = Path(str(value))
        if file_path.is_absolute():
            path = _require_inside_root(file_path, root)
            valid_files.append(str(path.relative_to(root)))
        else:
            path = _require_inside_root(root / file_path, root)
            valid_files.append(str(path.relative_to(root)))
    return valid_files


def evaluate_rehearsal_evidence(
    plan: RehearsalPlan,
    evidence: Mapping[str, Any],
) -> Dict[str, Any]:
    """Evaluate JSON rehearsal evidence against the Section 13.7 gate plan."""

    evidence_files = _validate_evidence_files(
        plan.root,
        evidence.get("evidence_files", []),
    )
    results = _gate_results(plan, evidence)
    passed = sum(1 for result in results if result["passed"])
    failed = len(results) - passed
    missing = [result["id"] for result in results if not result["passed"]]
    approved = failed == 0
    return {
        "status": "PASSED" if approved else "BLOCKED",
        "classroomApproved": approved,
        "passed": passed,
        "failed": failed,
        "missingEvidence": missing,
        "expectedDevices": plan.expected_devices,
        "expectedTransportInstances": plan.expected_transport_instances,
        "results": results,
        "evidenceFiles": evidence_files,
        "operator": str(evidence.get("operator") or ""),
        "runStartedAt": str(evidence.get("run_started_at") or ""),
        "notes": str(evidence.get("notes") or ""),
    }


def render_rehearsal_report(
    plan: RehearsalPlan,
    summary: Mapping[str, Any],
) -> str:
    """Render a Markdown classroom rehearsal report."""

    lines = [
        "# Real EV3 Classroom Rehearsal",
        "",
        f"Date: {datetime.now(timezone.utc).date().isoformat()}",
        "",
        "This report covers the Section 13.7 manual classroom acceptance gate.",
        "Automated localhost testing does not replace the real EV3 classroom rehearsal.",
        "",
        "## Summary",
        "",
        f"- Status: {summary['status']}",
        ("- Classroom approved: " f"{str(summary['classroomApproved']).lower()}"),
        f"- Gates passed: {summary['passed']}",
        f"- Gates failed: {summary['failed']}",
        f"- Expected real EV3 bricks: {plan.expected_devices}",
        (
            "- Expected transport instances or simulated EV3 transports: "
            f"{plan.expected_transport_instances}"
        ),
        "",
        "## Gate Results",
        "",
        "| Gate | Status | Evidence detail |",
        "|---|---|---|",
    ]
    for result in summary["results"]:
        lines.append(f"| {result['id']} | {result['status']} | {result['detail']} |")
    lines.extend(
        [
            "",
            "## Required Evidence",
            "",
        ]
    )
    for gate in plan.gates:
        lines.extend(
            [
                f"### {gate.label}",
                "",
                f"- Requirement: {gate.requirement}",
                f"- Evidence: {gate.evidence}",
                "",
            ]
        )
    lines.extend(
        [
            "## Attached Evidence Files",
            "",
        ]
    )
    evidence_files = list(summary.get("evidenceFiles", []))
    if evidence_files:
        lines.extend(f"- `{file_path}`" for file_path in evidence_files)
    else:
        lines.append("- None attached yet.")
    lines.extend(
        [
            "",
            "## Operator Notes",
            "",
            summary.get("notes", "") or "No notes recorded.",
            "",
            "## Next Action",
            "",
        ]
    )
    if summary["classroomApproved"]:
        lines.append(
            "Attach this report to the pilot release record and keep raw "
            "evidence under `docs/classroom/evidence/`."
        )
    else:
        missing = ", ".join(summary["missingEvidence"])
        lines.append(
            "Classroom pilot remains blocked until these evidence gates pass: "
            f"{missing}."
        )
    lines.append("")
    return "\n".join(lines)


def render_smoke_handoff(
    *,
    root: Path,
    ev3_host: str = "ev3dev.local",
    ev3_port: int = 8765,
    weisile_link_url: str = "ws://127.0.0.1:20111/scratch/bt",
) -> str:
    """Render the operator handoff for confirmed physical EV3 smoke capture."""

    root = root.resolve()
    smoke_command = (
        ".venv/bin/python scripts/run_real_ev3_rehearsal.py \\\n"
        "  --capture-smoke \\\n"
        "  --confirm-real-ev3 \\\n"
        "  --run-safe-motor-test \\\n"
        f"  --weisile-link-url {weisile_link_url} \\\n"
        "  --capture-seconds 10 \\\n"
        "  --capture-smoke-evidence "
        "docs/classroom/real_ev3_smoke_evidence.json \\\n"
        "  --capture-smoke-transcript "
        "docs/classroom/evidence/real_ev3_smoke_transcript.json \\\n"
        "  --json-report docs/classroom/real_ev3_smoke_report.json \\\n"
        "  --report docs/classroom/REAL_EV3_REHEARSAL.md \\\n"
        "  --expected-devices 1 \\\n"
        "  --expected-transport-instances 1"
    )
    full_rehearsal_command = (
        ".venv/bin/python scripts/run_real_ev3_rehearsal.py \\\n"
        "  --evidence-json docs/classroom/real_ev3_rehearsal_evidence.json \\\n"
        "  --json-report docs/classroom/real_ev3_rehearsal_report.json \\\n"
        "  --report docs/classroom/REAL_EV3_REHEARSAL.md \\\n"
        "  --require-passed"
    )
    lines = [
        "# Real EV3 Smoke Handoff",
        "",
        "This handoff is for the physical EV3 operator. Local preview, simulator,",
        "or localhost-only success is not enough for classroom approval.",
        "",
        "Do not use `--confirm-real-ev3` unless the connected endpoint is a",
        "physical LEGO EV3 brick running the EV3SC `vsle_ev3_server.py` on",
        "ev3dev.",
        "",
        "## Repository",
        "",
        f"- Run all commands from `{root}`.",
        "- Do not edit or depend on the external ScratchAI reference folder.",
        "",
        "## EV3 Brick Preflight",
        "",
        "On the teacher computer:",
        "",
        "```bash",
        f"ping -c 1 {ev3_host}",
        f"nc -z -w 2 {ev3_host} {ev3_port}",
        "```",
        "",
        "On the EV3 brick:",
        "",
        "```bash",
        "systemctl status vsle-ev3-server",
        "journalctl -u vsle-ev3-server -n 80 --no-pager",
        "```",
        "",
        "## WeisileLink Real Transport",
        "",
        "Start WeisileLink against the physical EV3 endpoint:",
        "",
        "```bash",
        f"PYTHONPATH=weisile-link EV3_IP={ev3_host} EV3_WS_PORT={ev3_port} \\",
        "  WEISILE_TRANSPORT=wifi .venv/bin/python -m weisile_link",
        "```",
        "",
        "Then verify the local Scratch Link compatible endpoint is reachable:",
        "",
        "```bash",
        "nc -z -w 2 127.0.0.1 20111",
        "```",
        "",
        "## Confirmed One-Brick Smoke Capture",
        "",
        "Run only after physically confirming the EV3 endpoint and clearing the",
        "motor area for the low-speed 0.25s motor A test:",
        "",
        "```bash",
        smoke_command,
        "```",
        "",
        "Expected smoke result: `real-ev3-endpoint`,",
        "`weisilelink-real-transport`, and `motor-command-safety` can pass,",
        "while the full classroom gate remains blocked until 45-minute sensor,",
        "AI Quest, and multi-device evidence is attached.",
        "",
        "## Section 13.7 Full Classroom Rehearsal",
        "",
        "After the confirmed smoke capture, collect the full evidence JSON for",
        "the 30-transport / 10-real-brick rehearsal and run:",
        "",
        "```bash",
        full_rehearsal_command,
        "```",
        "",
    ]
    return "\n".join(lines)


def _write_json(path: Path, payload: Mapping[str, Any], root: Path) -> None:
    path = _require_inside_root(path, root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def _write_text(path: Path, text: str, root: Path) -> None:
    path = _require_inside_root(path, root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def _load_evidence(path: Path, root: Path) -> Dict[str, Any]:
    path = _require_inside_root(path, root)
    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)
    if not isinstance(data, dict):
        raise RehearsalError("Evidence JSON must contain an object")
    return data


def _plan_json(plan: RehearsalPlan) -> Dict[str, Any]:
    return {
        "expectedDevices": plan.expected_devices,
        "expectedTransportInstances": plan.expected_transport_instances,
        "gates": [
            {
                "id": gate.id,
                "label": gate.label,
                "requirement": gate.requirement,
                "evidence": gate.evidence,
            }
            for gate in plan.gates
        ],
        "evidencePaths": [str(path) for path in plan.evidence_paths],
    }


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate Section 13.7 real EV3 classroom rehearsal evidence."
    )
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument(
        "--expected-devices",
        type=int,
        default=DEFAULT_EXPECTED_REAL_EV3,
        help="Minimum real EV3 bricks required for the rehearsal gate.",
    )
    parser.add_argument(
        "--expected-transport-instances",
        type=int,
        default=DEFAULT_EXPECTED_TRANSPORTS,
        help="Minimum WeisileLink or simulated EV3 transports required.",
    )
    parser.add_argument("--evidence-json", type=Path)
    parser.add_argument("--json-report", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--write-template", type=Path)
    parser.add_argument(
        "--write-smoke-handoff",
        type=Path,
        help="Write the physical EV3 smoke-capture operator handoff.",
    )
    parser.add_argument(
        "--capture-smoke",
        action="store_true",
        help="Capture one real EV3 smoke transcript through WeisileLink.",
    )
    parser.add_argument(
        "--capture-smoke-evidence",
        type=Path,
        help="Write the captured smoke evidence JSON to this path.",
    )
    parser.add_argument(
        "--capture-smoke-transcript",
        type=Path,
        help="Write the raw smoke transcript JSON to this path.",
    )
    parser.add_argument(
        "--weisile-link-url",
        default="ws://127.0.0.1:20111/scratch/bt",
        help="Scratch Link compatible WeisileLink WebSocket URL.",
    )
    parser.add_argument(
        "--capture-seconds",
        type=float,
        default=10.0,
        help="Seconds to listen for EV3 sensor notifications during smoke capture.",
    )
    parser.add_argument("--operator", default="")
    parser.add_argument("--classroom-or-lab", default="")
    parser.add_argument("--transport-mode", default="wifi")
    parser.add_argument("--ev3-host", default="ev3dev.local")
    parser.add_argument("--ev3-port", type=int, default=8765)
    parser.add_argument(
        "--run-safe-motor-test",
        action="store_true",
        help="Run a low-speed 0.25s motor A command before emergency stop.",
    )
    parser.add_argument(
        "--confirm-real-ev3",
        action="store_true",
        help=(
            "Operator confirms the connected endpoint is real EV3 hardware, "
            "not the preview simulator."
        ),
    )
    parser.add_argument(
        "--pending",
        action="store_true",
        help="Use the pending template when no evidence JSON is supplied.",
    )
    parser.add_argument("--print-plan", action="store_true")
    parser.add_argument(
        "--require-passed",
        action="store_true",
        help="Exit non-zero unless all real EV3 rehearsal gates pass.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    plan = build_rehearsal_plan(
        root=args.root,
        expected_devices=args.expected_devices,
        expected_transport_instances=args.expected_transport_instances,
    )

    if args.print_plan:
        print(json.dumps(_plan_json(plan), indent=2, sort_keys=True))

    template = pending_evidence_template(plan)
    if args.write_template:
        _write_json(args.write_template, template, plan.root)
    if args.write_smoke_handoff:
        _write_text(
            args.write_smoke_handoff,
            render_smoke_handoff(
                root=plan.root,
                ev3_host=args.ev3_host,
                ev3_port=args.ev3_port,
                weisile_link_url=args.weisile_link_url,
            ),
            plan.root,
        )

    if args.capture_smoke:
        config = SmokeCaptureConfig(
            root=plan.root,
            weisile_link_url=args.weisile_link_url,
            capture_seconds=args.capture_seconds,
            operator=args.operator,
            classroom_or_lab=args.classroom_or_lab,
            transport_mode=args.transport_mode,
            run_safe_motor_test=args.run_safe_motor_test,
            confirm_real_ev3=args.confirm_real_ev3,
        )
        transcript = asyncio.run(capture_smoke_transcript(config))
        attach_smoke_capture_artifact_paths(
            plan.root,
            transcript,
            evidence_path=args.capture_smoke_evidence,
            transcript_path=args.capture_smoke_transcript,
        )
        if args.capture_smoke_transcript:
            _write_json(args.capture_smoke_transcript, transcript, plan.root)
        evidence = smoke_capture_to_evidence(plan, config, transcript)
        if args.capture_smoke_evidence:
            _write_json(args.capture_smoke_evidence, evidence, plan.root)
    elif args.evidence_json:
        evidence = _load_evidence(args.evidence_json, plan.root)
    elif args.pending or args.report or args.json_report:
        evidence = template
    else:
        return 0

    summary = evaluate_rehearsal_evidence(plan, evidence)
    if args.json_report:
        _write_json(args.json_report, summary, plan.root)
    if args.report:
        _write_text(args.report, render_rehearsal_report(plan, summary), plan.root)

    if not args.report and not args.json_report:
        print(json.dumps(summary, indent=2, sort_keys=True))

    if args.require_passed and not summary["classroomApproved"]:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
