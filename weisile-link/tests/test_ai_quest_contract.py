import json

import pytest

from weisile_link.ai_quest_contract import (
    AIQuestContractError,
    AIQuestContractService,
    MockAIQuestProvider,
    normalize_provider_dataset_response,
    normalize_provider_prediction_response,
    normalize_provider_training_response,
    strip_ai_quest_metadata_for_sb3,
)
from weisile_link.ai_quest_providers import AIQuestProviderUnavailable


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


def test_upload_status_and_audit_log_record_consent_and_provider_result():
    provider = MockAIQuestProvider()
    service = AIQuestContractService(
        provider=provider,
        clock=lambda: "2026-05-23T10:00:00Z",
    )

    uploaded = service.upload_time_series(
        rows=collected_rows(),
        raw_rows=raw_rows(),
        brick_id="class-brick-1",
        scope="project",
        scope_id="scratch-project-1",
        consent=True,
        metadata={"project_id": "scratch-project-1"},
    )

    status = service.get_upload_status(uploaded["dataset_id"])
    audit = service.get_audit_log()

    assert status == {
        "dataset_id": uploaded["dataset_id"],
        "status": "complete",
        "progress": 100,
        "retryable": False,
        "error": None,
        "audit_id": uploaded["audit"]["audit_id"],
        "updated_at": "2026-05-23T10:00:00Z",
    }
    assert audit[-1] == {
        "event": "dataset.upload.complete",
        "timestamp": "2026-05-23T10:00:00Z",
        "provider": "mock",
        "dataset_id": uploaded["dataset_id"],
        "model_id": "",
        "scope": {"type": "project", "id": "scratch-project-1"},
        "status": "complete",
        "retryable": False,
        "audit_id": uploaded["audit"]["audit_id"],
        "message": "AI Quest dataset upload completed",
    }
    assert "Ada Lovelace" not in json.dumps(audit)
    assert "secret-token" not in json.dumps(audit)


def test_provider_upload_failure_records_failed_status_and_audit_event():
    class FailingUploadProvider(MockAIQuestProvider):
        name = "failing-cloud"

        def upload_dataset(self, payload):
            raise AIQuestProviderUnavailable(
                self.name,
                "upload_dataset",
                "rate limited",
                status_code=429,
            )

    service = AIQuestContractService(
        provider=FailingUploadProvider(),
        clock=lambda: "2026-05-23T10:01:00Z",
    )

    with pytest.raises(AIQuestContractError) as error:
        service.upload_time_series(
            rows=collected_rows(),
            raw_rows=[],
            brick_id="class-brick-1",
            consent=True,
        )

    status = service.get_upload_status()
    audit = service.get_audit_log()

    assert error.value.code == "AIQUEST_PROVIDER_UNAVAILABLE"
    assert error.value.retryable is True
    assert status == {
        "dataset_id": "",
        "status": "failed",
        "progress": 0,
        "retryable": True,
        "error": {
            "code": "AIQUEST_PROVIDER_UNAVAILABLE",
            "message": "AI Quest provider is unavailable",
        },
        "audit_id": "",
        "updated_at": "2026-05-23T10:01:00Z",
    }
    assert audit[-1]["event"] == "dataset.upload.failed"
    assert audit[-1]["provider"] == "failing-cloud"
    assert audit[-1]["retryable"] is True
    assert audit[-1]["message"] == "AI Quest provider is unavailable"


def test_missing_consent_records_failed_status_and_audit_event():
    provider = MockAIQuestProvider()
    service = AIQuestContractService(
        provider=provider,
        clock=lambda: "2026-05-23T10:01:30Z",
    )

    with pytest.raises(AIQuestContractError) as error:
        service.upload_time_series(
            rows=collected_rows(),
            raw_rows=[],
            brick_id="class-brick-1",
            consent=False,
        )

    assert error.value.code == "AIQUEST_CONSENT_REQUIRED"
    assert service.get_upload_status() == {
        "dataset_id": "",
        "status": "failed",
        "progress": 0,
        "retryable": False,
        "error": {
            "code": "AIQUEST_CONSENT_REQUIRED",
            "message": "AI Quest upload requires explicit consent",
        },
        "audit_id": "",
        "updated_at": "2026-05-23T10:01:30Z",
    }
    assert service.get_audit_log()[-1]["event"] == "dataset.upload.rejected"
    assert provider.uploads == []


def test_delete_dataset_and_model_remove_local_references_and_write_audit():
    provider = MockAIQuestProvider()
    service = AIQuestContractService(
        provider=provider,
        clock=lambda: "2026-05-23T10:02:00Z",
    )
    uploaded = service.upload_time_series(
        rows=collected_rows(),
        raw_rows=[],
        brick_id="class-brick-1",
        scope="courseTask",
        scope_id="task-9",
        consent=True,
    )
    trained = service.start_training(uploaded["dataset_id"])

    dataset_delete = service.delete_dataset(uploaded["dataset_id"])
    model_delete = service.delete_model(trained["model_id"])

    assert dataset_delete == {
        "dataset_id": uploaded["dataset_id"],
        "status": "deleted",
        "raw_dataset_retained": False,
        "provider": "mock",
        "audit_id": "mock-delete-dataset-1",
    }
    assert model_delete == {
        "model_id": trained["model_id"],
        "status": "deleted",
        "cached_model_retained": False,
        "provider": "mock",
        "audit_id": "mock-delete-model-1",
    }
    assert uploaded["dataset_id"] not in service.datasets
    assert trained["model_id"] not in service.models
    assert trained["model_id"] not in service.cached_models
    assert service.active_models == {}
    assert [entry["event"] for entry in service.get_audit_log()[-2:]] == [
        "dataset.delete.complete",
        "model.delete.complete",
    ]


def test_publish_list_withdraw_and_select_shared_models_by_scope():
    provider = MockAIQuestProvider()
    service = AIQuestContractService(
        provider=provider,
        clock=lambda: "2026-05-23T10:03:00Z",
    )
    uploaded = service.upload_time_series(
        rows=collected_rows(),
        raw_rows=[],
        brick_id="class-brick-1",
        scope="project",
        scope_id="student-project-7",
        consent=True,
    )
    trained = service.start_training(uploaded["dataset_id"])

    published = service.publish_model(
        trained["model_id"],
        scope="classSession",
        scope_id="class-7a",
    )
    listed = service.list_models(
        scope="classSession",
        scope_id="class-7a",
    )
    selected = service.select_model(
        trained["model_id"],
        scope="classSession",
        scope_id="class-7a",
    )
    prediction = service.predict(
        {"ultrasonic_cm": 9.0, "touch_pressed": 1},
        scope="classSession",
        scope_id="class-7a",
    )
    withdrawn = service.withdraw_model(
        trained["model_id"],
        scope="classSession",
        scope_id="class-7a",
    )
    listed_after_withdraw = service.list_models(
        scope="classSession",
        scope_id="class-7a",
    )

    assert published == {
        "model_id": trained["model_id"],
        "scope": {"type": "classSession", "id": "class-7a"},
        "status": "published",
        "shared": True,
        "cached": True,
        "metrics": trained["metrics"],
        "safe_reference": {
            "model_id": trained["model_id"],
            "scope": {"type": "classSession", "id": "class-7a"},
        },
    }
    assert listed == {
        "scope": {"type": "classSession", "id": "class-7a"},
        "models": [published],
    }
    assert "rule" not in json.dumps(listed)
    assert "rows" not in json.dumps(listed)
    assert selected == {
        "model_id": trained["model_id"],
        "scope": {"type": "classSession", "id": "class-7a"},
        "status": "selected",
        "cached": True,
        "prediction_mode": "cloud",
    }
    assert prediction["mode"] == "cloud"
    assert withdrawn == {
        "model_id": trained["model_id"],
        "scope": {"type": "classSession", "id": "class-7a"},
        "status": "withdrawn",
        "shared": False,
    }
    assert listed_after_withdraw == {
        "scope": {"type": "classSession", "id": "class-7a"},
        "models": [],
    }
    assert ("classSession", "class-7a") not in service.active_models
    assert [entry["event"] for entry in service.get_audit_log()[-2:]] == [
        "model.publish.complete",
        "model.withdraw.complete",
    ]


def test_cached_model_controls_and_prediction_mode_reporting():
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
    model_id = trained["model_id"]

    cached = service.cache_model(model_id)
    provider.available = False
    selected_cached = service.use_cached_model(
        model_id,
        scope="project",
        scope_id="scratch-project-1",
    )
    cached_mode = service.get_prediction_mode(
        scope="project",
        scope_id="scratch-project-1",
    )
    cached_prediction = service.predict(
        {"ultrasonic_cm": 9.0, "touch_pressed": 1},
        scope="project",
        scope_id="scratch-project-1",
    )
    cleared = service.clear_model_cache(model_id)
    fallback_mode = service.get_prediction_mode(
        scope="project",
        scope_id="scratch-project-1",
    )
    fallback_prediction = service.predict(
        {"ultrasonic_cm": 9.0, "touch_pressed": 1},
        scope="project",
        scope_id="scratch-project-1",
    )

    assert cached == {
        "model_id": model_id,
        "status": "cached",
        "cached_model_retained": True,
    }
    assert selected_cached == {
        "model_id": model_id,
        "scope": {"type": "project", "id": "scratch-project-1"},
        "status": "selected",
        "cached": True,
        "prediction_mode": "cached",
    }
    assert cached_mode == {
        "scope": {"type": "project", "id": "scratch-project-1"},
        "model_id": model_id,
        "mode": "cached",
        "cached": True,
    }
    assert cached_prediction["mode"] == "cached"
    assert cleared == {
        "model_id": model_id,
        "status": "cleared",
        "cleared_count": 1,
        "cached_model_retained": False,
    }
    assert fallback_mode == {
        "scope": {"type": "project", "id": "scratch-project-1"},
        "model_id": model_id,
        "mode": "localFallback",
        "cached": False,
    }
    assert fallback_prediction["mode"] == "localFallback"


def test_strip_ai_quest_metadata_for_pure_sb3_export():
    project_json = {
        "targets": [
            {
                "name": "Sprite1",
                "blocks": {
                    "normal": {
                        "opcode": "motion_movesteps",
                        "next": None,
                    },
                },
                "aiQuestModelRefs": [
                    {"model_id": "model-1", "scope": "class-7a"}
                ],
            }
        ],
        "extensions": ["pen", "vsleev3"],
        "meta": {
            "semver": "3.0.0",
            "aiQuest": {
                "activeModel": "model-1",
                "providerToken": "secret",
            },
        },
        "aiQuestRawDatasets": [{"student_name": "Ada"}],
        "providerCredentials": {"token": "secret-token"},
    }

    pure = strip_ai_quest_metadata_for_sb3(project_json)

    assert pure == {
        "targets": [
            {
                "name": "Sprite1",
                "blocks": {
                    "normal": {
                        "opcode": "motion_movesteps",
                        "next": None,
                    },
                },
            }
        ],
        "extensions": ["pen", "vsleev3"],
        "meta": {"semver": "3.0.0"},
    }
    encoded = json.dumps(pure)
    assert "model-1" not in encoded
    assert "secret" not in encoded
    assert "Ada" not in encoded
