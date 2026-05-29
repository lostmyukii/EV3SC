import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/apply_vsle_bluetooth_install_evidence.py"


def _release_manifest(tmp_path):
    manifest = tmp_path / "release-manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "target": "macos",
                "signed": True,
                "notarized": True,
                "contains_self_contained_executable": True,
                "contains_macos_native_bluetooth_adapter": True,
                "requires_clean_machine_evidence": True,
                "installer_pkg": "WeisileLink.pkg",
                "installer_signed": True,
                "installer_sha256": "a" * 64,
            }
        ),
        encoding="utf-8",
    )
    return manifest


def _install_evidence(tmp_path, **overrides):
    payload = {
        "release_artifact_manifest": str(_release_manifest(tmp_path)),
        "installed_from_release_artifact": True,
        "started_after_reboot": True,
        "scratch_link_endpoint_ok": True,
        "vsle_bluetooth_real_ev3_ok": True,
        "developer_checkout_run": False,
        "localhost_only_developer_run": False,
    }
    payload.update(overrides)
    return payload


def _classroom_evidence(**overrides):
    payload = {
        "installed_from_release_artifact": False,
        "ev3_runs_ev3dev_server": True,
        "transport": "vsle-bluetooth",
        "real_ev3_full_bluetooth_ok": True,
        "sensor_freshness_ms_max": 499.251,
        "sensor_updates_observed": 86,
        "command_groups": {
            "motor": True,
            "sensor": True,
            "sound": True,
            "display": True,
            "system": True,
            "data_collection": True,
            "ai_quest": True,
        },
        "disconnect_stop_ok": True,
        "scratch_unsandboxed_loaded": True,
    }
    payload.update(overrides)
    return payload


def _run_bridge(tmp_path, install_payload, classroom_payload):
    install_path = tmp_path / "install.json"
    classroom_path = tmp_path / "classroom.json"
    output_path = tmp_path / "merged.json"
    report_path = tmp_path / "bridge.md"
    install_path.write_text(json.dumps(install_payload), encoding="utf-8")
    classroom_path.write_text(json.dumps(classroom_payload), encoding="utf-8")

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--install-evidence",
            str(install_path),
            "--classroom-evidence",
            str(classroom_path),
            "--output",
            str(output_path),
            "--report",
            str(report_path),
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    output = (
        json.loads(output_path.read_text(encoding="utf-8"))
        if output_path.exists()
        else None
    )
    report = report_path.read_text(encoding="utf-8")
    return result, output, report


def test_bridge_applies_valid_macos_vsle_bluetooth_release_evidence(tmp_path):
    result, output, report = _run_bridge(
        tmp_path,
        _install_evidence(tmp_path),
        _classroom_evidence(),
    )

    assert result.returncode == 0, result.stderr + result.stdout
    assert output["installed_from_release_artifact"] is True
    assert output["release_artifact_evidence"]["mode"] == "vsle-bluetooth"
    assert output["release_artifact_evidence"]["platform"] == "macos"
    assert "Release evidence applied: yes" in report


def test_bridge_rejects_invalid_install_evidence_without_mutating_output(
    tmp_path,
):
    result, output, report = _run_bridge(
        tmp_path,
        _install_evidence(tmp_path, vsle_bluetooth_real_ev3_ok=False),
        _classroom_evidence(),
    )

    assert result.returncode == 1
    assert output is None
    assert "Release evidence applied: no" in report
    assert "vsle_bluetooth_real_ev3_ok must be true" in report


def test_bridge_rejects_non_vsle_bluetooth_classroom_evidence(tmp_path):
    result, output, report = _run_bridge(
        tmp_path,
        _install_evidence(tmp_path),
        _classroom_evidence(transport="official-bluetooth"),
    )

    assert result.returncode == 1
    assert output is None
    assert "transport must be vsle-bluetooth" in report


def test_docs_reference_release_evidence_bridge_command():
    expected = "scripts/apply_vsle_bluetooth_install_evidence.py"
    report = "docs/classroom/vsle_bluetooth_release_evidence_bridge.md"
    docs = [
        ROOT / "AGENTS.md",
        ROOT / "docs/desktop/MACOS_INSTALL.md",
        ROOT / "docs/desktop/WEISILELINK_DESKTOP.md",
        ROOT / "docs/classroom/REAL_EV3_SMOKE_HANDOFF.md",
        ROOT / "docs/SOURCE_REGISTER.md",
    ]

    for path in docs:
        text = path.read_text(encoding="utf-8")
        assert expected in text, f"{path} must mention {expected}"
        assert report in text, f"{path} must mention {report}"
