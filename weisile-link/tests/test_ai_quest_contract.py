import json

from weisile_link.ai_quest_contract import (
    AIQuestContractService,
    MockAIQuestProvider,
    normalize_provider_dataset_response,
    normalize_provider_prediction_response,
    normalize_provider_training_response,
)


def collected_rows():
    return [
        {
            "features": {
                "color_reflected": 10,
                "ultrasonic_cm": 8.0,
                "gyro_angle": 0,
                "touch_pressed": 1,
                "motor_a_pos": 0,
            },
            "label": "obstacle",
            "timestamp": 1716387600123,
        },
        {
            "features": {
                "color_reflected": 12,
                "ultrasonic_cm": 12.0,
                "gyro_angle": 0,
                "touch_pressed": 1,
                "motor_a_pos": 20,
            },
            "label": "obstacle",
            "timestamp": 1716387601123,
        },
        {
            "features": {
                "color_reflected": 70,
                "ultrasonic_cm": 35.0,
                "gyro_angle": 2,
                "touch_pressed": 0,
                "motor_a_pos": 100,
            },
            "label": "safe",
            "timestamp": 1716387602123,
        },
        {
            "features": {
                "color_reflected": 72,
                "ultrasonic_cm": 42.0,
                "gyro_angle": 2,
                "touch_pressed": 0,
                "motor_a_pos": 120,
            },
            "label": "safe",
            "timestamp": 1716387603123,
        },
    ]


def raw_rows():
    return [
        {
            "timestamp": 1716387600123,
            "label": "obstacle",
            "sensor_frame": {
                "type": "sensor_update",
                "timestamp": 1716387600.123,
                "brick_id": "class-brick-1",
                "sensors": {
                    "S2": {
                        "type": "ultrasonic",
                        "distance_cm": 8.0,
                        "distance_inch": 3.15,
                        "private_note": "teacher only",
                    }
                },
                "motors": {"A": {"position": 0, "speed": 30}},
                "system": {
                    "battery_pct": 91,
                    "collect_label": "obstacle",
                    "student_name": "Ada Lovelace",
                },
                "scratch_project_json": {"targets": []},
                "provider_token": "secret-token",
                "local_file_path": "/Users/yukii/private.sb3",
            },
        }
    ]


def test_upload_time_series_sanitizes_raw_ev3_data_boundary():
    provider = MockAIQuestProvider()
    service = AIQuestContractService(provider=provider)

    uploaded = service.upload_time_series(
        rows=collected_rows(),
        raw_rows=raw_rows(),
        brick_id="class-brick-1",
        scope="project",
        scope_id="scratch-project-1",
        consent=True,
    )

    assert uploaded["dataset_id"].startswith("mock-dataset-")
    assert uploaded["uploaded_samples"] == 4
    assert uploaded["scope"] == {
        "type": "project",
        "id": "scratch-project-1",
    }
    assert uploaded["audit"]["provider"] == "mock"
    provider_payload = provider.uploads[-1]
    encoded = json.dumps(provider_payload, sort_keys=True)
    assert "Ada Lovelace" not in encoded
    assert "secret-token" not in encoded
    assert "private.sb3" not in encoded
    assert "scratch_project_json" not in encoded
    assert provider_payload["samples"][0]["sensor_frame"] == {
        "type": "sensor_update",
        "timestamp": 1716387600.123,
        "brick_id": "class-brick-1",
        "sensors": {
            "S2": {
                "type": "ultrasonic",
                "distance_cm": 8.0,
                "distance_inch": 3.15,
            }
        },
        "motors": {"A": {"position": 0, "speed": 30}},
        "system": {
            "battery_pct": 91,
            "collect_label": "obstacle",
        },
    }


def test_provider_responses_normalize_weisileai_and_third_party_shapes():
    dataset = normalize_provider_dataset_response(
        "weisileai",
        {
            "datasetId": "wai-ds-1",
            "status": "ready",
            "sampleCount": 4,
            "auditId": "audit-1",
        },
    )
    training = normalize_provider_training_response(
        "third-party",
        {
            "job": {"id": "job-7", "state": "complete"},
            "model": {"id": "model-7", "accuracy": 0.875},
        },
    )
    prediction = normalize_provider_prediction_response(
        "weisileai",
        {
            "label": "obstacle",
            "score": 0.91,
            "mode": "cloud",
            "modelId": "model-7",
        },
    )

    assert dataset == {
        "dataset_id": "wai-ds-1",
        "status": "ready",
        "uploaded_samples": 4,
        "audit": {"provider": "weisileai", "audit_id": "audit-1"},
    }
    assert training == {
        "job_id": "job-7",
        "status": "succeeded",
        "model_id": "model-7",
        "metrics": {"accuracy": 0.875},
    }
    assert prediction == {
        "label": "obstacle",
        "confidence": 0.91,
        "mode": "cloud",
        "model_id": "model-7",
    }


def test_prediction_uses_cloud_cached_and_local_fallback_modes():
    provider = MockAIQuestProvider()
    service = AIQuestContractService(provider=provider)
    uploaded = service.upload_time_series(
        rows=collected_rows(),
        raw_rows=[],
        brick_id="class-brick-1",
        scope="project",
        scope_id="scratch-project-1",
        consent=True,
    )
    trained = service.start_training(uploaded["dataset_id"])

    cloud = service.predict(
        {"ultrasonic_cm": 9.0, "touch_pressed": 1},
        scope="project",
        scope_id="scratch-project-1",
    )
    provider.available = False
    cached = service.predict(
        {"ultrasonic_cm": 9.0, "touch_pressed": 1},
        scope="project",
        scope_id="scratch-project-1",
    )
    local = AIQuestContractService(provider=MockAIQuestProvider()).predict(
        {"ultrasonic_cm": 9.0, "touch_pressed": 0},
        scope="project",
        scope_id="empty-project",
    )

    assert trained["status"] == "succeeded"
    assert cloud["label"] == "obstacle"
    assert cloud["mode"] == "cloud"
    assert cached["label"] == "obstacle"
    assert cached["mode"] == "cached"
    assert local == {
        "label": "obstacle",
        "confidence": 0.5,
        "mode": "localFallback",
        "model_id": "local-distance-rule",
    }
