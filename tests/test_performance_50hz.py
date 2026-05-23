import json
from pathlib import Path

from performance.sustained_50hz import (
    FOUR_HOUR_SECONDS,
    MAX_DROPPED_UPDATE_PERCENT,
    MAX_MEMORY_GROWTH_MB,
    TARGET_HZ,
    simulate_sustained_50hz,
    write_report_files,
)


ROOT = Path(__file__).resolve().parents[1]
PERF_DOC = ROOT / "docs" / "performance" / "PERFORMANCE_50HZ.md"


def test_simulated_four_hour_50hz_run_meets_section_13_6_gates():
    report = simulate_sustained_50hz(
        duration_seconds=FOUR_HOUR_SECONDS,
        target_hz=TARGET_HZ,
        baseline_memory_mb=82.0,
        final_memory_mb=104.0,
    )

    assert report.expected_updates == 720_000
    assert report.delivered_updates == 720_000
    assert report.dropped_updates == 0
    assert report.dropped_update_percent == 0.0
    assert report.observed_hz == 50.0
    assert report.max_drift_ms == 0.0
    assert report.memory_growth_mb == 22.0
    assert report.passed is True
    assert report.failures == []


def test_simulated_report_fails_when_dropped_updates_exceed_gate():
    report = simulate_sustained_50hz(
        duration_seconds=100,
        target_hz=TARGET_HZ,
        drop_every=100,
    )

    assert report.dropped_update_percent > MAX_DROPPED_UPDATE_PERCENT
    assert report.passed is False
    assert "dropped_update_percent_above_0.1" in report.failures


def test_simulated_report_fails_when_memory_growth_exceeds_gate():
    report = simulate_sustained_50hz(
        duration_seconds=100,
        target_hz=TARGET_HZ,
        baseline_memory_mb=100.0,
        final_memory_mb=151.5,
    )

    assert report.memory_growth_mb > MAX_MEMORY_GROWTH_MB
    assert report.passed is False
    assert "memory_growth_above_50mb" in report.failures


def test_simulated_report_fails_when_drift_exceeds_gate():
    report = simulate_sustained_50hz(
        duration_seconds=100,
        target_hz=TARGET_HZ,
        drift_per_update_ms=0.01,
    )

    assert report.max_drift_ms > 20
    assert report.passed is False
    assert "drift_above_20ms" in report.failures


def test_report_writer_outputs_json_and_markdown(tmp_path):
    report = simulate_sustained_50hz(
        duration_seconds=20,
        target_hz=TARGET_HZ,
    )
    json_path = tmp_path / "report.json"
    markdown_path = tmp_path / "report.md"

    write_report_files(report, json_path=json_path, markdown_path=markdown_path)

    parsed = json.loads(json_path.read_text(encoding="utf-8"))
    markdown = markdown_path.read_text(encoding="utf-8")
    assert parsed["target_hz"] == 50
    assert parsed["thresholds"]["dropped_update_percent"] == 0.1
    assert "Section 13.6 Critical Remediation Gates" in markdown
    assert "50Hz sustained stream" in markdown
    assert "Dropped updates" in markdown


def test_performance_documentation_covers_manual_and_simulated_runs():
    text = PERF_DOC.read_text(encoding="utf-8")

    for required in (
        "50Hz sustained stream",
        "4-hour session simulation",
        "720000",
        "dropped updates <0.1%",
        "memory growth <50MB",
        "drift bound",
        "python -m performance.sustained_50hz",
        "docs/performance/50hz_sustained_report.json",
        "30-device rehearsal",
        "Section 13.6 Critical Remediation Gates",
        "Scratch visual identity",
        "SensorCache",
        "MAX_COLLECTED_POINTS",
    ):
        assert required in text

    lowered = text.lower()
    assert "todo" not in lowered
    assert "tbd" not in lowered
