from pathlib import Path

from scripts.run_real_ev3_rehearsal import (
    build_rehearsal_plan,
    evaluate_rehearsal_evidence,
    pending_evidence_template,
    render_rehearsal_report,
)


ROOT = Path("/Users/yukii/Desktop/EV3SC")


def test_real_ev3_rehearsal_plan_covers_section_13_7_gates():
    plan = build_rehearsal_plan(root=ROOT, expected_devices=10)

    gate_ids = [gate.id for gate in plan.gates]

    assert gate_ids == [
        "scratchai-unified-stack",
        "real-ev3-endpoint",
        "weisilelink-real-transport",
        "motor-command-safety",
        "sensor-stream-freshness",
        "aiquest-collection-training-export",
        "multi-device-rehearsal",
    ]
    assert plan.expected_devices == 10
    assert all(str(path).startswith(str(ROOT)) for path in plan.evidence_paths)
    assert "/Users/yukii/Desktop/scratch ai" not in repr(plan)
    assert any("45-minute student workflow" in gate.requirement for gate in plan.gates)
    assert any("at least 10 real EV3 bricks" in gate.requirement for gate in plan.gates)


def test_pending_evidence_blocks_classroom_approval_without_hardware():
    plan = build_rehearsal_plan(root=ROOT, expected_devices=10)

    summary = evaluate_rehearsal_evidence(plan, pending_evidence_template(plan))

    assert summary["status"] == "BLOCKED"
    assert summary["classroomApproved"] is False
    assert summary["passed"] == 0
    assert summary["failed"] == len(plan.gates)
    assert "real-ev3-endpoint" in summary["missingEvidence"]
    assert "multi-device-rehearsal" in summary["missingEvidence"]
    assert "No real EV3 hardware evidence has been attached" in summary["notes"]


def test_complete_real_ev3_evidence_can_pass_gate():
    plan = build_rehearsal_plan(
        root=ROOT,
        expected_devices=2,
        expected_transport_instances=2,
    )
    evidence = pending_evidence_template(plan)
    evidence.update(
        {
            "scratchai_unified_stack": True,
            "ev3_endpoint_connected": True,
            "weisilelink_real_transport": True,
            "motor_command_verified": True,
            "emergency_stop_verified": True,
            "sensor_stream_hz": 49.8,
            "sensor_stream_duration_minutes": 45,
            "aiquest_collection_verified": True,
            "aiquest_training_export_verified": True,
            "transport_instance_count": 2,
            "device_count": 2,
            "disconnects_recorded": True,
            "reconnect_time_seconds_max": 3.2,
            "dropped_update_pct": 0.02,
            "memory_growth_mb": 24.0,
            "teacher_recovery_steps_recorded": True,
            "pilot_required_code_changes": False,
            "evidence_files": [
                "docs/classroom/evidence/ev3-01-log.json",
                "docs/classroom/evidence/scratchai-aiquest-export.json",
            ],
            "operator": "QA",
            "run_started_at": "2026-05-23T09:00:00+08:00",
        }
    )

    summary = evaluate_rehearsal_evidence(plan, evidence)

    assert summary["status"] == "PASSED"
    assert summary["classroomApproved"] is True
    assert summary["passed"] == len(plan.gates)
    assert summary["failed"] == 0
    assert summary["missingEvidence"] == []


def test_rehearsal_markdown_report_records_blocked_status():
    plan = build_rehearsal_plan(root=ROOT, expected_devices=10)
    summary = evaluate_rehearsal_evidence(plan, pending_evidence_template(plan))

    markdown = render_rehearsal_report(plan, summary)

    assert "Real EV3 Classroom Rehearsal" in markdown
    assert "Status: BLOCKED" in markdown
    assert "Classroom approved: false" in markdown
    assert "| real-ev3-endpoint | FAIL |" in markdown
    assert "does not replace the real EV3 classroom rehearsal" in markdown
