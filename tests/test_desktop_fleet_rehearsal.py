import json
from pathlib import Path
import subprocess
import sys

from scripts.run_desktop_fleet_rehearsal import (
    DEFAULT_DEVICE_COUNT,
    build_fleet_roster,
    main,
    render_fleet_rehearsal_report,
    run_fleet_rehearsal,
)


ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "scripts/run_desktop_fleet_rehearsal.py"


def test_build_fleet_roster_creates_token_free_10_device_package():
    roster = build_fleet_roster(device_count=10)
    encoded = json.dumps(roster).lower()

    assert len(roster["devices"]) == 10
    assert roster["devices"][0]["brick_id"] == "VSLE-EV3-0001"
    assert roster["devices"][-1]["label"] == "EV3-10"
    assert roster["devices"][0]["expected_sensors"] == {
        "S1": "color",
        "S2": "ultrasonic",
        "S3": "gyro",
        "S4": "touch",
    }
    assert "pairing_token" not in encoded
    assert "token_ref" not in encoded


def test_fleet_rehearsal_selects_and_supervises_each_profile(tmp_path):
    evidence = run_fleet_rehearsal(
        root=ROOT,
        device_count=DEFAULT_DEVICE_COUNT,
        config_path=tmp_path / "config.json",
    )
    encoded = json.dumps(evidence).lower()

    assert evidence["status"] == "passed"
    assert evidence["device_count"] == 10
    assert evidence["roster_imported"] is True
    assert evidence["profiles_paired"] == 10
    assert evidence["selected_profiles"] == 10
    assert evidence["startup_ready"] == 10
    assert evidence["supervisor_ready"] == 10
    assert evidence["token_safe"] is True
    assert [device["brick_id"] for device in evidence["devices"]] == [
        "VSLE-EV3-0001",
        "VSLE-EV3-0002",
        "VSLE-EV3-0003",
        "VSLE-EV3-0004",
        "VSLE-EV3-0005",
        "VSLE-EV3-0006",
        "VSLE-EV3-0007",
        "VSLE-EV3-0008",
        "VSLE-EV3-0009",
        "VSLE-EV3-0010",
    ]
    assert all(device["selected"] for device in evidence["devices"])
    assert all(device["startup_state"] == "ready" for device in evidence["devices"])
    assert all(
        device["supervisor_state"] == "ready" for device in evidence["devices"]
    )
    assert "pairing_token" not in encoded
    assert "weisile_pairing_token" not in encoded
    assert "token_ref" not in encoded
    assert "secret-token" not in encoded


def test_fleet_rehearsal_report_records_passed_status(tmp_path):
    evidence = run_fleet_rehearsal(
        root=ROOT,
        device_count=DEFAULT_DEVICE_COUNT,
        config_path=tmp_path / "config.json",
    )

    report = render_fleet_rehearsal_report(evidence)

    assert "# Desktop Fleet Rehearsal" in report
    assert "Status: passed" in report
    assert "Device count: 10" in report
    assert "| VSLE-EV3-0001 | EV3-01 | ready | ready | pass |" in report
    assert "token-safe" in report


def test_fleet_rehearsal_evidence_blocks_below_10_devices(tmp_path):
    evidence = run_fleet_rehearsal(
        root=ROOT,
        device_count=3,
        config_path=tmp_path / "config.json",
    )

    assert evidence["status"] == "blocked"
    assert evidence["device_count"] == 3
    assert evidence["minimum_required_devices"] == 10


def test_fleet_rehearsal_cli_writes_json_and_markdown(tmp_path):
    evidence_path = tmp_path / "fleet.json"
    report_path = tmp_path / "fleet.md"

    exit_code = main(
        [
            "--device-count",
            "10",
            "--config",
            str(tmp_path / "config.json"),
            "--evidence",
            str(evidence_path),
            "--report",
            str(report_path),
        ]
    )

    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    report = report_path.read_text(encoding="utf-8")
    assert exit_code == 0
    assert evidence["device_count"] == 10
    assert evidence["status"] == "passed"
    assert "Status: passed" in report


def test_fleet_rehearsal_cli_refuses_too_few_devices(tmp_path):
    evidence_path = tmp_path / "fleet.json"
    report_path = tmp_path / "fleet.md"
    result = subprocess.run(
        [
            sys.executable,
            str(RUNNER),
            "--device-count",
            "9",
            "--config",
            str(tmp_path / "config.json"),
            "--evidence",
            str(evidence_path),
            "--report",
            str(report_path),
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert "device-count must be at least 10" in result.stderr
