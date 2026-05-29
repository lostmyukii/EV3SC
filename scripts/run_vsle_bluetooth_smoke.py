#!/usr/bin/env python3
"""Validate real full VSLE Bluetooth smoke evidence."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


BASELINE_REQUIRED_TRUE = (
    "ev3_runs_ev3dev_server",
    "real_ev3_full_bluetooth_ok",
    "disconnect_stop_ok",
    "scratch_unsandboxed_loaded",
)
SELF_USE_REQUIRED_TRUE = BASELINE_REQUIRED_TRUE
REQUIRED_GROUPS = (
    "motor",
    "sensor",
    "sound",
    "display",
    "system",
    "data_collection",
    "ai_quest",
)


def validate_baseline_evidence(payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for key in BASELINE_REQUIRED_TRUE:
        if payload.get(key) is not True:
            errors.append(f"{key} must be true")
    errors.extend(_validate_common_full_module_evidence(payload))
    return errors


def validate_self_use_unsigned_evidence(payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for key in SELF_USE_REQUIRED_TRUE:
        if payload.get(key) is not True:
            errors.append(f"{key} must be true")
    errors.extend(_validate_common_full_module_evidence(payload))
    return errors


def _validate_common_full_module_evidence(payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if payload.get("transport") != "vsle-bluetooth":
        errors.append("transport must be vsle-bluetooth")
    freshness = payload.get("sensor_freshness_ms_max")
    if not isinstance(freshness, (int, float)):
        errors.append("sensor_freshness_ms_max must be measured")
    groups = payload.get("command_groups", {})
    for group in REQUIRED_GROUPS:
        if groups.get(group) is not True:
            errors.append(f"command_groups.{group} must be true")
    return errors


def validate_high_speed_evidence(
    payload: dict[str, Any], baseline_errors: list[str]
) -> list[str]:
    errors: list[str] = []
    if baseline_errors:
        errors.append("Bluetooth classroom baseline must pass first")
    freshness = payload.get("sensor_freshness_ms_max", 999999)
    if not isinstance(freshness, (int, float)) or freshness > 25:
        errors.append("sensor_freshness_ms_max must be <= 25")
    return errors


def _format_metric(value: Any, unit: str) -> str:
    if isinstance(value, (int, float)):
        return f"{value:.3f}{unit}".rstrip("0").rstrip(".")
    return "not recorded"


def _sampling_lines(payload: dict[str, Any]) -> list[str]:
    max_ms = payload.get("sensor_freshness_ms_max")
    avg_ms = payload.get("sensor_freshness_ms_avg_observed")
    p95_ms = payload.get("sensor_freshness_ms_p95_observed")
    updates = payload.get("sensor_updates_observed")
    lines = [
        "## Measured Bluetooth sampling",
        f"- Max freshness gap: {_format_metric(max_ms, 'ms')}",
        f"- Average freshness gap: {_format_metric(avg_ms, 'ms')}",
        f"- P95 freshness gap: {_format_metric(p95_ms, 'ms')}",
        (
            "- Sensor updates observed: "
            f"{updates if isinstance(updates, int) else 'not recorded'}"
        ),
    ]
    if isinstance(avg_ms, (int, float)) and avg_ms > 0:
        lines.append(f"- Estimated average sample rate: {1000 / avg_ms:.2f} Hz")
    return lines


def write_report(
    report: Path,
    baseline_errors: list[str],
    high_speed_errors: list[str],
    self_use_errors: list[str] | None = None,
    self_use_unsigned: bool = False,
    payload: dict[str, Any] | None = None,
) -> None:
    payload = payload or {}
    self_use_errors = (
        self_use_errors if self_use_errors is not None else baseline_errors
    )
    baseline_ready = not baseline_errors
    high_speed_ready = not high_speed_errors
    self_use_ready = not self_use_errors
    release_ready = payload.get("installed_from_release_artifact") is True
    lines = [
        "# VSLE Bluetooth Full Module Smoke Report",
        "",
        f"Self-use unsigned ready: {'yes' if self_use_ready else 'no'}",
        f"Classroom ready: {'yes' if baseline_ready else 'no'}",
        (
            "Bluetooth classroom baseline ready: "
            f"{'yes' if baseline_ready else 'no'}"
        ),
        (
            "Bluetooth high-speed 50Hz ready: "
            f"{'yes' if high_speed_ready else 'no'}"
        ),
        f"Release-artifact evidence ready: {'yes' if release_ready else 'no'}",
        "",
    ]
    if self_use_unsigned:
        lines.extend(
            [
                (
                    "Self-use unsigned validation is for local/internal "
                    "functional testing only and does not replace "
                    "signed/notarized release evidence."
                ),
                "",
            ]
        )
    if self_use_errors:
        lines.append("## Self-Use Unsigned Blocking Items")
        lines.extend(f"- {error}" for error in self_use_errors)
        lines.append("")
    if baseline_errors:
        lines.append("## Baseline Blocking Items")
        lines.extend(f"- {error}" for error in baseline_errors)
        lines.append("")
    if high_speed_errors:
        lines.append("## High-Speed 50Hz Blocking Items")
        lines.extend(f"- {error}" for error in high_speed_errors)
        lines.append("")
    if payload:
        lines.extend(_sampling_lines(payload))
        lines.append("")
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
    parser.add_argument(
        "--self-use-unsigned",
        action="store_true",
        help=(
            "Accept local/internal unsigned functional evidence without "
            "requiring signed release-artifact evidence."
        ),
    )
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    payload, errors = load_evidence(args.evidence)
    if errors:
        baseline_errors = errors
        self_use_errors = errors
    else:
        baseline_errors = validate_baseline_evidence(payload)
        self_use_errors = validate_self_use_unsigned_evidence(payload)
    high_speed_errors = validate_high_speed_evidence(payload, baseline_errors)
    write_report(
        args.report,
        baseline_errors,
        high_speed_errors,
        self_use_errors,
        args.self_use_unsigned,
        payload,
    )
    if args.self_use_unsigned:
        return 1 if self_use_errors else 0
    return 1 if baseline_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
