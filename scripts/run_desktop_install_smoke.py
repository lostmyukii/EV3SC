#!/usr/bin/env python3
"""Validate clean-machine desktop install smoke evidence.

This gate is intentionally evidence-driven. A localhost-only developer run is
not enough to mark macOS/Windows desktop support or official firmware Bluetooth
compatibility classroom ready.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple


COMMON_REQUIRED_TRUE_FIELDS = (
    "installed_from_release_artifact",
    "started_after_reboot",
    "scratch_link_endpoint_ok",
)
MODE_REQUIRED_TRUE_FIELDS = {
    "official-bluetooth": ("official_firmware_bt_real_ev3_ok",),
    "vsle-bluetooth": ("vsle_bluetooth_real_ev3_ok",),
}

BLOCKING_TRUE_FIELDS = {
    "developer_checkout_run": (
        "localhost-only developer runs cannot approve release support"
    ),
    "localhost_only_developer_run": (
        "localhost-only developer runs cannot approve release support"
    ),
}


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate WeisileLink Desktop install smoke evidence."
    )
    parser.add_argument("--evidence", required=True, help="Evidence JSON path")
    parser.add_argument("--report", required=True, help="Markdown report path")
    parser.add_argument(
        "--mode",
        choices=sorted(MODE_REQUIRED_TRUE_FIELDS),
        default="official-bluetooth",
        help="Desktop release mode to validate.",
    )
    args = parser.parse_args(argv)

    evidence_path = Path(args.evidence)
    report_path = Path(args.report)
    evidence, load_errors = _load_evidence(evidence_path)
    failures = list(load_errors)

    if evidence is not None:
        failures.extend(_validate_evidence(evidence, args.mode))

    ready = not failures
    _write_report(
        report_path,
        evidence_path,
        evidence or {},
        failures,
        ready,
        args.mode,
    )

    if ready:
        print(f"desktop install smoke ok: {report_path}")
        return 0

    for failure in failures:
        print(failure, file=sys.stderr)
    return 1


def _load_evidence(path: Path) -> Tuple[Dict[str, Any] | None, List[str]]:
    if not path.is_file():
        return None, ["evidence file is missing"]

    try:
        decoded = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return None, [f"evidence JSON is invalid: {exc.msg}"]

    if not isinstance(decoded, dict):
        return None, ["evidence JSON must be an object"]

    return decoded, []


def _validate_evidence(evidence: Dict[str, Any], mode: str) -> List[str]:
    failures: List[str] = []

    for field in (*COMMON_REQUIRED_TRUE_FIELDS, *MODE_REQUIRED_TRUE_FIELDS[mode]):
        if evidence.get(field) is not True:
            failures.append(f"{field} must be true")

    for field, message in BLOCKING_TRUE_FIELDS.items():
        if evidence.get(field) is True:
            failures.append(f"{field}: {message}")

    return failures


def _write_report(
    path: Path,
    evidence_path: Path,
    evidence: Dict[str, Any],
    failures: List[str],
    ready: bool,
    mode: str,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# WeisileLink Desktop Install Smoke Report",
        "",
        f"Evidence: `{evidence_path}`",
        f"Mode: `{mode}`",
        f"Classroom ready: {'yes' if ready else 'no'}",
        "",
        "## Required Checks",
        "",
    ]

    for field in (*COMMON_REQUIRED_TRUE_FIELDS, *MODE_REQUIRED_TRUE_FIELDS[mode]):
        status = "pass" if evidence.get(field) is True else "fail"
        lines.append(f"- {field}: {status}")

    blocking_lines = [
        f"- {field}: {message}"
        for field, message in BLOCKING_TRUE_FIELDS.items()
        if evidence.get(field) is True
    ]
    if blocking_lines:
        lines.extend(["", "## Blocking Developer-Run Flags", ""])
        lines.extend(blocking_lines)

    if failures:
        lines.extend(["", "## Failures", ""])
        lines.extend(f"- {failure}" for failure in failures)

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
