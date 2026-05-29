#!/usr/bin/env python3
"""Validate real full VSLE Bluetooth smoke evidence."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


REQUIRED_TRUE = (
    "installed_from_release_artifact",
    "ev3_runs_ev3dev_server",
    "real_ev3_full_bluetooth_ok",
    "disconnect_stop_ok",
    "scratch_unsandboxed_loaded",
)
REQUIRED_GROUPS = (
    "motor",
    "sensor",
    "sound",
    "display",
    "system",
    "data_collection",
    "ai_quest",
)


def validate_evidence(payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for key in REQUIRED_TRUE:
        if payload.get(key) is not True:
            errors.append(f"{key} must be true")
    if payload.get("transport") != "vsle-bluetooth":
        errors.append("transport must be vsle-bluetooth")
    if payload.get("sensor_freshness_ms_max", 999999) > 25:
        errors.append("sensor_freshness_ms_max must be <= 25")
    groups = payload.get("command_groups", {})
    for group in REQUIRED_GROUPS:
        if groups.get(group) is not True:
            errors.append(f"command_groups.{group} must be true")
    return errors


def is_diagnostic_fallback(payload: dict[str, Any], errors: list[str]) -> bool:
    groups = payload.get("command_groups", {})
    command_groups_ok = all(groups.get(group) is True for group in REQUIRED_GROUPS)
    freshness_blocked = "sensor_freshness_ms_max must be <= 25" in errors
    return (
        payload.get("transport") == "vsle-bluetooth"
        and payload.get("ev3_runs_ev3dev_server") is True
        and payload.get("real_ev3_full_bluetooth_ok") is True
        and command_groups_ok
        and freshness_blocked
    )


def write_report(
    report: Path, errors: list[str], payload: dict[str, Any] | None = None
) -> None:
    payload = payload or {}
    ready = not errors
    lines = [
        "# VSLE Bluetooth Full Module Smoke Report",
        "",
        f"Classroom ready: {'yes' if ready else 'no'}",
        "",
    ]
    if errors:
        lines.append("## Blocking Items")
        lines.extend(f"- {error}" for error in errors)
        lines.append("")
    if is_diagnostic_fallback(payload, errors):
        lines.extend(
            [
                "## Mode Decision",
                "Diagnostic fallback: yes",
                "WiFi Full VSLE remains the classroom 50Hz path.",
                (
                    "Full VSLE Bluetooth is retained only for non-classroom "
                    "diagnostics or fallback on this evidence until a redesigned "
                    "Bluetooth path or new real-EV3 evidence satisfies the 25ms "
                    "freshness gate."
                ),
                "",
            ]
        )
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text("\n".join(lines), encoding="utf-8")


def load_evidence(path: Path) -> tuple[dict[str, Any], list[str]]:
    if not path.is_file():
        return {}, [f"evidence file not found: {path}"]
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {}, [f"evidence JSON is invalid: {exc.msg}"]
    if not isinstance(payload, dict):
        return {}, ["evidence JSON must be an object"]
    return payload, []


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    payload, errors = load_evidence(args.evidence)
    if not errors:
        errors = validate_evidence(payload)
    write_report(args.report, errors, payload)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
