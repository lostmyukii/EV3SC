#!/usr/bin/env python3
"""Validate real EV3 sensor and motor port matrix evidence."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


SENSOR_PORTS = ("S1", "S2", "S3", "S4")
MOTOR_PORTS = ("A", "B", "C", "D")
SENSOR_REQUIRED_FIELDS = {
    "touch": ("pressed",),
    "color": ("color",),
    "ultrasonic": ("distance_cm",),
    "gyro": ("angle",),
    "infrared": ("distance",),
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


def validate_matrix(payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if payload.get("evidence_kind") != "vsle_bluetooth_sensor_port_matrix":
        errors.append("evidence_kind must be vsle_bluetooth_sensor_port_matrix")
    if payload.get("transport") != "vsle-bluetooth":
        errors.append("transport must be vsle-bluetooth")
    if payload.get("real_ev3_full_bluetooth_ok") is not True:
        errors.append("real_ev3_full_bluetooth_ok must be true")

    runs = payload.get("runs")
    if not isinstance(runs, list) or not runs:
        errors.append("runs must contain at least one observed hardware run")
        return errors

    for index, run in enumerate(runs):
        if not isinstance(run, dict):
            errors.append(f"runs[{index}] must be an object")
            continue
        _validate_run(run, index, errors)
    return errors


def _validate_run(
    run: dict[str, Any],
    index: int,
    errors: list[str],
) -> None:
    run_id = run.get("id")
    if not isinstance(run_id, str) or not run_id:
        errors.append(f"runs[{index}].id must be a non-empty string")

    updates = run.get("sensor_updates_observed")
    if not isinstance(updates, int) or updates <= 0:
        errors.append(f"runs[{index}].sensor_updates_observed must be > 0")

    freshness = run.get("sensor_freshness_ms_max")
    if not isinstance(freshness, (int, float)):
        errors.append(f"runs[{index}].sensor_freshness_ms_max must be measured")

    sensors = run.get("sensors", {})
    motors = run.get("motors", {})
    if not isinstance(sensors, dict):
        errors.append(f"runs[{index}].sensors must be an object")
        sensors = {}
    if not isinstance(motors, dict):
        errors.append(f"runs[{index}].motors must be an object")
        motors = {}
    if not sensors and not motors:
        errors.append(f"runs[{index}] must include sensors or motors")

    for port, sensor in sensors.items():
        _validate_sensor(port, sensor, index, errors)
    for port, motor in motors.items():
        _validate_motor(port, motor, index, errors)


def _validate_sensor(
    port: str,
    sensor: Any,
    index: int,
    errors: list[str],
) -> None:
    path = f"runs[{index}].sensors.{port}"
    if port not in SENSOR_PORTS:
        errors.append(f"{path} must use S1-S4")
    if not isinstance(sensor, dict):
        errors.append(f"{path} must be an object")
        return

    expected = sensor.get("expected_type")
    observed = sensor.get("observed_type")
    if expected not in SENSOR_REQUIRED_FIELDS:
        errors.append(f"{path}.expected_type is unsupported")
    if observed != expected:
        errors.append(f"{path}.observed_type must be {expected}")

    latest = sensor.get("latest")
    if not isinstance(latest, dict):
        errors.append(f"{path}.latest must be an object")
        return
    if latest.get("type") != observed:
        errors.append(f"{path}.latest.type must be {observed}")

    for field in SENSOR_REQUIRED_FIELDS.get(str(expected), ()):
        if field not in latest:
            errors.append(f"{path}.latest.{field} is required")


def _validate_motor(
    port: str,
    motor: Any,
    index: int,
    errors: list[str],
) -> None:
    path = f"runs[{index}].motors.{port}"
    if port not in MOTOR_PORTS:
        errors.append(f"{path} must use A-D")
    if not isinstance(motor, dict):
        errors.append(f"{path} must be an object")
        return
    if motor.get("observed") is not True:
        errors.append(f"{path}.observed must be true")

    latest = motor.get("latest")
    if not isinstance(latest, dict):
        errors.append(f"{path}.latest must be an object")
        return
    for field in ("position", "speed", "running"):
        if field not in latest:
            errors.append(f"{path}.latest.{field} is required")


def write_report(
    report: Path,
    payload: dict[str, Any],
    errors: list[str],
) -> None:
    runs = payload.get("runs", [])
    if not isinstance(runs, list):
        runs = []
    covered_sensors = _covered_sensors(runs)
    covered_motors = _covered_motors(runs)
    untested_sensors = [port for port in SENSOR_PORTS if port not in covered_sensors]
    untested_motors = [port for port in MOTOR_PORTS if port not in covered_motors]

    lines = [
        "# VSLE Bluetooth Sensor Port Matrix Report",
        "",
        f"Sensor port matrix ready: {'yes' if not errors else 'no'}",
        f"Transport: {payload.get('transport', 'not recorded')}",
        f"Runs observed: {len(runs)}",
        "",
    ]
    if errors:
        lines.append("## Blocking Items")
        lines.extend(f"- {error}" for error in errors)
        lines.append("")

    lines.extend(
        [
            "## Sensor Coverage",
            "| Port | Type | Run | Updates | Max Freshness |",
            "|---|---|---|---:|---:|",
        ]
    )
    if covered_sensors:
        for port in SENSOR_PORTS:
            for row in covered_sensors.get(port, []):
                lines.append(
                    "| {port} | {kind} | {run} | {updates} | {freshness} |".format(
                        port=port,
                        kind=row["kind"],
                        run=row["run"],
                        updates=row["updates"],
                        freshness=row["freshness"],
                    )
                )
    else:
        lines.append("| none | none | none | 0 | not recorded |")
    lines.append("")
    lines.append(
        "Untested sensor ports: "
        + (", ".join(untested_sensors) if untested_sensors else "none")
    )
    lines.append("")

    lines.extend(
        [
            "## Motor Coverage",
            "| Port | Status | Run |",
            "|---|---|---|",
        ]
    )
    if covered_motors:
        for port in MOTOR_PORTS:
            for run_id in covered_motors.get(port, []):
                lines.append(f"| {port} | observed | {run_id} |")
    else:
        lines.append("| none | not observed | none |")
    lines.append("")
    lines.append(
        "Untested motor ports: "
        + (", ".join(untested_motors) if untested_motors else "none")
    )
    lines.append("")

    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text("\n".join(lines), encoding="utf-8")


def _covered_sensors(runs: list[Any]) -> dict[str, list[dict[str, str]]]:
    covered: dict[str, list[dict[str, str]]] = {}
    for run in runs:
        if not isinstance(run, dict):
            continue
        run_id = str(run.get("id", "unnamed"))
        updates = str(run.get("sensor_updates_observed", "not recorded"))
        freshness = _format_ms(run.get("sensor_freshness_ms_max"))
        sensors = run.get("sensors", {})
        if not isinstance(sensors, dict):
            continue
        for port, sensor in sensors.items():
            if not isinstance(sensor, dict):
                continue
            covered.setdefault(str(port), []).append(
                {
                    "kind": str(sensor.get("observed_type", "unknown")),
                    "run": run_id,
                    "updates": updates,
                    "freshness": freshness,
                }
            )
    return covered


def _covered_motors(runs: list[Any]) -> dict[str, list[str]]:
    covered: dict[str, list[str]] = {}
    for run in runs:
        if not isinstance(run, dict):
            continue
        run_id = str(run.get("id", "unnamed"))
        motors = run.get("motors", {})
        if not isinstance(motors, dict):
            continue
        for port, motor in motors.items():
            if isinstance(motor, dict) and motor.get("observed") is True:
                covered.setdefault(str(port), []).append(run_id)
    return covered


def _format_ms(value: Any) -> str:
    if isinstance(value, (int, float)):
        return f"{value:.3f}ms".rstrip("0").rstrip(".")
    return "not recorded"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    payload, load_errors = load_evidence(args.evidence)
    errors = load_errors or validate_matrix(payload)
    write_report(args.report, payload, errors)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
