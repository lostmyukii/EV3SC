import asyncio
import base64
import csv
import io
import json

from weisile_link.router.sensor_router import (
    SensorDataRouter,
    SensorStreamBuffer,
)
from weisile_link.runtime.degradation import DegradationManager


class FakeConsumer:
    def __init__(self, consumer_type, *, fail=False):
        self.consumer_type = consumer_type
        self.fail = fail
        self.sent = []
        self.unhealthy_errors = []

    async def send(self, payload):
        if self.fail:
            raise RuntimeError("send failed")
        if isinstance(payload, list):
            self.sent.extend(payload)
        else:
            self.sent.append(payload)

    def mark_unhealthy(self, error):
        self.unhealthy_errors.append(str(error))


def sample_sensor_update(*, collecting=True, label="obstacle"):
    return {
        "type": "sensor_update",
        "timestamp": 1716387600.123,
        "sensors": {
            "S1": {
                "type": "color",
                "reflected": 45,
                "ambient": 12,
                "color": 3,
            },
            "S2": {"type": "ultrasonic", "distance_cm": 23.4},
            "S3": {"type": "gyro", "angle": -12, "rate": 0},
            "S4": {"type": "touch", "pressed": False},
        },
        "motors": {
            "A": {"position": 360},
            "B": {"position": -180},
        },
        "system": {
            "battery_pct": 87,
            "collecting": collecting,
            "collect_label": label,
        },
    }


def decode_scratch_payload(notification):
    encoded = notification["params"]["message"]
    decoded = base64.b64decode(encoded.encode("ascii")).decode("utf-8")
    return json.loads(decoded)


def test_router_broadcasts_scratch_notifications_and_flat_trainer_payload():
    async def scenario():
        router = SensorDataRouter()
        scratch = FakeConsumer("scratch")
        trainer = FakeConsumer("trainer")
        router.register(scratch)
        router.register(trainer)

        await router.broadcast(sample_sensor_update())

        assert [item["method"] for item in scratch.sent] == [
            "notifyDeviceDidReceiveMessage",
            "didReceiveMessage",
        ]
        assert decode_scratch_payload(scratch.sent[0]) == sample_sensor_update()
        assert scratch.sent[1]["params"] == scratch.sent[0]["params"]
        assert trainer.sent == [
            {
                "type": "sensor_stream",
                "t": 1716387600123,
                "color_reflected": 45,
                "color_ambient": 12,
                "color_id": 3,
                "ultrasonic_cm": 23.4,
                "gyro_angle": -12,
                "gyro_rate": 0,
                "touch_pressed": False,
                "motor_a_pos": 360,
                "motor_b_pos": -180,
                "battery_pct": 87,
                "collecting": True,
                "label": "obstacle",
            }
        ]

    asyncio.run(scenario())


def test_router_records_collecting_streams_in_bounded_training_buffer():
    async def scenario():
        manager = DegradationManager(max_collected_points=2)
        buffer = SensorStreamBuffer(max_points=2, manager=manager)
        router = SensorDataRouter(buffer=buffer)

        await router.broadcast(sample_sensor_update(label="safe"))
        await router.broadcast(sample_sensor_update(label="blocked"))
        await router.broadcast(sample_sensor_update(label="overflow"))

        rows = buffer.rows()
        assert len(rows) == 2
        assert rows[0] == {
            "features": {
                "color_reflected": 45,
                "ultrasonic_cm": 23.4,
                "gyro_angle": -12,
                "touch_pressed": 0,
                "motor_a_pos": 360,
            },
            "label": "safe",
            "timestamp": 1716387600123,
        }
        assert rows[1]["label"] == "blocked"
        assert buffer.dropped_points == 1
        assert manager.collected_points == 2

    asyncio.run(scenario())


def test_router_skips_buffer_when_collecting_is_false():
    async def scenario():
        buffer = SensorStreamBuffer(max_points=5)
        router = SensorDataRouter(buffer=buffer)

        await router.broadcast(sample_sensor_update(collecting=False))

        assert buffer.rows() == []

    asyncio.run(scenario())


def test_router_logs_counts_and_marks_failed_consumer_unhealthy():
    async def scenario():
        router = SensorDataRouter()
        scratch = FakeConsumer("scratch", fail=True)
        trainer = FakeConsumer("trainer")
        router.register(scratch)
        router.register(trainer)

        await router.broadcast(sample_sensor_update())

        assert trainer.sent[0]["type"] == "sensor_stream"
        assert router.failure_count("scratch") == 1
        assert router.unhealthy_count("scratch") == 1
        assert scratch.unhealthy_errors == ["send failed"]

    asyncio.run(scenario())


def test_training_buffer_exports_flat_csv_and_can_clear():
    buffer = SensorStreamBuffer(max_points=5)
    buffer.record_stream(
        sample_sensor_update()["system"],
        {
            "type": "sensor_stream",
            "t": 1716387600123,
            "color_reflected": 45,
            "color_ambient": 12,
            "color_id": 3,
            "ultrasonic_cm": 23.4,
            "gyro_angle": -12,
            "gyro_rate": 0,
            "touch_pressed": False,
            "motor_a_pos": 360,
            "motor_b_pos": -180,
            "battery_pct": 87,
            "collecting": True,
            "label": "safe",
        },
    )

    parsed = list(csv.DictReader(io.StringIO(buffer.export_csv())))

    assert parsed == [
        {
            "timestamp": "1716387600123",
            "label": "safe",
            "color_reflected": "45",
            "ultrasonic_cm": "23.4",
            "gyro_angle": "-12",
            "touch_pressed": "0",
            "motor_a_pos": "360",
        }
    ]
    buffer.clear()
    assert buffer.rows() == []
