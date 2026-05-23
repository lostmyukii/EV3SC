#!/usr/bin/env python3
"""Run ScratchAI-centered VSLE-EV3 final automated acceptance gates."""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Tuple


DEFAULT_ROOT = Path("/Users/yukii/Desktop/EV3SC")
DEFAULT_RUNTIME_LINK_PORT = 20211
DEFAULT_RUNTIME_TRAINER_PORT = 18766


class FinalAcceptanceError(RuntimeError):
    """Raised when the final acceptance plan is invalid."""


@dataclass(frozen=True)
class AcceptanceGate:
    """One automated final-acceptance command."""

    id: str
    label: str
    requirement: str
    evidence: str
    command: Tuple[str, ...]
    cwd: Path
    timeout_seconds: int = 300
    kind: str = "command"


@dataclass(frozen=True)
class ManualGate:
    """One manual final-acceptance item that needs human/hardware evidence."""

    id: str
    label: str
    status: str
    requirement: str
    evidence: str
    next_action: str


@dataclass(frozen=True)
class AcceptancePlan:
    """Full ScratchAI VSLE-EV3 final acceptance plan."""

    gates: Tuple[AcceptanceGate, ...]
    manual_gates: Tuple[ManualGate, ...]


def _require_inside_root(path: Path, root: Path) -> Path:
    resolved = path.resolve()
    root = root.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise FinalAcceptanceError(
            f"Final acceptance path escapes EV3SC root: {resolved}"
        ) from error
    return resolved


def _python_command(root: Path) -> str:
    venv_python = root / ".venv/bin/python"
    if venv_python.exists():
        return str(venv_python)
    return sys.executable or "python3"


def build_acceptance_plan(
    *,
    root: Path = DEFAULT_ROOT,
    include_runtime_preview: bool = False,
    runtime_link_port: int = DEFAULT_RUNTIME_LINK_PORT,
    runtime_trainer_port: int = DEFAULT_RUNTIME_TRAINER_PORT,
) -> AcceptancePlan:
    """Build the final automated acceptance gate plan."""

    root = root.resolve()
    if not root.is_dir():
        raise FinalAcceptanceError(f"EV3SC root does not exist: {root}")
    python = _python_command(root)
    scratch_editor = _require_inside_root(
        root / "scratch-ai-platform/scratch-editor",
        root,
    )
    extension_root = _require_inside_root(root / "vsle-ev3-extension", root)

    gates: List[AcceptanceGate] = [
        AcceptanceGate(
            id="unified-preview-plan",
            label="Unified local preview plan",
            requirement=(
                "Unified ScratchAI editor, middleware, asset worker, "
                "preview gateway, VSLE-EV3 extension hosting, WeisileLink, "
                "Trainer WebSocket, and AI Quest mock provider are wired "
                "inside EV3SC."
            ),
            evidence="Prints local-only service plan and health checks.",
            command=(
                python,
                "scripts/start_unified_preview.py",
                "--print-plan",
                "--weisile-link-port",
                str(runtime_link_port),
                "--trainer-port",
                str(runtime_trainer_port),
            ),
            cwd=root,
            timeout_seconds=60,
        )
    ]
    if include_runtime_preview:
        gates.append(
            AcceptanceGate(
                id="unified-preview-runtime",
                label="Unified local preview runtime",
                requirement=(
                    "Running unified stack responds through ScratchAI services, "
                    "WeisileLink JSON-RPC, and Trainer WebSocket endpoints."
                ),
                evidence="Starts the stack, then runs verify_unified_preview.py.",
                command=(
                    python,
                    "scripts/start_unified_preview.py",
                    "--weisile-link-port",
                    str(runtime_link_port),
                    "--trainer-port",
                    str(runtime_trainer_port),
                    "&&",
                    python,
                    "scripts/verify_unified_preview.py",
                    "--weisile-link-port",
                    str(runtime_link_port),
                    "--trainer-port",
                    str(runtime_trainer_port),
                ),
                cwd=root,
                timeout_seconds=240,
                kind="runtime-preview",
            )
        )
    gates.extend(
        [
            AcceptanceGate(
                id="scratchai-ev3-entry",
                label="ScratchAI EV3 extension-library entry",
                requirement=(
                    "The ScratchAI extension library `EV3` tile loads the "
                    "complete VSLE-EV3 Unsandboxed extension and selects the "
                    "`vsleev3` category."
                ),
                evidence="Scratch GUI unit tests for extension metadata and click flow.",
                command=(
                    "npm",
                    "--workspace",
                    "@scratch/scratch-gui",
                    "run",
                    "test:unit",
                    "--",
                    "--runTestsByPath",
                    "test/unit/util/extensions-library.test.jsx",
                    "test/unit/containers/extension-library.test.jsx",
                ),
                cwd=scratch_editor,
                timeout_seconds=300,
            ),
            AcceptanceGate(
                id="legacy-ev3-compat",
                label="Legacy official EV3 project compatibility",
                requirement=(
                    "Older `.sb3` projects using legacy official EV3 opcodes "
                    "map automatically to the complete VSLE-EV3 runtime."
                ),
                evidence="Scratch VM TAP tests for legacy official EV3 fixtures.",
                command=(
                    "npm",
                    "--workspace",
                    "@scratch/scratch-vm",
                    "exec",
                    "--",
                    "tap",
                    "test/unit/extension_vsle_ev3_compat.js",
                    "test/unit/extension_unsandboxed_loader.js",
                ),
                cwd=scratch_editor,
                timeout_seconds=300,
            ),
            AcceptanceGate(
                id="vsle-extension-aiquest",
                label="VSLE-EV3 block surface and AI Quest blocks",
                requirement=(
                    "EV3 category exposes the complete EV3 hardware and AI "
                    "Quest block surface with synchronous reporter behavior."
                ),
                evidence="VSLE-EV3 extension Node test suite.",
                command=("npm", "test"),
                cwd=extension_root,
                timeout_seconds=300,
            ),
            AcceptanceGate(
                id="aiquest-contract-provider",
                label="AI Quest contract, providers, and prediction fallback",
                requirement=(
                    "AI Quest upload/train/export/predict supports governed "
                    "raw time-series data and cloud/cached/localFallback "
                    "prediction modes."
                ),
                evidence="WeisileLink AI Quest contract, JSON-RPC, and provider tests.",
                command=(
                    python,
                    "-m",
                    "pytest",
                    "weisile-link/tests/test_ai_quest_contract.py",
                    "weisile-link/tests/test_json_rpc_server_ai_quest.py",
                    "weisile-link/tests/test_ai_quest_providers.py",
                    "-q",
                ),
                cwd=root,
                timeout_seconds=300,
            ),
            AcceptanceGate(
                id="hardware-readiness-assets",
                label="Deployment and hardware-readiness assets",
                requirement=(
                    "EV3SC includes deployment, autostart, performance, and "
                    "security gates needed before a real EV3 classroom pilot."
                ),
                evidence=(
                    "Deployment packaging, EV3 autostart, security review, "
                    "and 50Hz performance tests."
                ),
                command=(
                    python,
                    "-m",
                    "pytest",
                    "tests/test_deployment_packaging.py",
                    "tests/test_ev3_autostart_assets.py",
                    "tests/test_security_review.py",
                    "tests/test_performance_50hz.py",
                    "-q",
                ),
                cwd=root,
                timeout_seconds=300,
            ),
        ]
    )
    manual_gates = (
        ManualGate(
            id="real-ev3-classroom-rehearsal",
            label="Real EV3 classroom rehearsal",
            status="PENDING",
            requirement=(
                "Section 13.7 classroom acceptance requires real EV3 bricks "
                "when hardware is available, plus teacher rehearsal evidence."
            ),
            evidence=(
                "No real EV3 hardware evidence is generated by automated "
                "localhost tests."
            ),
            next_action=(
                "Run the unified stack with a real EV3 brick on ev3dev, record "
                "EV3 connection, motor, sensor, AI Quest collection, and "
                "multi-device rehearsal results."
            ),
        ),
    )
    return AcceptancePlan(gates=tuple(gates), manual_gates=manual_gates)


def _run_command_gate(gate: AcceptanceGate) -> Tuple[int, str, str]:
    completed = subprocess.run(
        gate.command,
        cwd=gate.cwd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=gate.timeout_seconds,
    )
    return completed.returncode, completed.stdout, completed.stderr


def _run_runtime_preview_gate(gate: AcceptanceGate) -> Tuple[int, str, str]:
    command = list(gate.command)
    separator = command.index("&&")
    start_command = command[:separator]
    verify_command = command[separator + 1 :]
    process = subprocess.Popen(
        start_command,
        cwd=gate.cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,
    )
    try:
        time.sleep(3)
        if process.poll() is not None:
            output = process.stdout.read() if process.stdout else ""
            return process.returncode or 1, output, "runtime preview exited early"
        completed = subprocess.run(
            [*verify_command, "--timeout-seconds", "180"],
            cwd=gate.cwd,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=gate.timeout_seconds,
        )
        return completed.returncode, completed.stdout, completed.stderr
    finally:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait(timeout=10)


def run_gate(gate: AcceptanceGate) -> Tuple[int, str, str]:
    """Run one automated acceptance gate."""

    if gate.kind == "runtime-preview":
        return _run_runtime_preview_gate(gate)
    return _run_command_gate(gate)


def _tail(text: str, limit: int = 4000) -> str:
    return text[-limit:] if len(text) > limit else text


def run_acceptance_plan(
    plan: AcceptancePlan,
    *,
    runner: Optional[Callable[[AcceptanceGate], Tuple[int, str, str]]] = None,
) -> List[Dict[str, object]]:
    """Run all automated gates and return JSON-ready result records."""

    run = runner or run_gate
    results: List[Dict[str, object]] = []
    for gate in plan.gates:
        started = time.monotonic()
        try:
            returncode, stdout, stderr = run(gate)
        except subprocess.TimeoutExpired as error:
            returncode = 124
            stdout = error.stdout or ""
            stderr = str(error)
        duration_ms = int((time.monotonic() - started) * 1000)
        results.append(
            {
                "id": gate.id,
                "label": gate.label,
                "ok": returncode == 0,
                "returncode": returncode,
                "requirement": gate.requirement,
                "evidence": gate.evidence,
                "command": list(gate.command),
                "cwd": str(gate.cwd),
                "durationMs": duration_ms,
                "stdoutTail": _tail(stdout),
                "stderrTail": _tail(stderr),
            }
        )
    return results


def acceptance_summary(
    plan: AcceptancePlan,
    results: Iterable[Dict[str, object]],
) -> Dict[str, object]:
    """Return a JSON-ready final acceptance summary."""

    result_list = list(results)
    passed = sum(1 for result in result_list if result.get("ok") is True)
    failed = len(result_list) - passed
    manual_pending = sum(1 for gate in plan.manual_gates if gate.status == "PENDING")
    automated_ok = failed == 0
    return {
        "schemaVersion": "scratchai-vsle-ev3-final-acceptance-v1",
        "automatedOk": automated_ok,
        "classroomApproved": automated_ok and manual_pending == 0,
        "passed": passed,
        "failed": failed,
        "manualPending": manual_pending,
        "results": result_list,
        "manualGates": [
            {
                "id": gate.id,
                "label": gate.label,
                "status": gate.status,
                "requirement": gate.requirement,
                "evidence": gate.evidence,
                "nextAction": gate.next_action,
            }
            for gate in plan.manual_gates
        ],
    }


def render_markdown_report(
    plan: AcceptancePlan,
    results: Iterable[Dict[str, object]],
) -> str:
    """Render a Markdown final acceptance report."""

    result_list = list(results)
    summary = acceptance_summary(plan, result_list)
    lines = [
        "# ScratchAI VSLE-EV3 Final Acceptance",
        "",
        "Date: 2026-05-23",
        "",
        "This report covers the ScratchAI-centered automated acceptance pass.",
        "The platform is not classroom-approved until real EV3 hardware rehearsal evidence is attached.",
        "",
        "## Summary",
        "",
        f"- Automated gates passed: {summary['passed']}",
        f"- Automated gates failed: {summary['failed']}",
        f"- Manual hardware gates pending: {summary['manualPending']}",
        f"- Classroom approved: {str(summary['classroomApproved']).lower()}",
        "",
        "## Automated Gates",
        "",
        "| Gate | Status | Evidence |",
        "|---|---|---|",
    ]
    for result in result_list:
        status = "PASS" if result.get("ok") is True else "FAIL"
        lines.append(f"| {result['id']} | {status} | {result['evidence']} |")
    lines.extend(
        [
            "",
            "## Manual Hardware Gates",
            "",
            "| Gate | Status | Next action |",
            "|---|---|---|",
        ]
    )
    for gate in plan.manual_gates:
        lines.append(f"| {gate.id} | {gate.status} | {gate.next_action} |")
    lines.extend(
        [
            "",
            "## Notes",
            "",
            "- Automated localhost tests do not replace Section 13.7 real EV3 classroom rehearsal.",
            "- A pilot release decision must attach hardware evidence for connection, motor, sensor, AI Quest collection, and multi-device rehearsal.",
            "",
        ]
    )
    return "\n".join(lines)


def write_reports(
    *,
    json_path: Optional[Path],
    markdown_path: Optional[Path],
    plan: AcceptancePlan,
    results: List[Dict[str, object]],
) -> None:
    """Write optional JSON and Markdown final acceptance reports."""

    if json_path is not None:
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(
            json.dumps(
                acceptance_summary(plan, results),
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
    if markdown_path is not None:
        markdown_path.parent.mkdir(parents=True, exist_ok=True)
        markdown_path.write_text(
            render_markdown_report(plan, results),
            encoding="utf-8",
        )


def command_summary(plan: AcceptancePlan) -> Dict[str, object]:
    """Return a JSON-ready representation of the final acceptance plan."""

    return {
        "gates": [
            {
                "id": gate.id,
                "label": gate.label,
                "requirement": gate.requirement,
                "evidence": gate.evidence,
                "command": list(gate.command),
                "cwd": str(gate.cwd),
                "kind": gate.kind,
                "timeoutSeconds": gate.timeout_seconds,
            }
            for gate in plan.gates
        ],
        "manualGates": [
            {
                "id": gate.id,
                "label": gate.label,
                "status": gate.status,
                "requirement": gate.requirement,
                "evidence": gate.evidence,
                "nextAction": gate.next_action,
            }
            for gate in plan.manual_gates
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run ScratchAI VSLE-EV3 final automated acceptance gates."
    )
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--include-runtime-preview", action="store_true")
    parser.add_argument("--print-plan", action="store_true")
    parser.add_argument("--json-report", type=Path)
    parser.add_argument("--markdown-report", type=Path)
    parser.add_argument("--require-classroom-approval", action="store_true")
    args = parser.parse_args()

    plan = build_acceptance_plan(
        root=args.root,
        include_runtime_preview=args.include_runtime_preview,
    )
    if args.print_plan:
        print(json.dumps(command_summary(plan), indent=2, sort_keys=True))
        return 0

    results = run_acceptance_plan(plan)
    summary = acceptance_summary(plan, results)
    write_reports(
        json_path=args.json_report,
        markdown_path=args.markdown_report,
        plan=plan,
        results=results,
    )
    print(json.dumps(summary, indent=2, sort_keys=True))
    if not summary["automatedOk"]:
        return 1
    if args.require_classroom_approval and not summary["classroomApproved"]:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
