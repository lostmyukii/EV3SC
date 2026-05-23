"""Route EV3 sensor updates to Scratch and WeisileAI Trainer consumers.

Sources:
- VSLE spec Section 5.4 defines concurrent Scratch + Trainer routing.
- VSLE spec Section 7.2 defines Scratch notification and Trainer flat JSON.
- VSLE spec Section 8.1 defines Trainer buffering from `sensor_stream`.
- VSLE spec Sections 15-17 define bounded local data and observable failures.
"""

import asyncio
import base64
import csv
import io
import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set

from weisile_link.runtime.degradation import DegradationManager

MAX_LABEL_LENGTH = 64
TRAINING_CSV_FIELDS = [
    "timestamp",
    "label",
    "color_reflected",
    "ultrasonic_cm",
    "gyro_angle",
    "touch_pressed",
    "motor_a_pos",
]


@dataclass(eq=False)
class WebSocketConsumer:
    """A Scratch or Trainer WebSocket sink registered with the router."""

    websocket: Any
    consumer_type: str
    unhealthy: bool = False
    last_error: str = ""

    async def send(self, payload: Any) -> None:
        """Serialize and send either one payload or a list of payloads."""
        payloads = payload if isinstance(payload, list) else [payload]
        for item in payloads:
            await self.websocket.send(json.dumps(item, separators=(",", ":")))

    def mark_unhealthy(self, error: Exception) -> None:
        """Record the latest failed send for health reporting."""
        self.unhealthy = True
        self.last_error = str(error)


class SensorStreamBuffer:
    """Bounded local Trainer buffer derived from Section 8.1 behavior."""

    def __init__(
        self,
        max_points: int = 10_000,
        *,
        manager: Optional[DegradationManager] = None,
    ) -> None:
        self.max_points = max_points
        self.manager = manager
        self.dropped_points = 0
        self._rows: List[Dict[str, Any]] = []
        self._raw_rows: List[Dict[str, Any]] = []

    def record_stream(
        self,
        _system: Dict[str, Any],
        stream: Dict[str, Any],
        raw_sensor_data: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Record one Trainer stream payload when collection is active."""
        if not stream.get("collecting"):
            return False
        if len(self._rows) >= self.max_points:
            self.dropped_points += 1
            self._sync_manager_count()
            return False

        row = {
            "features": self._extract_features(stream),
            "label": _safe_label(stream.get("label", "")),
            "timestamp": int(stream.get("t", 0)),
        }
        self._rows.append(row)
        self._raw_rows.append(
            {
                "timestamp": row["timestamp"],
                "label": row["label"],
                "sensor_frame": dict(raw_sensor_data or {}),
            }
        )
        self._sync_manager_count()
        return True

    def rows(self) -> List[Dict[str, Any]]:
        """Return a copy of all collected training rows."""
        return [
            {
                "features": dict(row["features"]),
                "label": row["label"],
                "timestamp": row["timestamp"],
            }
            for row in self._rows
        ]

    def raw_rows(self) -> List[Dict[str, Any]]:
        """Return collected raw EV3 frames for AI Quest upload."""
        return [
            {
                "timestamp": row["timestamp"],
                "label": row["label"],
                "sensor_frame": dict(row["sensor_frame"]),
            }
            for row in self._raw_rows
        ]

    def clear(self) -> int:
        """Clear the local buffer and return the number of removed rows."""
        cleared = len(self._rows)
        self._rows.clear()
        self._raw_rows.clear()
        self._sync_manager_count()
        return cleared

    def export_csv(self) -> str:
        """Export collected rows as a flat CSV string."""
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=TRAINING_CSV_FIELDS)
        writer.writeheader()
        for row in self._rows:
            flat = {
                "timestamp": row["timestamp"],
                "label": row["label"],
                **row["features"],
            }
            writer.writerow(flat)
        return output.getvalue()

    def _extract_features(self, stream: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "color_reflected": stream.get("color_reflected", 0),
            "ultrasonic_cm": stream.get("ultrasonic_cm", 0),
            "gyro_angle": stream.get("gyro_angle", 0),
            "touch_pressed": 1 if stream.get("touch_pressed") else 0,
            "motor_a_pos": stream.get("motor_a_pos", 0),
        }

    def _sync_manager_count(self) -> None:
        if self.manager is not None:
            self.manager.record_collected_points(len(self._rows))


class SensorDataRouter:
    """Broadcast EV3 sensor data to all registered consumers concurrently."""

    def __init__(
        self,
        *,
        buffer: Optional[SensorStreamBuffer] = None,
        logger: Optional[logging.Logger] = None,
        clock: Any = time.time,
    ) -> None:
        self.consumers: Set[Any] = set()
        self.buffer = buffer or SensorStreamBuffer()
        self.logger = logger or logging.getLogger(__name__)
        self.clock = clock
        self.latest_sensor_data: Dict[str, Any] = {}
        self.latest_trainer_payload: Dict[str, Any] = {}
        self._failure_counts: Dict[str, int] = {}
        self._unhealthy_counts: Dict[str, int] = {}

    def register(self, consumer: Any) -> None:
        """Register a Scratch or Trainer consumer."""
        self.consumers.add(consumer)

    def unregister(self, consumer: Any) -> None:
        """Unregister a Scratch or Trainer consumer."""
        self.consumers.discard(consumer)

    def consumer_count(self, consumer_type: str) -> int:
        """Return registered consumers of one type."""
        return sum(
            1
            for consumer in self.consumers
            if getattr(consumer, "consumer_type", "") == consumer_type
        )

    def failure_count(self, consumer_type: str) -> int:
        """Return send failures counted for one consumer type."""
        return self._failure_counts.get(consumer_type, 0)

    def unhealthy_count(self, consumer_type: str) -> int:
        """Return consumers marked unhealthy for one consumer type."""
        return self._unhealthy_counts.get(consumer_type, 0)

    async def broadcast(self, sensor_data: Dict[str, Any]) -> None:
        """Format and send one EV3 update to Scratch and Trainer consumers."""
        self.latest_sensor_data = dict(sensor_data)
        scratch_payload = self.format_for_scratch(sensor_data)
        trainer_payload = self.format_for_trainer(sensor_data)
        self.latest_trainer_payload = dict(trainer_payload)
        self.buffer.record_stream(
            dict(sensor_data.get("system", {})),
            trainer_payload,
            sensor_data,
        )

        tasks = []
        targets = []
        for consumer in set(self.consumers):
            consumer_type = getattr(consumer, "consumer_type", "")
            if consumer_type == "scratch":
                payload = scratch_payload
            elif consumer_type == "trainer":
                payload = trainer_payload
            else:
                continue
            tasks.append(consumer.send(payload))
            targets.append(consumer)

        if not tasks:
            return

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for consumer, result in zip(targets, results):
            if isinstance(result, Exception):
                self._record_failure(consumer, result)

    def format_for_scratch(
        self,
        sensor_data: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """Return Scratch Link compatible sensor notifications."""
        encoded = base64.b64encode(
            json.dumps(sensor_data, separators=(",", ":")).encode("utf-8")
        ).decode("ascii")
        params = {"message": encoded, "encoding": "base64"}
        return [
            {
                "jsonrpc": "2.0",
                "method": "notifyDeviceDidReceiveMessage",
                "params": params,
            },
            {
                "jsonrpc": "2.0",
                "method": "didReceiveMessage",
                "params": params,
            },
        ]

    def format_for_trainer(self, sensor_data: Dict[str, Any]) -> Dict[str, Any]:
        """Return the flat Section 7.2 Trainer `sensor_stream` payload."""
        sensors = sensor_data.get("sensors", {})
        motors = sensor_data.get("motors", {})
        system = sensor_data.get("system", {})
        color = _sensor_by_type(sensors, "color", "S1")
        ultrasonic = _sensor_by_type(sensors, "ultrasonic", "S2")
        gyro = _sensor_by_type(sensors, "gyro", "S3")
        touch = _sensor_by_type(sensors, "touch", "S4")

        return {
            "type": "sensor_stream",
            "t": _timestamp_ms(sensor_data, self.clock),
            **_brick_identity(sensor_data),
            "color_reflected": color.get("reflected", 0),
            "color_ambient": color.get("ambient", 0),
            "color_id": color.get("color", 0),
            "ultrasonic_cm": ultrasonic.get("distance_cm", 0),
            "gyro_angle": gyro.get("angle", 0),
            "gyro_rate": gyro.get("rate", 0),
            "touch_pressed": bool(touch.get("pressed", False)),
            "motor_a_pos": _motor_position(motors, "A"),
            "motor_b_pos": _motor_position(motors, "B"),
            "battery_pct": system.get("battery_pct", 0),
            "collecting": bool(system.get("collecting", False)),
            "label": _safe_label(system.get("collect_label", "")),
        }

    def _record_failure(self, consumer: Any, error: Exception) -> None:
        consumer_type = getattr(consumer, "consumer_type", "unknown")
        self._failure_counts[consumer_type] = (
            self._failure_counts.get(consumer_type, 0) + 1
        )
        self._unhealthy_counts[consumer_type] = (
            self._unhealthy_counts.get(consumer_type, 0) + 1
        )
        mark_unhealthy = getattr(consumer, "mark_unhealthy", None)
        if mark_unhealthy is not None:
            mark_unhealthy(error)
        self.logger.warning(
            "sensor_broadcast_failed",
            extra={
                "consumer_type": consumer_type,
                "error": repr(error),
            },
        )


def _sensor_by_type(
    sensors: Dict[str, Any],
    sensor_type: str,
    fallback_port: str,
) -> Dict[str, Any]:
    for value in sensors.values():
        if isinstance(value, dict) and value.get("type") == sensor_type:
            return value
    fallback = sensors.get(fallback_port, {})
    return fallback if isinstance(fallback, dict) else {}


def _motor_position(motors: Dict[str, Any], port: str) -> Any:
    value = motors.get(port, {})
    if isinstance(value, dict):
        return value.get("position", 0)
    return 0


def _brick_identity(sensor_data: Dict[str, Any]) -> Dict[str, Any]:
    identity = {}
    if "brick_id" in sensor_data:
        identity["brick_id"] = sensor_data["brick_id"]
    if "brick_name" in sensor_data:
        identity["brick_name"] = sensor_data["brick_name"]
    return identity


def _timestamp_ms(sensor_data: Dict[str, Any], clock: Any) -> int:
    raw = sensor_data.get("timestamp")
    if raw is None:
        return int(float(clock()) * 1000)
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return int(float(clock()) * 1000)
    if value > 1_000_000_000_000:
        return int(value)
    return int(round(value * 1000))


def _safe_label(value: Any) -> str:
    return str(value)[:MAX_LABEL_LENGTH]
