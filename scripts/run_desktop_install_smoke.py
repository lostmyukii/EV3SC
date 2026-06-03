#!/usr/bin/env python3
"""Validate clean-machine desktop install smoke evidence.

This gate is intentionally evidence-driven. A localhost-only developer run is
not enough to mark macOS/Windows desktop support or official firmware Bluetooth
compatibility classroom ready.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple


ROOT = Path(__file__).resolve().parents[1]
COMMON_REQUIRED_TRUE_FIELDS = (
    "installed_from_release_artifact",
    "started_after_reboot",
    "scratch_link_endpoint_ok",
    "desktop_diagnostics_export_ok",
    "desktop_diagnostics_redaction_ok",
)
MODE_REQUIRED_TRUE_FIELDS = {
    "official-bluetooth": ("official_firmware_bt_real_ev3_ok",),
    "vsle-bluetooth": (
        "vsle_bluetooth_real_ev3_ok",
        "vsle_bluetooth_sensor_ready",
    ),
}

BLOCKING_TRUE_FIELDS = {
    "developer_checkout_run": (
        "localhost-only developer runs cannot approve release support"
    ),
    "localhost_only_developer_run": (
        "localhost-only developer runs cannot approve release support"
    ),
}
DIAGNOSTICS_BUNDLE_FIELDS = (
    "desktop_diagnostics_bundle",
    "desktop_diagnostics_bundle_path",
)
BLUETOOTH_ADDRESS_RE = re.compile(r"\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b")
SECRET_ASSIGNMENT_RE = re.compile(
    r"\b(?:WEISILE_PAIRING_TOKEN|DEEPSEEK_API_KEY|SILICONFLOW_API_KEY|"
    r"OPENAI_API_KEY)=(?!<redacted>)[^\s\"']+"
)
FORBIDDEN_DIAGNOSTICS_MARKERS = ('"student_data":',)
SECRET_KEY_FRAGMENTS = ("TOKEN", "API_KEY", "SECRET", "PASSWORD")
REDACTED_VALUES = {"", "<redacted>", "<redacted-secret>"}


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
        failures.extend(_validate_evidence(evidence, args.mode, evidence_path))

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


def _validate_evidence(
    evidence: Dict[str, Any],
    mode: str,
    evidence_path: Path,
) -> List[str]:
    failures: List[str] = []

    for field in (*COMMON_REQUIRED_TRUE_FIELDS, *MODE_REQUIRED_TRUE_FIELDS[mode]):
        if evidence.get(field) is not True:
            failures.append(f"{field} must be true")

    if evidence.get("installed_from_release_artifact") is True:
        failures.extend(_validate_release_artifact_manifest(evidence, evidence_path))

    if (
        evidence.get("desktop_diagnostics_export_ok") is True
        or evidence.get("desktop_diagnostics_redaction_ok") is True
    ):
        failures.extend(_validate_diagnostics_evidence(evidence, evidence_path))

    for field, message in BLOCKING_TRUE_FIELDS.items():
        if evidence.get(field) is True:
            failures.append(f"{field}: {message}")

    return failures


def _validate_diagnostics_evidence(
    evidence: Dict[str, Any],
    evidence_path: Path,
) -> List[str]:
    bundle, _, errors = _load_diagnostics_bundle(evidence, evidence_path)
    if errors:
        return errors

    failures: List[str] = []
    if evidence.get("desktop_diagnostics_include_device_identifiers") is True:
        failures.append(
            "desktop_diagnostics_include_device_identifiers must not be true "
            "for redacted release evidence"
        )

    state = _diagnostics_state(bundle)
    if state != "ready":
        failures.append("desktop diagnostics bundle state must be ready")

    if not _diagnostics_check_ok(bundle, "ev3_ready_check"):
        failures.append("desktop diagnostics ev3_ready_check must pass")

    failures.extend(_validate_diagnostics_redaction(bundle))
    return failures


def _load_diagnostics_bundle(
    evidence: Dict[str, Any],
    evidence_path: Path,
) -> Tuple[Dict[str, Any], str, List[str]]:
    for field in DIAGNOSTICS_BUNDLE_FIELDS:
        value = evidence.get(field)
        if isinstance(value, dict):
            return value, field, []
        if isinstance(value, str) and value.strip():
            bundle_path = _resolve_manifest_path(value.strip(), evidence_path)
            if bundle_path is None:
                return {}, field, [f"{field} must point to an existing JSON file"]
            bundle, errors = _load_json_object(
                bundle_path,
                "desktop diagnostics bundle",
            )
            return bundle, field, errors

    return (
        {},
        "",
        [
            "desktop_diagnostics_bundle must be an inline object or an existing JSON path"
        ],
    )


def _diagnostics_state(bundle: Dict[str, Any]) -> str:
    state = bundle.get("state")
    if isinstance(state, str):
        return state

    nested_state = (
        bundle.get("bundle", {}) if isinstance(bundle.get("bundle"), dict) else {}
    ).get("health", {})
    if isinstance(nested_state, dict) and isinstance(nested_state.get("state"), str):
        return nested_state["state"]

    return ""


def _diagnostics_check_ok(bundle: Dict[str, Any], check_name: str) -> bool:
    for check in _iter_diagnostics_checks(bundle):
        if check.get("name") == check_name and check.get("ok") is True:
            return True
    return False


def _iter_diagnostics_checks(bundle: Dict[str, Any]) -> List[Dict[str, Any]]:
    checks: List[Dict[str, Any]] = []
    top_level = bundle.get("checks")
    if isinstance(top_level, list):
        checks.extend(item for item in top_level if isinstance(item, dict))

    nested = bundle.get("bundle")
    if isinstance(nested, dict):
        health = nested.get("health")
        if isinstance(health, dict) and isinstance(health.get("checks"), list):
            checks.extend(item for item in health["checks"] if isinstance(item, dict))
    return checks


def _validate_diagnostics_redaction(bundle: Dict[str, Any]) -> List[str]:
    encoded = json.dumps(bundle, sort_keys=True)
    lowered = encoded.lower()
    failures: List[str] = []

    for marker in FORBIDDEN_DIAGNOSTICS_MARKERS:
        if marker in lowered:
            failures.append(
                "desktop diagnostics bundle must not contain raw tokens or "
                "student data"
            )
            break

    if SECRET_ASSIGNMENT_RE.search(encoded):
        failures.append("desktop diagnostics bundle contains an unredacted secret")

    if _contains_unredacted_secret_field(bundle):
        failures.append("desktop diagnostics bundle contains an unredacted secret")

    if BLUETOOTH_ADDRESS_RE.search(encoded):
        failures.append(
            "desktop diagnostics bundle contains an unredacted Bluetooth address"
        )

    return failures


def _contains_unredacted_secret_field(value: Any, key: str = "") -> bool:
    if isinstance(value, dict):
        return any(
            _contains_unredacted_secret_field(item, str(item_key))
            for item_key, item in value.items()
        )
    if isinstance(value, list):
        return any(_contains_unredacted_secret_field(item, key) for item in value)

    if not any(fragment in key.upper() for fragment in SECRET_KEY_FRAGMENTS):
        return False
    if value is None:
        return False
    if isinstance(value, str):
        return value.strip() not in REDACTED_VALUES
    return True


def _validate_release_artifact_manifest(
    evidence: Dict[str, Any],
    evidence_path: Path,
) -> List[str]:
    manifest_ref = evidence.get("release_artifact_manifest")
    if not isinstance(manifest_ref, str) or not manifest_ref.strip():
        return ["release_artifact_manifest must point to a release manifest"]

    manifest_path = _resolve_manifest_path(manifest_ref.strip(), evidence_path)
    if manifest_path is None:
        return ["release_artifact_manifest must point to an existing release manifest"]

    manifest, errors = _load_release_manifest(manifest_path)
    if errors:
        return errors

    failures: List[str] = []
    target = manifest.get("target")
    if target not in {"macos", "windows"}:
        failures.append("release manifest target must be macos or windows")
    if manifest.get("signed") is not True:
        failures.append("release manifest signed must be true")
    if manifest.get("contains_self_contained_executable") is not True:
        failures.append(
            "release manifest contains_self_contained_executable must be true"
        )
    if manifest.get("requires_clean_machine_evidence") is not True:
        failures.append("release manifest requires_clean_machine_evidence must be true")

    if target == "macos":
        if manifest.get("notarized") is not True:
            failures.append("release manifest notarized must be true for macOS")
        if manifest.get("contains_macos_native_bluetooth_adapter") is not True:
            failures.append(
                "release manifest contains_macos_native_bluetooth_adapter "
                "must be true for macOS"
            )
        if not isinstance(manifest.get("installer_pkg"), str):
            failures.append("release manifest installer_pkg is required for macOS")
        if manifest.get("installer_signed") is not True:
            failures.append("release manifest installer_signed must be true for macOS")
        installer_sha = manifest.get("installer_sha256")
        if not isinstance(installer_sha, str) or len(installer_sha) != 64:
            failures.append(
                "release manifest installer_sha256 must be a SHA-256 for macOS"
            )

    if target == "windows":
        if not isinstance(manifest.get("windows_installer"), str):
            failures.append(
                "release manifest windows_installer is required for Windows"
            )
        if manifest.get("windows_installer_signed") is not True:
            failures.append(
                "release manifest windows_installer_signed must be true for Windows"
            )
        windows_installer_sha = manifest.get("windows_installer_sha256")
        if not (
            isinstance(windows_installer_sha, str) and len(windows_installer_sha) == 64
        ):
            failures.append(
                "release manifest windows_installer_sha256 must be a SHA-256 "
                "for Windows"
            )
        if manifest.get("windows_installer_type") not in {"msi", "exe"}:
            failures.append(
                "release manifest windows_installer_type must be msi or exe "
                "for Windows"
            )

    return failures


def _resolve_manifest_path(raw_path: str, evidence_path: Path) -> Path | None:
    candidate = Path(raw_path).expanduser()
    candidates = (
        [candidate]
        if candidate.is_absolute()
        else [
            Path.cwd() / candidate,
            ROOT / candidate,
            evidence_path.parent / candidate,
        ]
    )
    for path in candidates:
        if path.is_file():
            return path
    return None


def _load_release_manifest(path: Path) -> Tuple[Dict[str, Any], List[str]]:
    return _load_json_object(path, "release manifest")


def _load_json_object(path: Path, label: str) -> Tuple[Dict[str, Any], List[str]]:
    try:
        decoded = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {}, [f"{label} JSON is invalid: {exc.msg}"]

    if not isinstance(decoded, dict):
        return {}, [f"{label} JSON must be an object"]

    return decoded, []


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

    manifest_ref = evidence.get("release_artifact_manifest")
    if manifest_ref:
        lines.extend(["", "## Release Artifact", ""])
        lines.append(f"- release_artifact_manifest: `{manifest_ref}`")

    diagnostics_ref = next(
        (
            evidence.get(field)
            for field in DIAGNOSTICS_BUNDLE_FIELDS
            if evidence.get(field)
        ),
        None,
    )
    if diagnostics_ref:
        lines.extend(["", "## Diagnostics Evidence", ""])
        if isinstance(diagnostics_ref, str):
            lines.append(f"- desktop_diagnostics_bundle: `{diagnostics_ref}`")
        else:
            lines.append("- desktop_diagnostics_bundle: inline object")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
