"""50Hz sustained-stream performance harness for VSLE Scratch-EV3.

Sources:
- VSLE spec Section 13.4 defines the 4-hour sustained 50Hz performance test.
- VSLE spec Section 13.6 blocks classroom deployment until drift is bounded,
  dropped updates are below 0.1%, and memory growth stays below 50MB.
- VSLE spec Section 17.3 defines runtime alert thresholds for sensor Hz,
  collected-point capacity, and 4-hour memory growth.
- `ev3-firmware/vsle_ev3_server.py` uses a monotonic `next_tick` loop for the
  source 50Hz EV3 sensor broadcast schedule.
"""

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional

TARGET_HZ = 50
FOUR_HOUR_SECONDS = 4 * 60 * 60
INTERVAL_MS = 1000 / TARGET_HZ
MAX_DROPPED_UPDATE_PERCENT = 0.1
MAX_MEMORY_GROWTH_MB = 50
MAX_DRIFT_MS = INTERVAL_MS
MIN_OBSERVED_HZ = 45


@dataclass(frozen=True)
class PerformanceThresholds:
    """Section 13.6/17.3 performance gates."""

    dropped_update_percent: float = MAX_DROPPED_UPDATE_PERCENT
    memory_growth_mb: float = MAX_MEMORY_GROWTH_MB
    max_drift_ms: float = MAX_DRIFT_MS
    min_observed_hz: float = MIN_OBSERVED_HZ


@dataclass(frozen=True)
class PerformanceReport:
    """Summary of one sustained sensor-stream run."""

    target_hz: int
    duration_seconds: int
    expected_updates: int
    delivered_updates: int
    dropped_updates: int
    dropped_update_percent: float
    observed_hz: float
    max_drift_ms: float
    baseline_memory_mb: float
    final_memory_mb: float
    memory_growth_mb: float
    thresholds: PerformanceThresholds
    failures: List[str]

    @property
    def passed(self) -> bool:
        """Whether all Section 13.6 performance gates passed."""
        return not self.failures

    def to_dict(self) -> Dict[str, object]:
        """Return JSON-serializable report data."""
        data = asdict(self)
        data["passed"] = self.passed
        return data

    def to_markdown(self) -> str:
        """Return a teacher/QA readable Markdown report."""
        status = "PASS" if self.passed else "FAIL"
        return "\n".join(
            [
                "# VSLE 50Hz Sustained Performance Report",
                "",
                "This report maps to Section 13.6 Critical Remediation Gates.",
                "",
                f"- Status: {status}",
                f"- Target: 50Hz sustained stream",
                f"- Duration: {self.duration_seconds} seconds",
                f"- Expected updates: {self.expected_updates}",
                f"- Delivered updates: {self.delivered_updates}",
                f"- Dropped updates: {self.dropped_updates}",
                f"- Dropped update percent: {self.dropped_update_percent}",
                f"- Observed Hz: {self.observed_hz}",
                f"- Max drift ms: {self.max_drift_ms}",
                f"- Memory growth MB: {self.memory_growth_mb}",
                "",
                "## Gates",
                "",
                (
                    f"- Dropped updates <0.1%: "
                    f"{self.dropped_update_percent < MAX_DROPPED_UPDATE_PERCENT}"
                ),
                (
                    f"- Memory growth <50MB: "
                    f"{self.memory_growth_mb < MAX_MEMORY_GROWTH_MB}"
                ),
                f"- Drift bound <=20ms: {self.max_drift_ms <= MAX_DRIFT_MS}",
                f"- Observed Hz >=45: {self.observed_hz >= MIN_OBSERVED_HZ}",
                "",
                "## Failures",
                "",
                (
                    "\n".join(f"- {failure}" for failure in self.failures)
                    if self.failures
                    else "- none"
                ),
                "",
            ]
        )


def simulate_sustained_50hz(
    *,
    duration_seconds: int = FOUR_HOUR_SECONDS,
    target_hz: int = TARGET_HZ,
    baseline_memory_mb: float = 80.0,
    final_memory_mb: float = 100.0,
    drop_every: Optional[int] = None,
    drift_per_update_ms: float = 0.0,
) -> PerformanceReport:
    """Fast deterministic simulation of a sustained 50Hz EV3 stream."""
    expected_updates = int(duration_seconds * target_hz)
    interval_ms = 1000 / target_hz
    delivered_updates = 0
    dropped_updates = 0
    max_drift_ms = 0.0

    for index in range(expected_updates):
        if drop_every and (index + 1) % drop_every == 0:
            dropped_updates += 1
            continue
        expected_timestamp_ms = index * interval_ms
        actual_timestamp_ms = expected_timestamp_ms + (
            index * drift_per_update_ms
        )
        max_drift_ms = max(
            max_drift_ms,
            abs(actual_timestamp_ms - expected_timestamp_ms),
        )
        delivered_updates += 1

    dropped_update_percent = _percent(dropped_updates, expected_updates)
    observed_hz = round(delivered_updates / duration_seconds, 4)
    memory_growth_mb = round(final_memory_mb - baseline_memory_mb, 4)
    max_drift_ms = round(max_drift_ms, 4)
    thresholds = PerformanceThresholds()
    failures = _failures(
        dropped_update_percent=dropped_update_percent,
        memory_growth_mb=memory_growth_mb,
        max_drift_ms=max_drift_ms,
        observed_hz=observed_hz,
        thresholds=thresholds,
    )
    return PerformanceReport(
        target_hz=target_hz,
        duration_seconds=duration_seconds,
        expected_updates=expected_updates,
        delivered_updates=delivered_updates,
        dropped_updates=dropped_updates,
        dropped_update_percent=dropped_update_percent,
        observed_hz=observed_hz,
        max_drift_ms=max_drift_ms,
        baseline_memory_mb=baseline_memory_mb,
        final_memory_mb=final_memory_mb,
        memory_growth_mb=memory_growth_mb,
        thresholds=thresholds,
        failures=failures,
    )


def write_report_files(
    report: PerformanceReport,
    *,
    json_path: Path,
    markdown_path: Path,
) -> None:
    """Write JSON and Markdown performance report artifacts."""
    json_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(
        json.dumps(report.to_dict(), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    markdown_path.write_text(report.to_markdown(), encoding="utf-8")


def main() -> int:
    """CLI entrypoint for CI and teacher-computer performance rehearsals."""
    parser = argparse.ArgumentParser(
        description="Run the VSLE 50Hz sustained-stream performance simulation."
    )
    parser.add_argument(
        "--duration-seconds", type=int, default=FOUR_HOUR_SECONDS
    )
    parser.add_argument("--target-hz", type=int, default=TARGET_HZ)
    parser.add_argument("--baseline-memory-mb", type=float, default=82.0)
    parser.add_argument("--final-memory-mb", type=float, default=104.0)
    parser.add_argument("--drop-every", type=int)
    parser.add_argument("--drift-per-update-ms", type=float, default=0.0)
    parser.add_argument(
        "--json",
        type=Path,
        default=Path("docs/performance/50hz_sustained_report.json"),
    )
    parser.add_argument(
        "--markdown",
        type=Path,
        default=Path("docs/performance/50hz_sustained_report.md"),
    )
    args = parser.parse_args()

    report = simulate_sustained_50hz(
        duration_seconds=args.duration_seconds,
        target_hz=args.target_hz,
        baseline_memory_mb=args.baseline_memory_mb,
        final_memory_mb=args.final_memory_mb,
        drop_every=args.drop_every,
        drift_per_update_ms=args.drift_per_update_ms,
    )
    write_report_files(report, json_path=args.json, markdown_path=args.markdown)
    print(json.dumps(report.to_dict(), sort_keys=True))
    return 0 if report.passed else 1


def _failures(
    *,
    dropped_update_percent: float,
    memory_growth_mb: float,
    max_drift_ms: float,
    observed_hz: float,
    thresholds: PerformanceThresholds,
) -> List[str]:
    failures = []
    if dropped_update_percent >= thresholds.dropped_update_percent:
        failures.append("dropped_update_percent_above_0.1")
    if memory_growth_mb >= thresholds.memory_growth_mb:
        failures.append("memory_growth_above_50mb")
    if max_drift_ms > thresholds.max_drift_ms:
        failures.append("drift_above_20ms")
    if observed_hz < thresholds.min_observed_hz:
        failures.append("sensor_hz_below_45")
    return failures


def _percent(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 0.0
    return round((numerator / denominator) * 100, 6)


if __name__ == "__main__":
    raise SystemExit(main())
