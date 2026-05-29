import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/run_vsle_bluetooth_smoke.py"


def test_vsle_bluetooth_smoke_rejects_missing_evidence(tmp_path):
    report = tmp_path / "report.md"
    result = subprocess.run(
        [
            ".venv/bin/python",
            str(SCRIPT),
            "--evidence",
            str(tmp_path / "missing.json"),
            "--report",
            str(report),
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert "Classroom ready: no" in report.read_text(encoding="utf-8")


def test_vsle_bluetooth_smoke_accepts_real_full_module_evidence(tmp_path):
    evidence = tmp_path / "evidence.json"
    evidence.write_text(
        json.dumps(
            {
                "installed_from_release_artifact": True,
                "ev3_runs_ev3dev_server": True,
                "transport": "vsle-bluetooth",
                "real_ev3_full_bluetooth_ok": True,
                "sensor_freshness_ms_max": 25,
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
        ),
        encoding="utf-8",
    )
    report = tmp_path / "report.md"
    result = subprocess.run(
        [
            ".venv/bin/python",
            str(SCRIPT),
            "--evidence",
            str(evidence),
            "--report",
            str(report),
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0
    text = report.read_text(encoding="utf-8")
    assert "Bluetooth classroom baseline ready: yes" in text
    assert "Bluetooth high-speed 50Hz ready: yes" in text


def test_vsle_bluetooth_smoke_accepts_baseline_when_only_50hz_gate_fails(
    tmp_path,
):
    evidence = tmp_path / "evidence.json"
    evidence.write_text(
        json.dumps(
            {
                "installed_from_release_artifact": True,
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
        ),
        encoding="utf-8",
    )
    report = tmp_path / "report.md"
    result = subprocess.run(
        [
            ".venv/bin/python",
            str(SCRIPT),
            "--evidence",
            str(evidence),
            "--report",
            str(report),
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    text = report.read_text(encoding="utf-8")
    assert result.returncode == 0
    assert "Bluetooth classroom baseline ready: yes" in text
    assert "Bluetooth high-speed 50Hz ready: no" in text
    assert "Measured Bluetooth sampling" in text
    assert "Diagnostic fallback" not in text
    assert "WiFi Full VSLE remains the classroom 50Hz path" not in text


def test_vsle_bluetooth_smoke_blocks_baseline_without_release_artifact(
    tmp_path,
):
    evidence = tmp_path / "evidence.json"
    evidence.write_text(
        json.dumps(
            {
                "installed_from_release_artifact": False,
                "ev3_runs_ev3dev_server": True,
                "transport": "vsle-bluetooth",
                "real_ev3_full_bluetooth_ok": True,
                "sensor_freshness_ms_max": 499.251,
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
        ),
        encoding="utf-8",
    )
    report = tmp_path / "report.md"
    result = subprocess.run(
        [
            ".venv/bin/python",
            str(SCRIPT),
            "--evidence",
            str(evidence),
            "--report",
            str(report),
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    text = report.read_text(encoding="utf-8")
    assert result.returncode == 1
    assert "Bluetooth classroom baseline ready: no" in text
    assert "Bluetooth high-speed 50Hz ready: no" in text
    assert "installed_from_release_artifact must be true" in text
    assert "Diagnostic fallback" not in text


def test_docs_prioritize_macos_browser_vsle_bluetooth_when_windows_unavailable():
    root = ROOT
    agents = " ".join(
        (root / "AGENTS.md").read_text(encoding="utf-8").split()
    )
    spec = " ".join(
        (root / "VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md")
        .read_text(encoding="utf-8")
        .split()
    )
    handoff = " ".join(
        (root / "docs/classroom/REAL_EV3_SMOKE_HANDOFF.md")
        .read_text(encoding="utf-8")
        .split()
    )

    for text in (agents, spec, handoff):
        assert "Mac browser full VSLE Bluetooth smoke" in text
        assert "Windows evidence" in text
        assert "does not replace signed release-artifact evidence" in text

    assert "ScratchAI browser -> WeisileLink Desktop -> vsle-bluetooth" in spec
    assert "browser code must not open direct Bluetooth connections" in agents
