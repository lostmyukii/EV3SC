from pathlib import Path

from scripts.run_real_ev3_rehearsal import (
    SmokeCaptureConfig,
    SmokeReadinessConfig,
    attach_smoke_capture_artifact_paths,
    build_smoke_readiness,
    build_rehearsal_plan,
    build_smoke_json_rpc_requests,
    evaluate_rehearsal_evidence,
    main,
    pending_evidence_template,
    render_rehearsal_report,
    render_smoke_readiness_report,
    render_smoke_handoff,
    smoke_capture_to_evidence,
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


def test_smoke_capture_request_sequence_uses_safe_json_rpc_commands():
    requests = build_smoke_json_rpc_requests(
        peripheral_id="vsle-ev3-wifi",
        run_safe_motor_test=True,
    )

    methods = [request["method"] for request in requests]

    assert methods == [
        "getVersion",
        "discover",
        "connect",
        "startNotifications",
        "motor.runTimed",
        "motor.stopAll",
        "sound.stop",
    ]
    assert all(request["jsonrpc"] == "2.0" for request in requests)
    motor = requests[4]
    assert motor["params"] == {"port": "A", "speed": 10, "time": 0.25}


def test_smoke_capture_evidence_records_one_ev3_without_classroom_approval():
    plan = build_rehearsal_plan(root=ROOT, expected_devices=10)
    config = SmokeCaptureConfig(
        root=ROOT,
        weisile_link_url="ws://127.0.0.1:20111/scratch/bt",
        capture_seconds=2.0,
        operator="QA",
        classroom_or_lab="Lab A",
        transport_mode="wifi",
        run_safe_motor_test=True,
        confirm_real_ev3=True,
    )
    transcript = {
        "ok": True,
        "started_at": "2026-05-23T09:00:00+08:00",
        "version_ok": True,
        "discover_ok": True,
        "connect_ok": True,
        "motor_ack": True,
        "emergency_stop_ack": True,
        "sensor_update_count": 96,
        "elapsed_seconds": 2.0,
        "errors": [],
        "peripheral_id": "vsle-ev3-wifi",
        "evidence_files": ["docs/classroom/evidence/smoke-transcript.json"],
    }

    evidence = smoke_capture_to_evidence(plan, config, transcript)
    summary = evaluate_rehearsal_evidence(plan, evidence)

    assert evidence["ev3_endpoint_connected"] is True
    assert evidence["weisilelink_real_transport"] is True
    assert evidence["motor_command_verified"] is True
    assert evidence["emergency_stop_verified"] is True
    assert evidence["sensor_stream_hz"] == 48.0
    assert evidence["device_count"] == 1
    assert evidence["transport_instance_count"] == 1
    assert "1-brick smoke capture" in evidence["notes"]
    assert summary["status"] == "BLOCKED"
    assert "aiquest-collection-training-export" in summary["missingEvidence"]
    assert "multi-device-rehearsal" in summary["missingEvidence"]


def test_smoke_capture_evidence_stays_blocked_when_bridge_unreachable():
    plan = build_rehearsal_plan(root=ROOT, expected_devices=10)
    config = SmokeCaptureConfig(root=ROOT, capture_seconds=2.0)
    transcript = {
        "ok": False,
        "started_at": "2026-05-23T09:00:00+08:00",
        "version_ok": False,
        "discover_ok": False,
        "connect_ok": False,
        "motor_ack": False,
        "emergency_stop_ack": False,
        "sensor_update_count": 0,
        "elapsed_seconds": 0.0,
        "errors": ["connection refused"],
        "peripheral_id": "",
        "evidence_files": [],
    }

    evidence = smoke_capture_to_evidence(plan, config, transcript)
    summary = evaluate_rehearsal_evidence(plan, evidence)

    assert evidence["ev3_endpoint_connected"] is False
    assert evidence["weisilelink_real_transport"] is False
    assert evidence["pilot_required_code_changes"] is True
    assert "connection refused" in evidence["notes"]
    assert summary["classroomApproved"] is False


def test_smoke_capture_requires_explicit_real_ev3_confirmation():
    plan = build_rehearsal_plan(root=ROOT, expected_devices=10)
    config = SmokeCaptureConfig(root=ROOT, capture_seconds=2.0)
    transcript = {
        "ok": True,
        "started_at": "2026-05-23T09:00:00+08:00",
        "version_ok": True,
        "discover_ok": True,
        "connect_ok": True,
        "motor_ack": False,
        "emergency_stop_ack": True,
        "sensor_update_count": 100,
        "elapsed_seconds": 2.0,
        "errors": [],
        "peripheral_id": "vsle-ev3-wifi",
        "evidence_files": [],
    }

    evidence = smoke_capture_to_evidence(plan, config, transcript)

    assert evidence["ev3_endpoint_connected"] is False
    assert evidence["weisilelink_real_transport"] is False
    assert "Real EV3 confirmation was not provided" in evidence["notes"]


def test_smoke_capture_artifact_paths_are_recorded_relative_to_root():
    transcript = {"evidence_files": []}

    attach_smoke_capture_artifact_paths(
        ROOT,
        transcript,
        evidence_path=ROOT / "docs/classroom/real_ev3_smoke_evidence.json",
        transcript_path=ROOT / "docs/classroom/evidence/real_ev3_smoke_transcript.json",
    )

    assert transcript["evidence_files"] == [
        "docs/classroom/real_ev3_smoke_evidence.json",
        "docs/classroom/evidence/real_ev3_smoke_transcript.json",
    ]


def test_smoke_handoff_records_physical_ev3_confirmation_commands():
    markdown = render_smoke_handoff(
        root=ROOT,
        ev3_host="ev3dev.local",
        ev3_port=8765,
        weisile_link_url="ws://127.0.0.1:20111/scratch/bt",
    )

    assert "# Real EV3 Smoke Handoff" in markdown
    assert "Do not use `--confirm-real-ev3`" in markdown
    assert "ping -c 1 ev3dev.local" in markdown
    assert "nc -z -w 2 ev3dev.local 8765" in markdown
    assert "PYTHONPATH=weisile-link" in markdown
    assert "EV3_IP=ev3dev.local" in markdown
    assert "--check-smoke-readiness" in markdown
    assert "--require-smoke-ready" in markdown
    assert "--capture-smoke" in markdown
    assert "--confirm-real-ev3" in markdown
    assert "--run-safe-motor-test" in markdown
    assert "--require-passed" in markdown
    assert "/Users/yukii/Desktop/scratch ai" not in markdown


def test_smoke_readiness_blocks_confirmed_run_when_ev3_unreachable():
    def connector(address, timeout=0):
        host, port = address
        if host == "127.0.0.1" and port == 20111:
            return object()
        raise OSError("name or service not known")

    readiness = build_smoke_readiness(
        SmokeReadinessConfig(root=ROOT),
        connector=connector,
    )
    markdown = render_smoke_readiness_report(readiness)

    assert readiness["safe_to_run_confirmed_smoke"] is False
    assert readiness["ev3_endpoint"]["reachable"] is False
    assert readiness["weisilelink_endpoint"]["reachable"] is True
    assert readiness["created_at"] in markdown
    assert "Do not run `--confirm-real-ev3` yet." in markdown
    assert "ev3dev.local:8765" in markdown
    assert "127.0.0.1:20111" in markdown
    assert "/Users/yukii/Desktop/scratch ai" not in markdown


def test_smoke_readiness_allows_confirmed_run_only_when_both_ports_reachable():
    def connector(address, timeout=0):
        return object()

    readiness = build_smoke_readiness(
        SmokeReadinessConfig(root=ROOT),
        connector=connector,
    )

    assert readiness["safe_to_run_confirmed_smoke"] is True
    assert readiness["ev3_endpoint"]["reachable"] is True
    assert readiness["weisilelink_endpoint"]["reachable"] is True


def test_require_smoke_ready_exits_nonzero_when_readiness_is_blocked():
    result = main(
        [
            "--check-smoke-readiness",
            "--ev3-host",
            "127.0.0.1",
            "--ev3-port",
            "9",
            "--weisile-link-host",
            "127.0.0.1",
            "--weisile-link-port",
            "9",
            "--probe-timeout-seconds",
            "0.01",
            "--require-smoke-ready",
        ]
    )

    assert result == 2
