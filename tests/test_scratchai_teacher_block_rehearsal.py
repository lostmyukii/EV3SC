import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/run_scratchai_teacher_block_rehearsal.py"


def _evidence(**overrides):
    payload = {
        "evidence_kind": "scratchai_teacher_block_rehearsal",
        "recorded_at": "2026-05-30T08:00:00Z",
        "browser_url": "http://127.0.0.1:8642/",
        "scratch_visual_design_changed": False,
        "scratch_unsandboxed_loaded": True,
        "extension_loaded_as_main_thread_script": True,
        "extension_worker_loaded": False,
        "selected_transport_label": "Bluetooth Full VSLE",
        "selected_transport": "vsle-bluetooth",
        "transport_capability": "full",
        "used_browser_direct_bluetooth": False,
        "weisilelink_endpoint": "ws://127.0.0.1:20111/scratch/bt",
        "connected_state_source": "weisilelink_health_and_sensor_freshness",
        "connection_state_visible": True,
        "sensor_freshness_ms_max": 499.251,
        "sensor_updates_observed": 86,
        "block_groups_exercised": {
            "motor": ["motor.runTimed"],
            "sensor": ["getDistance"],
            "sound": ["sound.playTone"],
            "display": ["display.text"],
            "system": ["system.stopAll"],
            "data_collection": ["data.startCollect"],
            "ai_quest": ["aiquest.predictCurrent"],
        },
        "command_source": "scratch_blocks",
        "real_ev3_project_used": True,
        "ev3_runs_ev3dev_server": True,
        "disconnect_stop_ok": True,
        "notes": "Teacher-facing real EV3 Scratch block rehearsal.",
    }
    payload.update(overrides)
    return payload


def _run_gate(tmp_path, evidence):
    evidence_path = tmp_path / "teacher-block-rehearsal.json"
    report_path = tmp_path / "teacher-block-rehearsal.md"
    evidence_path.write_text(json.dumps(evidence), encoding="utf-8")

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
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
    report = ""
    if report_path.exists():
        report = report_path.read_text(encoding="utf-8")
    return result, report


def test_teacher_block_rehearsal_accepts_full_vsle_browser_path(tmp_path):
    result, report = _run_gate(tmp_path, _evidence())

    assert result.returncode == 0, result.stderr + result.stdout
    assert "Teacher-facing Scratch block rehearsal: yes" in report
    assert "Transport: vsle-bluetooth" in report
    assert "Browser direct Bluetooth used: no" in report
    assert "Scratch visual design changed: no" in report
    assert "Classroom release ready: no" in report


def test_teacher_block_rehearsal_rejects_official_firmware_mode(tmp_path):
    result, report = _run_gate(
        tmp_path,
        _evidence(
            selected_transport_label="Official Firmware Bluetooth Compatibility",
            selected_transport="official-bluetooth",
            transport_capability="compatibility",
        ),
    )

    assert result.returncode == 1
    assert "selected_transport must be vsle-bluetooth" in report
    assert "transport_capability must be full" in report
    assert "Teacher-facing Scratch block rehearsal: no" in report


def test_teacher_block_rehearsal_rejects_direct_browser_bluetooth(tmp_path):
    result, report = _run_gate(
        tmp_path,
        _evidence(used_browser_direct_bluetooth=True),
    )

    assert result.returncode == 1
    assert "used_browser_direct_bluetooth must be false" in report
    assert "browser must stay on local WeisileLink JSON-RPC" in report


def test_teacher_block_rehearsal_requires_one_block_per_module(tmp_path):
    groups = _evidence()["block_groups_exercised"]
    groups["ai_quest"] = []

    result, report = _run_gate(
        tmp_path,
        _evidence(block_groups_exercised=groups),
    )

    assert result.returncode == 1
    assert "block_groups_exercised.ai_quest must list at least one block" in report


def test_docs_reference_teacher_block_rehearsal_gate():
    command = "scripts/run_scratchai_teacher_block_rehearsal.py"
    template = "docs/classroom/scratchai_teacher_block_rehearsal.template.json"
    docs = [
        ROOT / "docs/classroom/REAL_EV3_SMOKE_HANDOFF.md",
        ROOT / "docs/classroom/SCRATCHAI_BROWSER_REHEARSAL.md",
        ROOT / "docs/SOURCE_REGISTER.md",
    ]

    for path in docs:
        text = path.read_text(encoding="utf-8")
        assert command in text, f"{path} must mention {command}"
        assert template in text, f"{path} must mention {template}"
