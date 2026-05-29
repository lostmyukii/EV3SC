#!/usr/bin/env python3
"""Apply accepted VSLE Bluetooth install evidence to classroom smoke JSON."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.run_desktop_install_smoke import (
    _load_evidence as load_install_evidence,
    _load_release_manifest,
    _resolve_manifest_path,
    _validate_evidence as validate_install_evidence,
)
from scripts.run_vsle_bluetooth_smoke import (
    REQUIRED_GROUPS,
    load_evidence as load_classroom_evidence,
)


def validate_classroom_without_release(payload: dict[str, Any]) -> list[str]:
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

    groups = payload.get("command_groups", {})
    if not isinstance(groups, dict):
        errors.append("command_groups must be an object")
        groups = {}
    for group in REQUIRED_GROUPS:
        if groups.get(group) is not True:
            errors.append(f"command_groups.{group} must be true")
    return errors


def _release_platform(
    install: dict[str, Any], install_path: Path
) -> tuple[str, list[str]]:
    manifest_ref = install.get("release_artifact_manifest")
    if not isinstance(manifest_ref, str):
        return "unknown", ["release_artifact_manifest must be a string"]

    manifest_path = _resolve_manifest_path(manifest_ref, install_path)
    if manifest_path is None:
        return "unknown", ["release_artifact_manifest is missing"]

    manifest, errors = _load_release_manifest(manifest_path)
    if errors:
        return "unknown", errors

    target = manifest.get("target")
    return str(target) if isinstance(target, str) else "unknown", []


def write_report(
    path: Path,
    *,
    applied: bool,
    install_path: Path,
    classroom_path: Path,
    output_path: Path,
    errors: list[str],
    platform: str,
) -> None:
    lines = [
        "# VSLE Bluetooth Release Evidence Bridge",
        "",
        f"Install evidence: `{install_path}`",
        f"Classroom evidence: `{classroom_path}`",
        f"Output evidence: `{output_path}`",
        f"Release evidence applied: {'yes' if applied else 'no'}",
        f"Mode: `vsle-bluetooth`",
        f"Platform: `{platform}`",
        "",
    ]
    if errors:
        lines.extend(["## Blocking Items", ""])
        lines.extend(f"- {error}" for error in errors)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--install-evidence", type=Path, required=True)
    parser.add_argument("--classroom-evidence", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    errors: list[str] = []
    install, install_load_errors = load_install_evidence(args.install_evidence)
    if install is None:
        install = {}
    errors.extend(install_load_errors)
    if not install_load_errors:
        errors.extend(
            validate_install_evidence(install, "vsle-bluetooth", args.install_evidence)
        )

    classroom, classroom_load_errors = load_classroom_evidence(args.classroom_evidence)
    errors.extend(classroom_load_errors)
    if not classroom_load_errors:
        errors.extend(validate_classroom_without_release(classroom))

    platform, platform_errors = _release_platform(install, args.install_evidence)
    if not install_load_errors:
        errors.extend(platform_errors)

    if errors:
        write_report(
            args.report,
            applied=False,
            install_path=args.install_evidence,
            classroom_path=args.classroom_evidence,
            output_path=args.output,
            errors=errors,
            platform=platform,
        )
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    merged = dict(classroom)
    merged["installed_from_release_artifact"] = True
    merged["release_artifact_evidence"] = {
        "mode": "vsle-bluetooth",
        "platform": platform,
        "install_evidence": str(args.install_evidence),
        "release_artifact_manifest": install["release_artifact_manifest"],
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(merged, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    write_report(
        args.report,
        applied=True,
        install_path=args.install_evidence,
        classroom_path=args.classroom_evidence,
        output_path=args.output,
        errors=[],
        platform=platform,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
