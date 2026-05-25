#!/usr/bin/env python3
"""Capture Section 13.7 simulated-preview rehearsal evidence.

This runner exercises the EV3SC-owned unified ScratchAI preview stack. It is
useful before physical classroom hardware is available, but its output remains
simulated preview evidence and never grants real EV3 classroom approval.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Set


DEFAULT_ROOT = Path("/Users/yukii/Desktop/EV3SC")
DEFAULT_WEISILE_LINK_URL = "ws://127.0.0.1:20211/scratch/bt"
DEFAULT_TRAINER_URL = "ws://127.0.0.1:18766"
DEFAULT_CLIENT_COUNT = 30
DEFAULT_SENSOR_SUBSCRIBER_COUNT = 1
DEFAULT_DURATION_MINUTES = 45.0
DEFAULT_EXPECTED_HZ = 50.0
DEFAULT_LABEL_INTERVAL_SECONDS = 0.1
DEFAULT_PROGRESS_SECONDS = 30.0
DEFAULT_MEMORY_PORTS = (8611, 8807, 8810, 8612, 8010, 20211, 18766)


class PreviewRehearsalError(RuntimeError):
    """Raised when preview rehearsal evidence cannot be captured safely."""


@dataclass
class PreviewRehearsalMetrics:
    """Aggregated sensor freshness metrics for one subscribed client."""

    sensor_update_count: int = 0
    first_sensor_timestamp: Optional[float] = None
    last_sensor_timestamp: Optional[float] = None
    missed_update_estimate: int = 0
    max_gap_seconds: float = 0.0
    latest_distance_cm: float = 0.0

    def record(self, payload: Mapping[str, Any]) -> None:
        timestamp = _safe_float(payload.get("timestamp"))
        if timestamp <= 0:
            timestamp = time.time()
        if self.first_sensor_timestamp is None:
            self.first_sensor_timestamp = timestamp
        if self.last_sensor_timestamp is not None:
            gap = max(0.0, timestamp - self.last_sensor_timestamp)
            self.max_gap_seconds = max(self.max_gap_seconds, gap)
            expected_interval = 1.0 / DEFAULT_EXPECTED_HZ
            if gap > expected_interval * 2.5:
                self.missed_update_estimate += max(
                    0,
                    round(gap / expected_interval) - 1,
                )
        self.last_sensor_timestamp = timestamp
        self.sensor_update_count += 1
        sensors = payload.get("sensors", {})
        if isinstance(sensors, Mapping):
            ultrasonic = sensors.get("S2", {})
            if isinstance(ultrasonic, Mapping):
                self.latest_distance_cm = _safe_float(
                    ultrasonic.get("distance_cm")
                )


@dataclass
class PreviewScratchClient:
    """One Scratch Link compatible rehearsal client."""

    index: int
    url: str
    peripheral_id: str
    metrics: PreviewRehearsalMetrics
    subscribe_notifications: bool = True
    websocket: Any = None
    reader_task: Optional[asyncio.Task] = None
    request_counter: int = 0
    connected: bool = False

    def __post_init__(self) -> None:
        self.pending: Dict[str, asyncio.Future] = {}
        self.errors: List[str] = []

    async def open(self) -> None:
        import websockets

        self.websocket = await websockets.connect(self.url, open_timeout=10)
        self.reader_task = asyncio.create_task(self._reader())
        await self.request("getVersion")
        response = await self.request(
            "connect",
            {"peripheralId": self.peripheral_id},
        )
        if "error" in response:
            raise PreviewRehearsalError(
                f"connect failed for {self.peripheral_id}: {response['error']}"
            )
        if self.subscribe_notifications:
            await self.request("startNotifications")
        self.connected = True

    async def request(
        self,
        method: str,
        params: Optional[Dict[str, Any]] = None,
        *,
        timeout: float = 10.0,
    ) -> Dict[str, Any]:
        if self.websocket is None:
            raise PreviewRehearsalError("Scratch client is not connected")
        self.request_counter += 1
        request_id = f"client-{self.index}-{self.request_counter}"
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self.pending[request_id] = future
        await self.websocket.send(
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "method": method,
                    "params": params or {},
                },
                separators=(",", ":"),
            )
        )
        try:
            return await asyncio.wait_for(future, timeout=timeout)
        finally:
            self.pending.pop(request_id, None)

    async def close(self) -> None:
        if self.websocket is not None:
            await self.websocket.close()
        if self.reader_task is not None:
            self.reader_task.cancel()
            try:
                await self.reader_task
            except asyncio.CancelledError:
                pass
        self.connected = False

    async def _reader(self) -> None:
        try:
            async for raw in self.websocket:
                message = json.loads(raw)
                request_id = message.get("id")
                if request_id in self.pending:
                    future = self.pending[request_id]
                    if not future.done():
                        future.set_result(message)
                    continue
                if message.get("method") == "notifyDeviceDidReceiveMessage":
                    payload = _decode_sensor_payload(message)
                    if payload.get("type") == "sensor_update":
                        self.metrics.record(payload)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            self.errors.append(str(error))


def preview_brick_id(index: int) -> str:
    """Return the preview backend brick ID for a zero-based client index."""
    if index == 0:
        return "vsle-ev3-wifi"
    return f"vsle-ev3-wifi-{index + 1:02d}"


def sensor_subscriber_indexes(
    *,
    client_count: int,
    requested_count: int,
) -> Set[int]:
    """Return clients that should subscribe to sensor notifications."""
    if client_count <= 0:
        return set()
    subscriber_count = max(1, min(client_count, requested_count))
    indexes = set(range(subscriber_count))
    if client_count > 1:
        indexes.add(client_count - 1)
    return indexes


def compute_sensor_summary(
    metrics: PreviewRehearsalMetrics,
) -> Dict[str, Any]:
    """Return Section 13.7 freshness metrics from aggregated updates."""
    first = metrics.first_sensor_timestamp
    last = metrics.last_sensor_timestamp
    elapsed = max(0.0, (last or 0.0) - (first or 0.0))
    hz = metrics.sensor_update_count / elapsed if elapsed > 0 else 0.0
    total_with_missed = (
        metrics.sensor_update_count + metrics.missed_update_estimate
    )
    dropped = (
        metrics.missed_update_estimate / total_with_missed * 100.0
        if total_with_missed > 0
        else 0.0
    )
    return {
        "sensor_update_count": metrics.sensor_update_count,
        "sensor_stream_hz": round(hz, 3),
        "sensor_stream_duration_minutes": round(elapsed / 60.0, 3),
        "dropped_update_pct": round(dropped, 3),
        "max_sensor_gap_ms": int(round(metrics.max_gap_seconds * 1000)),
    }


def render_preview_rehearsal_report(evidence: Mapping[str, Any]) -> str:
    """Render a Markdown report for simulated Section 13.7 preview evidence."""
    aiquest_ok = (
        evidence.get("aiquest_collection_verified") is True
        and evidence.get("aiquest_training_export_verified") is True
    )
    lines = [
        "# Section 13.7 ScratchAI Preview Rehearsal",
        "",
        f"Date: {datetime.now(timezone.utc).date().isoformat()}",
        "",
        "This is simulated preview evidence from the EV3SC unified stack. It",
        "does not replace the required physical EV3 classroom rehearsal.",
        "",
        "## Summary",
        "",
        "- Classroom approved: false",
        f"- ScratchAI unified stack: {_pass_fail(evidence.get('scratchai_unified_stack'))}",
        (
            "- Sensor freshness: "
            f"{_safe_float(evidence.get('sensor_stream_hz')):.2f}Hz for "
            f"{_safe_float(evidence.get('sensor_stream_duration_minutes')):.2f} min"
        ),
        f"- AI Quest: {'pass' if aiquest_ok else 'fail'}",
        (
            "- Simulated transports: "
            f"{int(_safe_float(evidence.get('transport_instance_count')))}"
        ),
        (
            "- Disconnects: "
            f"{int(_safe_float(evidence.get('disconnect_count')))}, max "
            f"reconnect {_safe_float(evidence.get('reconnect_time_seconds_max')):.2f}s"
        ),
        (
            "- Memory growth: "
            f"{_safe_float(evidence.get('memory_growth_mb')):.1f} MB"
        ),
        "",
        "## Evidence Files",
        "",
    ]
    files = list(evidence.get("evidence_files", []))
    if files:
        lines.extend(f"- `{item}`" for item in files)
    else:
        lines.append("- None recorded.")
    lines.extend(
        [
            "",
            "## Classroom Gate Note",
            "",
            "Physical EV3 approval remains blocked until a human operator",
            "attaches real EV3 endpoint, real transport, and classroom hardware",
            "evidence from Section 13.7.",
            "",
        ]
    )
    return "\n".join(lines)


async def capture_preview_rehearsal(args: argparse.Namespace) -> Dict[str, Any]:
    """Run the preview rehearsal capture against a running unified stack."""
    metrics = PreviewRehearsalMetrics()
    subscribers = sensor_subscriber_indexes(
        client_count=args.client_count,
        requested_count=args.sensor_subscriber_count,
    )
    clients = [
        PreviewScratchClient(
            index=index,
            url=args.weisile_link_url,
            peripheral_id=preview_brick_id(index),
            metrics=metrics if index == 0 else PreviewRehearsalMetrics(),
            subscribe_notifications=index in subscribers,
        )
        for index in range(args.client_count)
    ]
    started_at = datetime.now(timezone.utc).isoformat()
    pids = _memory_pids(args.memory_ports)
    memory_start_mb = _total_rss_mb(pids)
    for client in clients:
        await client.open()

    primary = clients[0]
    await primary.request("data.clear")
    label_stop = asyncio.Event()
    label_task = asyncio.create_task(
        _label_controller(
            primary,
            metrics,
            label_stop,
            args.label_interval_seconds,
        )
    )
    disconnect_task = asyncio.create_task(
        _disconnect_reconnect_probe(
            clients[-1],
            args.disconnect_after_seconds,
        )
    )

    deadline = time.monotonic() + args.duration_seconds
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        await asyncio.sleep(min(args.progress_seconds, remaining))
        summary = compute_sensor_summary(metrics)
        print(
            json.dumps(
                {
                    "elapsedMinutes": summary[
                        "sensor_stream_duration_minutes"
                    ],
                    "sensorHz": summary["sensor_stream_hz"],
                    "updates": summary["sensor_update_count"],
                },
                sort_keys=True,
            ),
            flush=True,
        )

    label_stop.set()
    await label_task
    await primary.request("data.stopCollect")
    disconnect_record = await disconnect_task
    sensor_summary = compute_sensor_summary(metrics)
    aiquest = await _run_aiquest_flow(primary, args.trainer_url)
    memory_end_mb = _total_rss_mb(pids)
    for client in clients:
        await client.close()

    evidence = {
        "schema": "vsle.section13_7PreviewRehearsal.v1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "run_started_at": started_at,
        "operator": args.operator,
        "classroom_or_lab": args.classroom_or_lab,
        "scratchai_unified_stack": args.scratchai_verified,
        "simulated_preview_only": True,
        "classroom_approved": False,
        "weisile_link_url": args.weisile_link_url,
        "trainer_url": args.trainer_url,
        "duration_seconds_requested": args.duration_seconds,
        "transport_instance_count": args.client_count,
        "simulated_device_count": args.client_count,
        "sensor_subscriber_count": len(subscribers),
        "sensor_subscribers": sorted(preview_brick_id(index) for index in subscribers),
        "device_count": 0,
        "ev3_endpoint_connected": False,
        "weisilelink_real_transport": False,
        "sensor_client": primary.peripheral_id,
        "trainer_connected": aiquest["trainer_connected"],
        "trainer_message_count": aiquest["trainer_message_count"],
        **sensor_summary,
        "aiquest_collection_verified": aiquest["collection_verified"],
        "aiquest_training_export_verified": aiquest[
            "training_export_verified"
        ],
        "aiquest": aiquest,
        "disconnects_recorded": bool(disconnect_record),
        "disconnect_count": 1 if disconnect_record else 0,
        "reconnect_time_seconds_max": (
            disconnect_record.get("reconnect_seconds")
            if disconnect_record
            else None
        ),
        "recovery_records": [disconnect_record] if disconnect_record else [],
        "teacher_recovery_steps_recorded": bool(disconnect_record),
        "teacher_recovery_steps": [
            "Observe disconnected Scratch client.",
            "Reconnect the same preview EV3 peripheral.",
            "Restart notifications and confirm sensor updates resume.",
            "Continue the activity without changing code.",
        ],
        "memory_pids": sorted(pids),
        "memory_start_mb": round(memory_start_mb, 3),
        "memory_end_mb": round(memory_end_mb, 3),
        "memory_growth_mb": round(max(0.0, memory_end_mb - memory_start_mb), 3),
        "pilot_required_code_changes": False,
        "evidence_files": [],
        "notes": (
            "Simulated preview rehearsal only. Real EV3 endpoint and real "
            "transport evidence are still required before a pilot class."
        ),
    }
    return evidence


async def _label_controller(
    client: PreviewScratchClient,
    metrics: PreviewRehearsalMetrics,
    stop_event: asyncio.Event,
    interval_seconds: float,
) -> None:
    current_label = ""
    while not stop_event.is_set():
        label = "obstacle" if metrics.latest_distance_cm <= 18.0 else "safe"
        if label != current_label:
            await client.request("data.startCollect", {"label": label})
            current_label = label
        await asyncio.sleep(max(0.1, interval_seconds))


async def _disconnect_reconnect_probe(
    client: PreviewScratchClient,
    delay_seconds: float,
) -> Dict[str, Any]:
    await asyncio.sleep(max(0.1, delay_seconds))
    before_count = client.metrics.sensor_update_count
    started = time.monotonic()
    await client.close()
    await client.open()
    await _wait_for_new_sensor_update(client, before_count)
    reconnect_seconds = time.monotonic() - started
    return {
        "peripheral_id": client.peripheral_id,
        "reconnect_seconds": round(reconnect_seconds, 3),
        "sensor_updates_before_disconnect": before_count,
        "sensor_updates_after_reconnect": client.metrics.sensor_update_count,
        "recovered": client.metrics.sensor_update_count > before_count,
    }


async def _wait_for_new_sensor_update(
    client: PreviewScratchClient,
    before_count: int,
) -> None:
    deadline = time.monotonic() + 10.0
    while time.monotonic() < deadline:
        if client.metrics.sensor_update_count > before_count:
            return
        await asyncio.sleep(0.05)
    raise PreviewRehearsalError(
        f"sensor updates did not resume for {client.peripheral_id}"
    )


async def _run_aiquest_flow(
    client: PreviewScratchClient,
    trainer_url: str,
) -> Dict[str, Any]:
    trainer_state: Dict[str, Any] = {"connected": False, "messages": 0}
    trainer_stop = asyncio.Event()
    trainer_task = asyncio.create_task(
        _trainer_reader(trainer_url, trainer_stop, trainer_state)
    )
    try:
        await _wait_for_trainer(trainer_state)
        upload_to_trainer = await client.request("data.uploadToTrainer")
        upload_dataset = await client.request(
            "aiquest.uploadDataset",
            {
                "consent": True,
                "scope": "project",
                "scope_id": "section13-7-preview",
                "metadata": {
                    "source": "section13_7_preview_rehearsal",
                    "simulated": True,
                },
            },
            timeout=30.0,
        )
        dataset = upload_dataset.get("result", {})
        train = await client.request(
            "aiquest.startTraining",
            {
                "dataset_id": dataset.get("dataset_id", ""),
                "accuracy_gate": 0.7,
            },
            timeout=60.0,
        )
        trained = train.get("result", {})
        status = await client.request(
            "aiquest.getTrainingStatus",
            {"job_id": trained.get("job_id", "")},
        )
        prediction = await client.request("aiquest.predictCurrent")
        export = await client.request(
            "aiquest.exportModel",
            {"model_id": trained.get("model_id", "")},
            timeout=30.0,
        )
    finally:
        trainer_stop.set()
        trainer_task.cancel()
        try:
            await trainer_task
        except asyncio.CancelledError:
            pass
    collection_verified = (
        "error" not in upload_to_trainer
        and "error" not in upload_dataset
        and int(_safe_float(dataset.get("uploaded_samples"))) > 0
    )
    training_export_verified = (
        "error" not in train
        and "error" not in status
        and "error" not in export
        and trained.get("status") == "succeeded"
        and export.get("result", {}).get("filename")
        == "ai_quest_model_report.json"
    )
    return {
        "collection_verified": collection_verified,
        "training_export_verified": training_export_verified,
        "trainer_connected": trainer_state["connected"],
        "trainer_message_count": trainer_state["messages"],
        "upload_to_trainer": upload_to_trainer,
        "upload_dataset": upload_dataset,
        "training": train,
        "training_status": status,
        "prediction": prediction,
        "export": export,
    }


async def _trainer_reader(
    trainer_url: str,
    stop_event: asyncio.Event,
    state: Dict[str, Any],
) -> None:
    import websockets

    async with websockets.connect(trainer_url, open_timeout=10) as websocket:
        state["connected"] = True
        while not stop_event.is_set():
            try:
                await asyncio.wait_for(websocket.recv(), timeout=1.0)
                state["messages"] += 1
            except asyncio.TimeoutError:
                continue


async def _wait_for_trainer(state: Mapping[str, Any]) -> None:
    deadline = time.monotonic() + 10.0
    while time.monotonic() < deadline:
        if state.get("connected") is True:
            return
        await asyncio.sleep(0.05)
    raise PreviewRehearsalError("Trainer WebSocket did not open")


def _decode_sensor_payload(message: Mapping[str, Any]) -> Dict[str, Any]:
    params = message.get("params")
    if not isinstance(params, Mapping):
        return {}
    encoded = params.get("message")
    if not isinstance(encoded, str):
        return {}
    try:
        raw = base64.b64decode(encoded).decode("utf-8")
        payload = json.loads(raw)
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _memory_pids(ports: Sequence[int]) -> Set[int]:
    pids: Set[int] = set()
    for port in ports:
        try:
            result = subprocess.run(
                ["lsof", f"-tiTCP:{int(port)}", "-sTCP:LISTEN"],
                check=False,
                capture_output=True,
                text=True,
            )
        except OSError:
            return set()
        for line in result.stdout.splitlines():
            try:
                pids.add(int(line.strip()))
            except ValueError:
                continue
    return pids


def _total_rss_mb(pids: Iterable[int]) -> float:
    total_kb = 0
    for pid in set(pids):
        try:
            result = subprocess.run(
                ["ps", "-o", "rss=", "-p", str(pid)],
                check=False,
                capture_output=True,
                text=True,
            )
        except OSError:
            continue
        try:
            total_kb += int(result.stdout.strip() or "0")
        except ValueError:
            continue
    return total_kb / 1024.0


def _pass_fail(value: Any) -> str:
    return "pass" if value is True else "fail"


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _duration_seconds(args: argparse.Namespace) -> float:
    if args.duration_seconds is not None:
        return max(1.0, float(args.duration_seconds))
    return max(1.0, float(args.duration_minutes) * 60.0)


def _require_inside_root(path: Path, root: Path) -> Path:
    resolved = path.resolve()
    root = root.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise PreviewRehearsalError(
            f"Path escapes EV3SC root: {resolved}"
        ) from error
    return resolved


def _write_json(path: Path, payload: Mapping[str, Any], root: Path) -> None:
    safe_path = _require_inside_root(path, root)
    safe_path.parent.mkdir(parents=True, exist_ok=True)
    safe_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def _write_text(path: Path, text: str, root: Path) -> None:
    safe_path = _require_inside_root(path, root)
    safe_path.parent.mkdir(parents=True, exist_ok=True)
    safe_path.write_text(text, encoding="utf-8")


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Capture Section 13.7 simulated preview rehearsal evidence."
    )
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--weisile-link-url", default=DEFAULT_WEISILE_LINK_URL)
    parser.add_argument("--trainer-url", default=DEFAULT_TRAINER_URL)
    parser.add_argument("--client-count", type=int, default=DEFAULT_CLIENT_COUNT)
    parser.add_argument(
        "--sensor-subscriber-count",
        type=int,
        default=DEFAULT_SENSOR_SUBSCRIBER_COUNT,
        help=(
            "Number of leading simulated devices that subscribe to sensor "
            "notifications; the disconnect probe device is also subscribed."
        ),
    )
    parser.add_argument(
        "--duration-minutes",
        type=float,
        default=DEFAULT_DURATION_MINUTES,
    )
    parser.add_argument("--duration-seconds", type=float)
    parser.add_argument(
        "--disconnect-after-seconds",
        type=float,
        default=120.0,
    )
    parser.add_argument(
        "--label-interval-seconds",
        type=float,
        default=DEFAULT_LABEL_INTERVAL_SECONDS,
    )
    parser.add_argument(
        "--progress-seconds",
        type=float,
        default=DEFAULT_PROGRESS_SECONDS,
    )
    parser.add_argument(
        "--memory-ports",
        type=int,
        nargs="*",
        default=list(DEFAULT_MEMORY_PORTS),
    )
    parser.add_argument("--operator", default="")
    parser.add_argument("--classroom-or-lab", default="ScratchAI preview stack")
    parser.add_argument("--scratchai-verified", action="store_true")
    parser.add_argument("--output-json", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args(argv)
    args.root = args.root.resolve()
    args.client_count = max(1, min(30, args.client_count))
    args.sensor_subscriber_count = max(
        1,
        min(args.client_count, args.sensor_subscriber_count),
    )
    args.duration_seconds = _duration_seconds(args)
    return args


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    evidence = asyncio.run(capture_preview_rehearsal(args))
    output_path = _require_inside_root(args.output_json, args.root)
    report_path = _require_inside_root(args.report, args.root)
    evidence["evidence_files"] = [
        str(output_path.relative_to(args.root)),
        str(report_path.relative_to(args.root)),
        "docs/classroom/evidence/scratchai_unified_stack_ai_helper.png",
        "docs/classroom/evidence/scratchai_unified_stack_browser_state.json",
    ]
    _write_json(output_path, evidence, args.root)
    _write_text(report_path, render_preview_rehearsal_report(evidence), args.root)
    print(json.dumps(evidence, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
