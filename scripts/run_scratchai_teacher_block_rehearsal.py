#!/usr/bin/env python3
"""Validate ScratchAI browser-guided EV3 block rehearsal evidence."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


REQUIRED_GROUPS = (
    "motor",
    "sensor",
    "sound",
    "display",
    "system",
    "data_collection",
    "ai_quest",
)

CONNECTED_STATE_SOURCES = {
    "weisilelink_health_and_sensor_freshness",
    "weisilelink_health",
}


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


def _require_true(payload: dict[str, Any], key: str) -> list[str]:
    if payload.get(key) is not True:
        return [f"{key} must be true"]
    return []


def _require_false(payload: dict[str, Any], key: str) -> list[str]:
    if payload.get(key) is not False:
        return [f"{key} must be false"]
    return []


def validate_evidence(payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for key in (
        "scratch_unsandboxed_loaded",
        "extension_loaded_as_main_thread_script",
        "connection_state_visible",
        "real_ev3_project_used",
        "ev3_runs_ev3dev_server",
        "disconnect_stop_ok",
    ):
        errors.extend(_require_true(payload, key))

    for key in (
        "scratch_visual_design_changed",
        "extension_worker_loaded",
        "used_browser_direct_bluetooth",
    ):
        errors.extend(_require_false(payload, key))

    if payload.get("used_browser_direct_bluetooth") is not False:
        errors.append("browser must stay on local WeisileLink JSON-RPC")

    if payload.get("selected_transport") != "vsle-bluetooth":
        errors.append("selected_transport must be vsle-bluetooth")
    if payload.get("transport_capability") != "full":
        errors.append("transport_capability must be full")
    if payload.get("selected_transport_label") != "Bluetooth Full VSLE":
        errors.append("selected_transport_label must be Bluetooth Full VSLE")

    endpoint = payload.get("weisilelink_endpoint")
    if endpoint not in {
        "ws://127.0.0.1:20111/scratch/bt",
        "ws://localhost:20111/scratch/bt",
    }:
        errors.append("weisilelink_endpoint must be local Scratch Link JSON-RPC")

    if payload.get("connected_state_source") not in CONNECTED_STATE_SOURCES:
        errors.append(
            "connected_state_source must use WeisileLink health " "and sensor freshness"
        )

    if payload.get("command_source") != "scratch_blocks":
        errors.append("command_source must be scratch_blocks")

    freshness = payload.get("sensor_freshness_ms_max")
    if not isinstance(freshness, (int, float)):
        errors.append("sensor_freshness_ms_max must be measured")
    updates = payload.get("sensor_updates_observed")
    if not isinstance(updates, int) or updates <= 0:
        errors.append("sensor_updates_observed must be greater than 0")

    groups = payload.get("block_groups_exercised", {})
    if not isinstance(groups, dict):
        errors.append("block_groups_exercised must be an object")
        groups = {}
    for group in REQUIRED_GROUPS:
        exercised = groups.get(group)
        if not isinstance(exercised, list) or not exercised:
            errors.append(
                f"block_groups_exercised.{group} must list at least one block"
            )
        elif not all(isinstance(item, str) and item.strip() for item in exercised):
            errors.append(f"block_groups_exercised.{group} must contain block names")

    return errors


def _yes_no(value: bool) -> str:
    return "yes" if value else "no"


def _format_metric(value: Any, unit: str) -> str:
    if isinstance(value, (int, float)):
        number = f"{value:.3f}".rstrip("0").rstrip(".")
        return f"{number}{unit}"
    return "not recorded"


def _format_text(value: Any) -> str:
    if isinstance(value, str) and value.strip():
        return value
    return "not recorded"


def write_report(
    report: Path,
    *,
    errors: list[str],
    payload: dict[str, Any],
) -> None:
    passed = not errors
    release_ready = (
        payload.get("installed_from_release_artifact") is True
        and payload.get("windows_evidence_ready") is True
    )
    groups = payload.get("block_groups_exercised", {})
    if not isinstance(groups, dict):
        groups = {}

    lines = [
        "# ScratchAI Teacher Block Rehearsal",
        "",
        f"Teacher-facing Scratch block rehearsal: {_yes_no(passed)}",
        f"Classroom release ready: {_yes_no(passed and release_ready)}",
        f"Transport: {payload.get('selected_transport', 'not recorded')}",
        (
            "Transport capability: "
            f"{payload.get('transport_capability', 'not recorded')}"
        ),
        (
            "Browser direct Bluetooth used: "
            f"{_yes_no(payload.get('used_browser_direct_bluetooth') is True)}"
        ),
        (
            "Scratch visual design changed: "
            f"{_yes_no(payload.get('scratch_visual_design_changed') is True)}"
        ),
        (
            "Connected-state source: "
            f"{_format_text(payload.get('connected_state_source'))}"
        ),
        (
            "Max freshness gap: "
            f"{_format_metric(payload.get('sensor_freshness_ms_max'), 'ms')}"
        ),
        (
            "Sensor updates observed: "
            f"{payload.get('sensor_updates_observed', 'not recorded')}"
        ),
        "",
        (
            "This gate verifies the teacher-facing browser workflow only. "
            "It does not replace signed release-artifact evidence, Windows "
            "evidence, or the long Section 13.7 classroom rehearsal."
        ),
        "",
    ]

    if errors:
        lines.append("## Blocking Items")
        lines.extend(f"- {error}" for error in errors)
        lines.append("")

    lines.append("## Module Blocks Exercised")
    for group in REQUIRED_GROUPS:
        exercised = groups.get(group)
        if isinstance(exercised, list) and exercised:
            value = ", ".join(str(item) for item in exercised)
        else:
            value = "not recorded"
        lines.append(f"- {group}: {value}")

    lines.extend(
        [
            "",
            "## Evidence",
            f"- Browser URL: {_format_text(payload.get('browser_url'))}",
            (
                "- WeisileLink endpoint: "
                f"{_format_text(payload.get('weisilelink_endpoint'))}"
            ),
            f"- Command source: {_format_text(payload.get('command_source'))}",
            f"- Notes: {_format_text(payload.get('notes'))}",
        ]
    )

    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    payload, load_errors = load_evidence(args.evidence)
    errors = load_errors or validate_evidence(payload)
    write_report(args.report, errors=errors, payload=payload)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
