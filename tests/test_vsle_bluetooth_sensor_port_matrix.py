import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/run_vsle_bluetooth_sensor_port_matrix.py"


def _matrix_evidence(**overrides):
    payload = {
        "evidence_kind": "vsle_bluetooth_sensor_port_matrix",
        "transport": "vsle-bluetooth",
        "real_ev3_full_bluetooth_ok": True,
        "runs": [
            {
                "id": "mac-s1-touch-a-motor-20260529",
                "source_evidence": (
                    "docs/classroom/vsle_bluetooth_full_module_smoke.json"
                ),
                "sensor_updates_observed": 86,
                "sensor_freshness_ms_max": 499.251,
                "sensor_freshness_ms_avg_observed": 106.065,
                "sensor_freshness_ms_p95_observed": 246.559,
                "sensors": {
                    "S1": {
                        "expected_type": "touch",
                        "observed_type": "touch",
                        "latest": {"type": "touch", "pressed": 0},
                    }
                },
                "motors": {
                    "A": {
                        "observed": True,
                        "latest": {
                            "position": 24,
                            "speed": 0,
                            "running": False,
                        },
                    }
                },
            }
        ],
    }
    payload.update(overrides)
    return payload


def test_sensor_port_matrix_accepts_observed_touch_and_motor(tmp_path):
    evidence = tmp_path / "matrix.json"
    evidence.write_text(json.dumps(_matrix_evidence()), encoding="utf-8")
    report = tmp_path / "matrix.md"

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
    assert "Sensor port matrix ready: yes" in text
    assert "S1 | touch | mac-s1-touch-a-motor-20260529" in text
    assert "A | observed | mac-s1-touch-a-motor-20260529" in text
    assert "Untested sensor ports: S2, S3, S4" in text
    assert "Untested motor ports: B, C, D" in text


def test_sensor_port_matrix_accepts_usb_sysfs_snapshot_without_freshness(
    tmp_path,
):
    payload = _matrix_evidence()
    payload["runs"].append(
        {
            "id": "usb-s2-ultrasonic-20260530",
            "source_evidence": "usb-ssh ev3dev sysfs snapshot",
            "sensor_updates_observed": 1,
            "freshness_not_applicable_reason": "usb-ssh-sysfs-snapshot",
            "sensors": {
                "S2": {
                    "expected_type": "ultrasonic",
                    "observed_type": "ultrasonic",
                    "latest": {
                        "type": "ultrasonic",
                        "distance_cm": 124.4,
                    },
                }
            },
            "motors": {},
        }
    )
    evidence = tmp_path / "matrix.json"
    evidence.write_text(json.dumps(payload), encoding="utf-8")
    report = tmp_path / "matrix.md"

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
    assert "S2 | ultrasonic | usb-s2-ultrasonic-20260530" in text
    assert "n/a (usb-ssh-sysfs-snapshot)" in text
    assert "Untested sensor ports: S3, S4" in text


def test_sensor_port_matrix_rejects_declared_sensor_without_payload(tmp_path):
    payload = _matrix_evidence()
    run = payload["runs"][0]
    run["sensors"] = {
        "S2": {
            "expected_type": "ultrasonic",
            "observed_type": "ultrasonic",
            "latest": {"type": "ultrasonic"},
        }
    }
    evidence = tmp_path / "matrix.json"
    evidence.write_text(json.dumps(payload), encoding="utf-8")
    report = tmp_path / "matrix.md"

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
    assert "Sensor port matrix ready: no" in text
    assert "runs[0].sensors.S2.latest.distance_cm is required" in text


def test_sensor_port_matrix_template_is_blocked_by_default(tmp_path):
    report = tmp_path / "matrix.md"
    result = subprocess.run(
        [
            ".venv/bin/python",
            str(SCRIPT),
            "--evidence",
            "docs/classroom/vsle_bluetooth_sensor_port_matrix.template.json",
            "--report",
            str(report),
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert "Sensor port matrix ready: no" in report.read_text(encoding="utf-8")


def test_docs_reference_sensor_port_matrix_gate():
    docs = [
        ROOT / "AGENTS.md",
        ROOT / "VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md",
        ROOT / "docs/classroom/REAL_EV3_SMOKE_HANDOFF.md",
        ROOT / "docs/SOURCE_REGISTER.md",
    ]
    for path in docs:
        text = path.read_text(encoding="utf-8")
        assert "run_vsle_bluetooth_sensor_port_matrix.py" in text
        assert "vsle_bluetooth_sensor_port_matrix.md" in text
