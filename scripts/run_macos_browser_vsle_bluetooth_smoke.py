#!/usr/bin/env python3
"""Validate Mac browser full VSLE Bluetooth smoke evidence.

This gate verifies the functional no-Windows path:

ScratchAI browser -> WeisileLink Desktop -> vsle-bluetooth -> ev3dev EV3 server

It intentionally does not approve classroom release readiness. Signed
release-artifact evidence, notarized macOS install evidence, and Windows
evidence remain separate gates.
"""

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


def validate_browser_evidence(payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    state = payload.get("post_load_state", {})
    if not isinstance(state, dict):
        errors.append("browser post_load_state must be an object")
        state = {}

    if payload.get("pass") is not True:
        errors.append("browser evidence pass must be true")
    if state.get("extensionResourceLoadedAsScript") is not True:
        errors.append("browser extension must load as a main-thread script")
    if state.get("extensionWorkerResourceLoaded") is not False:
        errors.append(
            "browser extension must not load through extension-worker"
        )

    script_tags = state.get("extensionScriptTags", [])
    if not isinstance(script_tags, list) or not any(
        "vsle-ev3-extension/index.js" in str(tag) for tag in script_tags
    ):
        errors.append(
            "browser evidence must include the VSLE-EV3 extension URL"
        )
    return errors


def validate_bluetooth_evidence(payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    required_true = (
        "ev3_runs_ev3dev_server",
        "real_ev3_full_bluetooth_ok",
        "disconnect_stop_ok",
        "scratch_unsandboxed_loaded",
    )
    for key in required_true:
        if payload.get(key) is not True:
            errors.append(f"{key} must be true")

    if payload.get("transport") != "vsle-bluetooth":
        errors.append("transport must be vsle-bluetooth")

    freshness = payload.get("sensor_freshness_ms_max")
    if not isinstance(freshness, (int, float)):
        errors.append("sensor_freshness_ms_max must be measured")

    updates = payload.get("sensor_updates_observed")
    if not isinstance(updates, int) or updates <= 0:
        errors.append("sensor_updates_observed must be greater than 0")

    groups = payload.get("command_groups", {})
    if not isinstance(groups, dict):
        groups = {}
        errors.append("command_groups must be an object")
    for group in REQUIRED_GROUPS:
        if groups.get(group) is not True:
            errors.append(f"command_groups.{group} must be true")
    return errors


def _format_metric(value: Any, unit: str) -> str:
    if isinstance(value, (int, float)):
        number = f"{value:.3f}".rstrip("0").rstrip(".")
        return f"{number}{unit}"
    return "not recorded"


def write_report(
    report: Path,
    *,
    browser_errors: list[str],
    bluetooth_errors: list[str],
    browser: dict[str, Any],
    bluetooth: dict[str, Any],
) -> None:
    validated = not browser_errors and not bluetooth_errors
    release_ready = bluetooth.get("installed_from_release_artifact") is True
    high_speed_ready = (
        isinstance(bluetooth.get("sensor_freshness_ms_max"), (int, float))
        and bluetooth["sensor_freshness_ms_max"] <= 25
    )
    classroom_ready = validated and release_ready and high_speed_ready
    max_freshness = _format_metric(
        bluetooth.get("sensor_freshness_ms_max"), "ms"
    )
    avg_freshness = _format_metric(
        bluetooth.get("sensor_freshness_ms_avg_observed"), "ms"
    )
    p95_freshness = _format_metric(
        bluetooth.get("sensor_freshness_ms_p95_observed"), "ms"
    )

    lines = [
        "# Mac Browser Full VSLE Bluetooth Smoke Report",
        "",
        "Path: ScratchAI browser -> WeisileLink Desktop -> "
        "vsle-bluetooth -> ev3dev EV3 server",
        "",
        (
            "Server-side Scratch EV3 module path validated: "
            f"{'yes' if validated else 'no'}"
        ),
        f"Classroom ready: {'yes' if classroom_ready else 'no'}",
        f"Release-artifact evidence ready: {'yes' if release_ready else 'no'}",
        (
            "Bluetooth high-speed 50Hz ready: "
            f"{'yes' if high_speed_ready else 'no'}"
        ),
        "Windows evidence ready: no",
        "",
        (
            "This Mac browser smoke validates the functional server-side "
            "Scratch EV3 module path only. It does not replace signed "
            "release-artifact evidence, macOS notarized install evidence, "
            "or separate Windows evidence."
        ),
        (
            "The browser must use local WeisileLink JSON-RPC and must not use "
            "direct browser Bluetooth."
        ),
        "",
    ]

    if browser_errors:
        lines.append("## Browser Blocking Items")
        lines.extend(f"- {error}" for error in browser_errors)
        lines.append("")
    if bluetooth_errors:
        lines.append("## Bluetooth Blocking Items")
        lines.extend(f"- {error}" for error in bluetooth_errors)
        lines.append("")

    lines.extend(
        [
            "## Evidence Summary",
            f"- Browser pass: {'yes' if browser.get('pass') is True else 'no'}",
            f"- Transport: {bluetooth.get('transport', 'not recorded')}",
            f"- Max freshness gap: {max_freshness}",
            f"- Average freshness gap: {avg_freshness}",
            f"- P95 freshness gap: {p95_freshness}",
            (
                "- Sensor updates observed: "
                f"{bluetooth.get('sensor_updates_observed', 'not recorded')}"
            ),
        ]
    )

    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--browser-evidence", type=Path, required=True)
    parser.add_argument("--bluetooth-evidence", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    browser, browser_load_errors = load_evidence(args.browser_evidence)
    bluetooth, bluetooth_load_errors = load_evidence(args.bluetooth_evidence)

    browser_errors = browser_load_errors or validate_browser_evidence(browser)
    bluetooth_errors = bluetooth_load_errors or validate_bluetooth_evidence(
        bluetooth
    )
    write_report(
        args.report,
        browser_errors=browser_errors,
        bluetooth_errors=bluetooth_errors,
        browser=browser,
        bluetooth=bluetooth,
    )
    return 1 if browser_errors or bluetooth_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
