import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/run_macos_browser_vsle_bluetooth_smoke.py"


def _browser_evidence(**overrides):
    payload = {
        "evidence_kind": "scratchai_browser_unsandboxed_extension_load",
        "pass": True,
        "post_load_state": {
            "extensionResourceLoadedAsScript": True,
            "extensionWorkerResourceLoaded": False,
            "extensionScriptTags": [
                "http://127.0.0.1:8000/vsle-ev3-extension/index.js"
            ],
        },
    }
    payload.update(overrides)
    return payload


def _bluetooth_evidence(**overrides):
    payload = {
        "installed_from_release_artifact": False,
        "ev3_runs_ev3dev_server": True,
        "transport": "vsle-bluetooth",
        "real_ev3_full_bluetooth_ok": True,
        "sensor_freshness_ms_max": 499.251,
        "sensor_freshness_ms_avg_observed": 106.065,
        "sensor_freshness_ms_p95_observed": 246.559,
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


def _run_gate(tmp_path, browser_evidence, bluetooth_evidence):
    browser_path = tmp_path / "browser.json"
    bluetooth_path = tmp_path / "bluetooth.json"
    report_path = tmp_path / "report.md"
    browser_path.write_text(json.dumps(browser_evidence), encoding="utf-8")
    bluetooth_path.write_text(json.dumps(bluetooth_evidence), encoding="utf-8")

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--browser-evidence",
            str(browser_path),
            "--bluetooth-evidence",
            str(bluetooth_path),
            "--report",
            str(report_path),
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    return result, report_path.read_text(encoding="utf-8")


def test_macos_browser_gate_accepts_functional_path_without_release_artifact(
    tmp_path,
):
    result, report = _run_gate(
        tmp_path,
        _browser_evidence(),
        _bluetooth_evidence(),
    )

    assert result.returncode == 0, result.stderr + result.stdout
    assert "Server-side Scratch EV3 module path validated: yes" in report
    assert "Classroom ready: no" in report
    assert "Release-artifact evidence ready: no" in report
    assert "Windows evidence ready: no" in report
    assert "does not replace signed release-artifact evidence" in report
    assert "direct browser Bluetooth" in report


def test_macos_browser_gate_rejects_sandboxed_browser_extension_load(tmp_path):
    browser = _browser_evidence(
        post_load_state={
            "extensionResourceLoadedAsScript": False,
            "extensionWorkerResourceLoaded": True,
            "extensionScriptTags": [],
        }
    )
    result, report = _run_gate(tmp_path, browser, _bluetooth_evidence())

    assert result.returncode == 1
    assert "Server-side Scratch EV3 module path validated: no" in report
    assert "browser extension must load as a main-thread script" in report
    assert "browser extension must not load through extension-worker" in report


def test_macos_browser_gate_rejects_missing_full_module_group(tmp_path):
    command_groups = _bluetooth_evidence()["command_groups"]
    command_groups["display"] = False
    result, report = _run_gate(
        tmp_path,
        _browser_evidence(),
        _bluetooth_evidence(command_groups=command_groups),
    )

    assert result.returncode == 1
    assert "command_groups.display must be true" in report
    assert "Server-side Scratch EV3 module path validated: no" in report


def test_docs_reference_macos_browser_gate_script_and_report():
    expected = "scripts/run_macos_browser_vsle_bluetooth_smoke.py"
    expected_report = "docs/classroom/macos_browser_vsle_bluetooth_smoke.md"
    docs = [
        ROOT / "AGENTS.md",
        ROOT / "VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md",
        ROOT / "docs/classroom/REAL_EV3_SMOKE_HANDOFF.md",
        ROOT / "docs/SOURCE_REGISTER.md",
    ]

    for path in docs:
        text = path.read_text(encoding="utf-8")
        assert expected in text, f"{path} must mention {expected}"
        assert expected_report in text, f"{path} must mention {expected_report}"
