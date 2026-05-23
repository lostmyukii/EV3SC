import json

import pytest

from weisile_link.ai_quest_contract import (
    AIQuestContractError,
    AIQuestContractService,
)
from weisile_link.ai_quest_providers import (
    AIQuestHttpError,
    AIQuestProviderConfig,
    MockAIQuestProvider,
    ThirdPartyAIQuestProviderAdapter,
    WeisileAIProviderShell,
    build_ai_quest_provider_from_env,
)

from tests.test_ai_quest_contract import collected_rows


class RecordingHttpClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def request_json(self, method, url, *, headers, payload, timeout_seconds):
        self.calls.append(
            {
                "method": method,
                "url": url,
                "headers": dict(headers),
                "payload": payload,
                "timeout_seconds": timeout_seconds,
            }
        )
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def test_provider_factory_selects_server_side_provider_from_env():
    weisile = build_ai_quest_provider_from_env(
        {
            "AI_QUEST_PROVIDER": "weisileai",
            "WEISILE_AIQUEST_ENDPOINT": "https://aiquest.example/api",
            "WEISILE_AIQUEST_TOKEN": "server-secret",
        }
    )
    third_party = build_ai_quest_provider_from_env(
        {
            "AI_QUEST_PROVIDER": "mock-third-party",
            "AI_QUEST_THIRD_PARTY_ENDPOINT": "https://models.example/v1",
            "AI_QUEST_THIRD_PARTY_TOKEN": "third-secret",
        }
    )
    preview = build_ai_quest_provider_from_env({})

    assert isinstance(weisile, WeisileAIProviderShell)
    assert isinstance(third_party, ThirdPartyAIQuestProviderAdapter)
    assert isinstance(preview, MockAIQuestProvider)
    assert "server-secret" not in json.dumps(weisile.safe_diagnostics())


def test_weisileai_shell_retries_retryable_upload_without_leaking_token():
    client = RecordingHttpClient(
        [
            AIQuestHttpError(503, "temporary cloud outage"),
            {
                "datasetId": "wai-dataset-1",
                "status": "ready",
                "sampleCount": 4,
                "auditId": "audit-7",
            },
        ]
    )
    provider = WeisileAIProviderShell(
        AIQuestProviderConfig(
            name="weisileai",
            base_url="https://aiquest.example/api/",
            token="server-secret",
            timeout_seconds=3.5,
            max_retries=1,
        ),
        http_client=client,
    )

    response = provider.upload_dataset(
        {
            "brick_id": "class-brick-1",
            "scope": {"type": "project", "id": "scratch-project-1"},
            "samples": [{"label": "obstacle"}] * 4,
            "rows": collected_rows(),
            "metadata": {},
        }
    )

    assert response["datasetId"] == "wai-dataset-1"
    assert [call["method"] for call in client.calls] == ["POST", "POST"]
    assert client.calls[0]["url"] == (
        "https://aiquest.example/api/v1/ev3/datasets"
    )
    assert client.calls[0]["headers"]["Authorization"] == (
        "Bearer server-secret"
    )
    assert client.calls[0]["timeout_seconds"] == 3.5
    assert "server-secret" not in json.dumps(response)


def test_weisileai_shell_deletes_dataset_and_model_without_token_leak():
    client = RecordingHttpClient(
        [
            {"deleted": True, "auditId": "audit-delete-ds"},
            {"deleted": True, "auditId": "audit-delete-model"},
        ]
    )
    provider = WeisileAIProviderShell(
        AIQuestProviderConfig(
            name="weisileai",
            base_url="https://aiquest.example/api",
            token="server-secret",
        ),
        http_client=client,
    )

    dataset = provider.delete_dataset("wai-dataset-1")
    model = provider.delete_model("wai-model-1")

    assert dataset == {
        "datasetId": "wai-dataset-1",
        "status": "deleted",
        "auditId": "audit-delete-ds",
    }
    assert model == {
        "modelId": "wai-model-1",
        "status": "deleted",
        "auditId": "audit-delete-model",
    }
    assert [call["method"] for call in client.calls] == ["DELETE", "DELETE"]
    assert client.calls[0]["url"] == (
        "https://aiquest.example/api/v1/ev3/datasets/wai-dataset-1"
    )
    assert client.calls[1]["url"] == (
        "https://aiquest.example/api/v1/ev3/models/wai-model-1"
    )
    assert "server-secret" not in json.dumps(dataset)
    assert "server-secret" not in json.dumps(model)


def test_third_party_adapter_normalizes_shapes_behind_contract():
    model_rules = {
        "schemaVersion": "vsle-ai-trainer-model-rules-v1",
        "model": {"id": "tp-model-1", "accuracy": 0.92},
        "rule": {
            "feature": "ultrasonic_cm",
            "threshold": 20,
            "trueLabel": "obstacle",
            "falseLabel": "safe",
        },
    }
    client = RecordingHttpClient(
        [
            {
                "id": "tp-dataset-1",
                "state": "accepted",
                "items": 4,
                "audit": {"id": "tp-audit-1"},
            },
            {
                "trainingRun": "tp-job-1",
                "artifact": "tp-model-1",
                "state": "complete",
                "quality": {"accuracy": 0.92},
                "rules": model_rules,
            },
            {
                "prediction": "obstacle",
                "probability": 0.91,
                "model": "tp-model-1",
            },
            {"rules": model_rules, "providerToken": "must-not-leak"},
        ]
    )
    provider = ThirdPartyAIQuestProviderAdapter(
        AIQuestProviderConfig(
            name="mock-third-party",
            base_url="https://models.example/v1",
            token="third-secret",
        ),
        http_client=client,
    )
    service = AIQuestContractService(provider=provider)

    dataset = service.upload_time_series(
        rows=collected_rows(),
        raw_rows=[],
        brick_id="class-brick-1",
        scope="classSession",
        scope_id="class-7a",
        consent=True,
    )
    training = service.start_training(dataset["dataset_id"])
    prediction = service.predict(
        {"ultrasonic_cm": 8.0},
        scope="classSession",
        scope_id="class-7a",
    )
    exported = service.export_model(training["model_id"])

    assert dataset["dataset_id"] == "tp-dataset-1"
    assert dataset["status"] == "ready"
    assert dataset["audit"] == {
        "provider": "mock-third-party",
        "audit_id": "tp-audit-1",
    }
    assert training == {
        "job_id": "tp-job-1",
        "status": "succeeded",
        "model_id": "tp-model-1",
        "metrics": {"accuracy": 0.92},
    }
    assert prediction == {
        "label": "obstacle",
        "confidence": 0.91,
        "mode": "cloud",
        "model_id": "tp-model-1",
    }
    assert "providerToken" not in exported["json"]
    assert "third-secret" not in exported["json"]


def test_cloud_model_reference_predicts_even_without_cached_rules():
    client = RecordingHttpClient(
        [
            {
                "datasetId": "wai-dataset-2",
                "status": "ready",
                "sampleCount": 4,
                "auditId": "audit-8",
            },
            {
                "jobId": "wai-job-2",
                "status": "complete",
                "modelId": "wai-model-2",
                "metrics": {"accuracy": 0.88},
            },
            {
                "label": "safe",
                "confidence": 0.86,
                "mode": "cloud",
                "modelId": "wai-model-2",
            },
        ]
    )
    provider = WeisileAIProviderShell(
        AIQuestProviderConfig(
            name="weisileai",
            base_url="https://aiquest.example/api",
            token="server-secret",
        ),
        http_client=client,
    )
    service = AIQuestContractService(provider=provider)

    dataset = service.upload_time_series(
        rows=collected_rows(),
        raw_rows=[],
        brick_id="class-brick-1",
        scope="project",
        scope_id="scratch-project-2",
        consent=True,
    )
    training = service.start_training(dataset["dataset_id"])
    prediction = service.predict(
        {"ultrasonic_cm": 42.0},
        scope="project",
        scope_id="scratch-project-2",
    )

    assert training["model_id"] == "wai-model-2"
    assert prediction == {
        "label": "safe",
        "confidence": 0.86,
        "mode": "cloud",
        "model_id": "wai-model-2",
    }
    assert client.calls[-1]["url"] == (
        "https://aiquest.example/api/v1/ev3/models/wai-model-2/predict"
    )


def test_retry_exhaustion_maps_to_retryable_contract_error():
    client = RecordingHttpClient(
        [
            AIQuestHttpError(429, "rate limited"),
            AIQuestHttpError(429, "rate limited"),
        ]
    )
    provider = WeisileAIProviderShell(
        AIQuestProviderConfig(
            name="weisileai",
            base_url="https://aiquest.example/api",
            token="server-secret",
            max_retries=1,
        ),
        http_client=client,
    )
    service = AIQuestContractService(provider=provider)

    with pytest.raises(AIQuestContractError) as error:
        service.upload_time_series(
            rows=collected_rows(),
            raw_rows=[],
            brick_id="class-brick-1",
            consent=True,
        )

    assert error.value.code == "AIQUEST_PROVIDER_UNAVAILABLE"
    assert error.value.retryable is True
    assert error.value.data == {
        "provider": "weisileai",
        "operation": "upload_dataset",
        "status_code": 429,
    }
    assert "server-secret" not in json.dumps(error.value.data)
