"""AI Quest cloud provider adapters used behind the EV3SC contract.

Sources:
- ScratchAI VSLE-EV3 integration design Sections 8, 9, 11, and 13.
- VSLE Scratch-EV3 platform spec Sections 10.6 and 15.
- Python standard library ``urllib.request`` for dependency-free HTTPS calls.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin
from urllib.request import Request, urlopen

from weisile_link.trainer_pipeline import (
    export_model_rules,
    train_decision_tree,
)

REDACTED = "[redacted]"
SECRET_KEYS = {
    "api_key",
    "apiKey",
    "authorization",
    "password",
    "providerToken",
    "secret",
    "token",
}


class AIQuestHttpError(Exception):
    """HTTP failure raised by provider HTTP clients."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = int(status_code)
        self.message = str(message)

    @property
    def retryable(self) -> bool:
        return self.status_code == 429 or self.status_code >= 500


class AIQuestProviderOperationError(Exception):
    """Provider operation failed with safe, contract-mappable metadata."""

    def __init__(
        self,
        provider: str,
        operation: str,
        message: str,
        *,
        retryable: bool,
        status_code: Optional[int] = None,
        data: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.provider = provider
        self.operation = operation
        self.message = message
        self.retryable = retryable
        self.status_code = status_code
        self.data = data or {}

    def contract_data(self) -> Dict[str, Any]:
        data = {
            "provider": self.provider,
            "operation": self.operation,
        }
        if self.status_code is not None:
            data["status_code"] = self.status_code
        data.update(redact_provider_secrets(self.data))
        return data


class AIQuestProviderUnavailable(AIQuestProviderOperationError):
    """Retryable cloud-provider failure."""

    def __init__(
        self,
        provider: str,
        operation: str,
        message: str,
        *,
        status_code: Optional[int] = None,
        data: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(
            provider,
            operation,
            message,
            retryable=True,
            status_code=status_code,
            data=data,
        )


class AIQuestProviderBadResponse(AIQuestProviderOperationError):
    """Non-retryable provider response that cannot be normalized."""

    def __init__(
        self,
        provider: str,
        operation: str,
        message: str,
        *,
        status_code: Optional[int] = None,
        data: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(
            provider,
            operation,
            message,
            retryable=False,
            status_code=status_code,
            data=data,
        )


@dataclass(frozen=True)
class AIQuestProviderConfig:
    """Server-side provider settings. Tokens are never returned to Scratch."""

    name: str
    base_url: str
    token: str = ""
    timeout_seconds: float = 5.0
    max_retries: int = 2

    def endpoint(self, path: str) -> str:
        base = self.base_url.rstrip("/") + "/"
        return urljoin(base, path.lstrip("/"))

    def safe_diagnostics(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "base_url": self.base_url,
            "token_configured": bool(self.token),
            "timeout_seconds": self.timeout_seconds,
            "max_retries": self.max_retries,
        }


class UrllibAIQuestHttpClient:
    """Small JSON HTTP client using Python stdlib only."""

    def request_json(
        self,
        method: str,
        url: str,
        *,
        headers: Dict[str, str],
        payload: Optional[Dict[str, Any]],
        timeout_seconds: float,
    ) -> Dict[str, Any]:
        body = None
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
        request = Request(
            url,
            data=body,
            headers=headers,
            method=method,
        )
        try:
            with urlopen(request, timeout=timeout_seconds) as response:
                raw = response.read().decode("utf-8")
        except HTTPError as exc:
            raw_error = exc.read().decode("utf-8", errors="replace")
            raise AIQuestHttpError(exc.code, raw_error or str(exc)) from exc
        except URLError as exc:
            raise ConnectionError(str(exc.reason)) from exc

        if not raw:
            return {}
        try:
            decoded = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValueError("Provider response is not valid JSON") from exc
        if not isinstance(decoded, dict):
            raise TypeError("Provider response JSON must be an object")
        return decoded


class _HttpProviderBase:
    def __init__(
        self,
        config: AIQuestProviderConfig,
        *,
        http_client: Any = None,
    ) -> None:
        self.config = config
        self.name = config.name
        self.http_client = http_client or UrllibAIQuestHttpClient()

    def safe_diagnostics(self) -> Dict[str, Any]:
        return self.config.safe_diagnostics()

    def _headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-AIQuest-Provider": self.name,
        }
        if self.config.token:
            headers["Authorization"] = f"Bearer {self.config.token}"
        return headers

    def _request(
        self,
        operation: str,
        method: str,
        path: str,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        attempts = self.config.max_retries + 1
        last_error: Optional[Exception] = None
        for _attempt in range(attempts):
            try:
                response = self.http_client.request_json(
                    method,
                    self.config.endpoint(path),
                    headers=self._headers(),
                    payload=payload,
                    timeout_seconds=self.config.timeout_seconds,
                )
                if not isinstance(response, dict):
                    raise AIQuestProviderBadResponse(
                        self.name,
                        operation,
                        "Provider response JSON must be an object",
                    )
                return response
            except AIQuestHttpError as exc:
                last_error = exc
                if exc.retryable:
                    continue
                raise AIQuestProviderBadResponse(
                    self.name,
                    operation,
                    exc.message,
                    status_code=exc.status_code,
                ) from exc
            except AIQuestProviderOperationError:
                raise
            except (TypeError, ValueError) as exc:
                raise AIQuestProviderBadResponse(
                    self.name,
                    operation,
                    str(exc),
                ) from exc
            except (ConnectionError, OSError, TimeoutError) as exc:
                last_error = exc
                continue

        status_code = (
            last_error.status_code
            if isinstance(last_error, AIQuestHttpError)
            else None
        )
        raise AIQuestProviderUnavailable(
            self.name,
            operation,
            str(last_error or "provider unavailable"),
            status_code=status_code,
        )


class WeisileAIProviderShell(_HttpProviderBase):
    """Default WeisileAI / AI Quest provider boundary."""

    def upload_dataset(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._request(
            "upload_dataset",
            "POST",
            "/v1/ev3/datasets",
            redact_provider_secrets(payload),
        )

    def start_training(
        self,
        dataset_id: str,
        rows: Sequence[Dict[str, Any]],
        *,
        accuracy_gate: float,
    ) -> Dict[str, Any]:
        return self._request(
            "start_training",
            "POST",
            "/v1/ev3/training-jobs",
            {
                "dataset_id": dataset_id,
                "datasetId": dataset_id,
                "rows": list(rows),
                "accuracy_gate": accuracy_gate,
                "accuracyGate": accuracy_gate,
            },
        )

    def predict(
        self,
        model_id: str,
        features: Dict[str, Any],
    ) -> Dict[str, Any]:
        return self._request(
            "predict",
            "POST",
            f"/v1/ev3/models/{quote(model_id)}/predict",
            {"model_id": model_id, "modelId": model_id, "features": features},
        )

    def export_model(self, model_id: str) -> str:
        response = self._request(
            "export_model",
            "GET",
            f"/v1/ev3/models/{quote(model_id)}/export",
        )
        return _safe_export_json(response)

    def delete_dataset(self, dataset_id: str) -> Dict[str, Any]:
        response = self._request(
            "delete_dataset",
            "DELETE",
            f"/v1/ev3/datasets/{quote(dataset_id)}",
        )
        return {
            "datasetId": dataset_id,
            "status": "deleted",
            "auditId": str(response.get("auditId") or ""),
        }

    def delete_model(self, model_id: str) -> Dict[str, Any]:
        response = self._request(
            "delete_model",
            "DELETE",
            f"/v1/ev3/models/{quote(model_id)}",
        )
        return {
            "modelId": model_id,
            "status": "deleted",
            "auditId": str(response.get("auditId") or ""),
        }


class ThirdPartyAIQuestProviderAdapter(_HttpProviderBase):
    """Adapter for generic model services behind the AI Quest contract."""

    def upload_dataset(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        response = self._request(
            "upload_dataset",
            "POST",
            "/datasets",
            {
                "device": payload.get("brick_id", ""),
                "scope": payload.get("scope", {}),
                "samples": payload.get("samples", []),
                "features": payload.get("rows", []),
                "metadata": payload.get("metadata", {}),
            },
        )
        return {
            "id": response.get("id") or response.get("dataset"),
            "state": _third_party_state(response.get("state")),
            "items": response.get("items") or response.get("count") or 0,
            "audit": response.get("audit", {}),
        }

    def start_training(
        self,
        dataset_id: str,
        rows: Sequence[Dict[str, Any]],
        *,
        accuracy_gate: float,
    ) -> Dict[str, Any]:
        response = self._request(
            "start_training",
            "POST",
            "/training-jobs",
            {
                "dataset": dataset_id,
                "trainingRows": list(rows),
                "minimumAccuracy": accuracy_gate,
            },
        )
        return {
            "jobId": response.get("trainingRun") or response.get("job"),
            "status": _third_party_state(response.get("state")),
            "modelId": response.get("artifact") or response.get("model"),
            "metrics": {
                "accuracy": (
                    response.get("quality", {}).get("accuracy")
                    if isinstance(response.get("quality"), dict)
                    else response.get("accuracy", 0)
                )
            },
            "modelRules": response.get("rules")
            or response.get("modelRules")
            or {},
        }

    def predict(
        self,
        model_id: str,
        features: Dict[str, Any],
    ) -> Dict[str, Any]:
        response = self._request(
            "predict",
            "POST",
            f"/models/{quote(model_id)}/predict",
            {"model": model_id, "input": features},
        )
        return {
            "label": response.get("prediction") or response.get("label"),
            "confidence": (
                response.get("probability")
                if "probability" in response
                else response.get("confidence", 0)
            ),
            "mode": "cloud",
            "modelId": response.get("model") or model_id,
        }

    def export_model(self, model_id: str) -> str:
        response = self._request(
            "export_model",
            "GET",
            f"/models/{quote(model_id)}/export",
        )
        return _safe_export_json(response)

    def delete_dataset(self, dataset_id: str) -> Dict[str, Any]:
        response = self._request(
            "delete_dataset",
            "DELETE",
            f"/datasets/{quote(dataset_id)}",
        )
        return {
            "id": dataset_id,
            "state": "deleted",
            "audit": response.get("audit", {}),
        }

    def delete_model(self, model_id: str) -> Dict[str, Any]:
        response = self._request(
            "delete_model",
            "DELETE",
            f"/models/{quote(model_id)}",
        )
        return {
            "id": model_id,
            "state": "deleted",
            "audit": response.get("audit", {}),
        }


class MockAIQuestProvider:
    """Deterministic local provider used by tests and classroom preview."""

    name = "mock"

    def __init__(self) -> None:
        self.available = True
        self.uploads: List[Dict[str, Any]] = []
        self._datasets: Dict[str, Sequence[Dict[str, Any]]] = {}
        self._models: Dict[str, Dict[str, Any]] = {}
        self._counter = 0
        self._deleted_datasets = 0
        self._deleted_models = 0

    def safe_diagnostics(self) -> Dict[str, Any]:
        return {"name": self.name, "local_preview": True}

    def upload_dataset(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        self._counter += 1
        dataset_id = f"mock-dataset-{self._counter}"
        safe_payload = redact_provider_secrets(payload)
        self.uploads.append(safe_payload)
        self._datasets[dataset_id] = safe_payload["rows"]
        return {
            "id": dataset_id,
            "state": "ready",
            "items": len(safe_payload["samples"]),
            "auditId": f"mock-audit-{self._counter}",
        }

    def start_training(
        self,
        dataset_id: str,
        rows: Sequence[Dict[str, Any]],
        *,
        accuracy_gate: float,
    ) -> Dict[str, Any]:
        model = train_decision_tree(rows, accuracy_gate=accuracy_gate)
        model_id = f"mock-model-{len(self._models) + 1}"
        model["model"]["id"] = model_id
        self._models[model_id] = model
        return {
            "job": {"id": f"mock-job-{len(self._models)}", "state": "done"},
            "model": {
                "id": model_id,
                "accuracy": model["model"]["accuracy"],
            },
            "modelRules": model,
        }

    def predict(
        self,
        model_id: str,
        features: Dict[str, Any],
    ) -> Dict[str, Any]:
        if not self.available:
            raise AIQuestProviderUnavailable(
                self.name,
                "predict",
                "AI Quest provider unavailable",
            )
        model = self._models[model_id]
        label = _predict_rules(model, features)
        return {
            "label": label,
            "score": model["model"]["accuracy"],
            "mode": "cloud",
            "modelId": model_id,
        }

    def export_model(self, model_id: str) -> str:
        return export_model_rules(self._models[model_id])

    def delete_dataset(self, dataset_id: str) -> Dict[str, Any]:
        self._deleted_datasets += 1
        self._datasets.pop(dataset_id, None)
        return {
            "id": dataset_id,
            "state": "deleted",
            "auditId": f"mock-delete-dataset-{self._deleted_datasets}",
        }

    def delete_model(self, model_id: str) -> Dict[str, Any]:
        self._deleted_models += 1
        self._models.pop(model_id, None)
        return {
            "id": model_id,
            "state": "deleted",
            "auditId": f"mock-delete-model-{self._deleted_models}",
        }


def build_ai_quest_provider_from_env(
    env: Optional[Mapping[str, str]] = None,
    *,
    http_client: Any = None,
) -> Any:
    """Build the server-side provider from environment configuration."""
    values = env if env is not None else os.environ
    provider_name = str(values.get("AI_QUEST_PROVIDER", "")).strip().lower()
    if not provider_name:
        if values.get("WEISILE_AIQUEST_ENDPOINT"):
            provider_name = "weisileai"
        else:
            return MockAIQuestProvider()

    if provider_name in {"mock", "local", "preview"}:
        return MockAIQuestProvider()

    if provider_name in {"weisileai", "weisile-ai", "aiquest"}:
        config = AIQuestProviderConfig(
            name="weisileai",
            base_url=_required_env(values, "WEISILE_AIQUEST_ENDPOINT"),
            token=str(values.get("WEISILE_AIQUEST_TOKEN", "")),
            timeout_seconds=_float_env(values, "AI_QUEST_TIMEOUT_SECONDS", 5.0),
            max_retries=_int_env(values, "AI_QUEST_MAX_RETRIES", 2),
        )
        return WeisileAIProviderShell(config, http_client=http_client)

    if provider_name in {"mock-third-party", "third-party", "thirdparty"}:
        config = AIQuestProviderConfig(
            name="mock-third-party",
            base_url=_required_env(values, "AI_QUEST_THIRD_PARTY_ENDPOINT"),
            token=str(values.get("AI_QUEST_THIRD_PARTY_TOKEN", "")),
            timeout_seconds=_float_env(values, "AI_QUEST_TIMEOUT_SECONDS", 5.0),
            max_retries=_int_env(values, "AI_QUEST_MAX_RETRIES", 2),
        )
        return ThirdPartyAIQuestProviderAdapter(
            config,
            http_client=http_client,
        )

    raise ValueError(f"Unsupported AI Quest provider: {provider_name}")


def redact_provider_secrets(value: Any) -> Any:
    """Return JSON-safe data with provider secrets removed."""
    if isinstance(value, dict):
        redacted: Dict[str, Any] = {}
        for key, item in value.items():
            if str(key) in SECRET_KEYS:
                continue
            redacted[str(key)] = redact_provider_secrets(item)
        return redacted
    if isinstance(value, list):
        return [redact_provider_secrets(item) for item in value]
    if isinstance(value, tuple):
        return [redact_provider_secrets(item) for item in value]
    return value


def _safe_export_json(response: Dict[str, Any]) -> str:
    safe_response = redact_provider_secrets(response)
    if isinstance(safe_response.get("json"), str):
        return safe_response["json"]
    if isinstance(safe_response.get("rules"), dict):
        return json.dumps(safe_response["rules"], sort_keys=True)
    return json.dumps(safe_response, sort_keys=True)


def _third_party_state(value: Any) -> str:
    normalized = str(value or "").lower()
    if normalized in {"accepted", "ok", "created"}:
        return "ready"
    if normalized in {"complete", "completed"}:
        return "succeeded"
    return normalized or "ready"


def _predict_rules(model: Dict[str, Any], features: Dict[str, Any]) -> str:
    rule = model.get("rule", {})
    feature = str(rule.get("feature", ""))
    threshold = _safe_float(rule.get("threshold", 0))
    value = _safe_float(features.get(feature, 0))
    if value <= threshold:
        return str(rule.get("trueLabel", ""))
    return str(rule.get("falseLabel", ""))


def _required_env(values: Mapping[str, str], key: str) -> str:
    value = str(values.get(key, "")).strip()
    if not value:
        raise ValueError(f"{key} is required for configured AI Quest provider")
    return value


def _float_env(
    values: Mapping[str, str],
    key: str,
    default: float,
) -> float:
    try:
        return float(values.get(key, default))
    except (TypeError, ValueError):
        return default


def _int_env(values: Mapping[str, str], key: str, default: int) -> int:
    try:
        return max(0, int(values.get(key, default)))
    except (TypeError, ValueError):
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
