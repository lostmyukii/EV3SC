from scripts.run_section13_7_preview_rehearsal import (
    PreviewRehearsalMetrics,
    compute_sensor_summary,
    preview_brick_id,
    render_preview_rehearsal_report,
    sensor_subscriber_indexes,
)


def test_preview_brick_ids_match_multi_ev3_preview_backend():
    assert preview_brick_id(0) == "vsle-ev3-wifi"
    assert preview_brick_id(1) == "vsle-ev3-wifi-02"
    assert preview_brick_id(29) == "vsle-ev3-wifi-30"


def test_sensor_subscribers_cover_workflow_and_disconnect_device():
    assert sensor_subscriber_indexes(client_count=30, requested_count=1) == {
        0,
        29,
    }
    assert sensor_subscriber_indexes(client_count=1, requested_count=1) == {0}


def test_compute_sensor_summary_uses_freshness_and_gap_drop_metrics():
    metrics = PreviewRehearsalMetrics(
        sensor_update_count=135000,
        first_sensor_timestamp=1000.0,
        last_sensor_timestamp=3700.0,
        missed_update_estimate=3,
        max_gap_seconds=0.081,
    )

    summary = compute_sensor_summary(metrics)

    assert summary["sensor_stream_hz"] == 50.0
    assert summary["sensor_stream_duration_minutes"] == 45.0
    assert summary["dropped_update_pct"] == 0.002
    assert summary["max_sensor_gap_ms"] == 81


def test_preview_rehearsal_report_never_marks_classroom_approved():
    report = render_preview_rehearsal_report(
        {
            "schema": "vsle.section13_7PreviewRehearsal.v1",
            "scratchai_unified_stack": True,
            "simulated_preview_only": True,
            "sensor_stream_hz": 49.2,
            "sensor_stream_duration_minutes": 45.0,
            "aiquest_collection_verified": True,
            "aiquest_training_export_verified": True,
            "transport_instance_count": 30,
            "disconnect_count": 1,
            "reconnect_time_seconds_max": 0.42,
            "memory_growth_mb": 18.5,
            "evidence_files": [
                "docs/classroom/evidence/section13_7_preview_rehearsal.json"
            ],
        }
    )

    assert "Classroom approved: false" in report
    assert "simulated preview evidence" in report
    assert "49.20Hz" in report
    assert "AI Quest: pass" in report
