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
    assert "Classroom ready: yes" in report.read_text(encoding="utf-8")
