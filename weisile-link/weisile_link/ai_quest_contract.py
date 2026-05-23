"""Project-defined AI Quest contract for EV3 sensor model workflows.

Sources:
- VSLE Scratch-EV3 platform spec Sections 8, 10, and 15.
- ScratchAI VSLE-EV3 integration design Sections 8-11.
- Existing local Trainer pipeline in ``weisile_link.trainer_pipeline``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from weisile_link.ai_quest_providers import (
    AIQuestProviderOperationError,
    AIQuestProviderUnavailable,
    MockAIQuestProvider,
    build_ai_quest_provider_from_env,
)
from weisile_link.trainer_pipeline import (
    DEFAULT_ACCURACY_GATE,
    TrainerPipelineError,
    export_model_rules,
)

MODEL_SCOPES = {"project", "classSession", "courseTask"}
PREDICTION_MODES = {"cloud", "cached", "localFallback"}
LOCAL_FALLBACK_MODEL_ID = "local-distance-rule"
DEFAULT_PROJECT_SCOPE_ID = "scratch-project"

ALLOWED_SENSOR_FIELDS = {
    "type",
    "color",
    "reflected",
    "ambient",
    "rgb",
    "distance_cm",
    "distance_inch",
    "angle",
    "rate",
    "pressed",
    "proximity",
    "distance",
    "beacon",
    "remote",
}
ALLOWED_MOTOR_FIELDS = {"position", "speed", "running"}
ALLOWED_SYSTEM_FIELDS = {
    "battery_pct",
    "battery_v",
    "buttons",
    "collecting",
    "collect_label",
}


class AIQuestContractError(Exception):
    """Structured AI Quest contract failure for JSON-RPC/REST responses."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        retryable: bool = False,
        data: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.data = data or {}


@dataclass(frozen=True)
class Scope:
    """Safe model sharing scope stored in project metadata."""

    type: str
    id: str

    def payload(self) -> Dict[str, str]:
        return {"type": self.type, "id": self.id}


def normalize_provider_dataset_response(
    provider: str,
    response: Dict[str, Any],
) -> Dict[str, Any]:
    """Normalize provider-specific dataset creation/upload responses."""
    dataset_id = (
        response.get("dataset_id")
        or response.get("datasetId")
        or response.get("id")
    )
    if not dataset_id:
        raise AIQuestContractError(
            "AIQUEST_PROVIDER_INVALID_RESPONSE",
            "Provider dataset response is missing a dataset id",
        )
    uploaded = (
        response.get("uploaded_samples")
        or response.get("sampleCount")
        or response.get("items")
        or 0
    )
    return {
        "dataset_id": str(dataset_id),
        "status": _normalize_status(
            response.get("status") or response.get("state") or "ready"
        ),
        "uploaded_samples": int(uploaded),
        "audit": {
            "provider": provider,
            "audit_id": str(
                response.get("audit_id")
                or response.get("auditId")
                or response.get("audit", {}).get("id", "")
            ),
        },
    }


def normalize_provider_training_response(
    provider: str,
    response: Dict[str, Any],
) -> Dict[str, Any]:
    """Normalize provider-specific training job responses."""
    job = response.get("job") if isinstance(response.get("job"), dict) else {}
    model = (
        response.get("model") if isinstance(response.get("model"), dict) else {}
    )
    job_id = response.get("job_id") or response.get("jobId") or job.get("id")
    model_id = (
        response.get("model_id") or response.get("modelId") or model.get("id")
    )
    status = (
        response.get("status")
        or response.get("state")
        or job.get("status")
        or job.get("state")
        or "queued"
    )
    accuracy = (
        response.get("metrics", {}).get("accuracy")
        if isinstance(response.get("metrics"), dict)
        else None
    )
    if accuracy is None:
        accuracy = model.get("accuracy", 0)
    return {
        "job_id": str(job_id or ""),
        "status": _normalize_status(status),
        "model_id": str(model_id or ""),
        "metrics": {"accuracy": _safe_float(accuracy)},
    }


def normalize_provider_prediction_response(
    provider: str,
    response: Dict[str, Any],
) -> Dict[str, Any]:
    """Normalize provider-specific prediction responses."""
    label = response.get("label") or response.get("class") or ""
    confidence = (
        response.get("confidence")
        if "confidence" in response
        else response.get("score", 0)
    )
    mode = response.get("mode") or "cloud"
    model_id = response.get("model_id") or response.get("modelId") or ""
    return {
        "label": str(label),
        "confidence": _safe_float(confidence),
        "mode": mode if mode in PREDICTION_MODES else "cloud",
        "model_id": str(model_id),
    }


class AIQuestContractService:
    """Server-side API used by ScratchAI EV3 blocks."""

    def __init__(
        self,
        *,
        provider: Optional[MockAIQuestProvider] = None,
        clock: Any = None,
    ) -> None:
        self.provider = provider or build_ai_quest_provider_from_env()
        self.clock = clock or _utc_timestamp
        self.datasets: Dict[str, Dict[str, Any]] = {}
        self.jobs: Dict[str, Dict[str, Any]] = {}
        self.models: Dict[str, Dict[str, Any]] = {}
        self.cached_models: Dict[str, Dict[str, Any]] = {}
        self.active_models: Dict[Tuple[str, str], str] = {}
        self.upload_statuses: Dict[str, Dict[str, Any]] = {}
        self.latest_upload_status: Optional[Dict[str, Any]] = None
        self.audit_log: List[Dict[str, Any]] = []
        self.latest_dataset_id = ""
        self.latest_job_id = ""

    def upload_time_series(
        self,
        *,
        rows: Sequence[Dict[str, Any]],
        raw_rows: Sequence[Dict[str, Any]],
        brick_id: str,
        scope: str = "project",
        scope_id: str = DEFAULT_PROJECT_SCOPE_ID,
        consent: bool = False,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Upload allowed EV3 time-series data through the provider contract."""
        model_scope = _scope(scope, scope_id)
        if consent is not True:
            self._record_upload_failure(
                "dataset.upload.rejected",
                code="AIQUEST_CONSENT_REQUIRED",
                message="AI Quest upload requires explicit consent",
                provider=self.provider.name,
                scope=model_scope.payload(),
                retryable=False,
            )
            raise AIQuestContractError(
                "AIQUEST_CONSENT_REQUIRED",
                "AI Quest upload requires explicit consent",
            )
        if not rows:
            self._record_upload_failure(
                "dataset.upload.failed",
                code="AIQUEST_EMPTY_DATASET",
                message="AI Quest upload requires collected EV3 rows",
                provider=self.provider.name,
                scope=model_scope.payload(),
                retryable=False,
            )
            raise AIQuestContractError(
                "AIQUEST_EMPTY_DATASET",
                "AI Quest upload requires collected EV3 rows",
            )
        samples = _time_series_samples(rows, raw_rows)
        payload = {
            "brick_id": brick_id,
            "scope": model_scope.payload(),
            "metadata": _safe_metadata(metadata or {}),
            "rows": list(rows),
            "samples": samples,
        }
        try:
            provider_response = self.provider.upload_dataset(payload)
        except AIQuestProviderOperationError as exc:
            error = _provider_contract_error(exc)
            self.latest_upload_status = _upload_status(
                "",
                "failed",
                0,
                error.retryable,
                error={
                    "code": error.code,
                    "message": error.message,
                },
                audit_id="",
                timestamp=self.clock(),
            )
            self._record_audit(
                "dataset.upload.failed",
                provider=self.provider.name,
                dataset_id="",
                scope=model_scope.payload(),
                status="failed",
                retryable=error.retryable,
                message=error.message,
            )
            raise error from exc
        normalized = normalize_provider_dataset_response(
            self.provider.name,
            provider_response,
        )
        timestamp = self.clock()
        dataset = {
            **normalized,
            "scope": model_scope.payload(),
            "safe_reference": {
                "dataset_id": normalized["dataset_id"],
                "scope": model_scope.payload(),
            },
            "data_boundary": {
                "allowed_sample_count": len(samples),
                "raw_scratch_project_included": False,
                "provider_credentials_included": False,
            },
            "uploaded_at": timestamp,
        }
        self.datasets[dataset["dataset_id"]] = {
            "rows": list(rows),
            "scope": model_scope.payload(),
            "dataset": dataset,
        }
        self.upload_statuses[dataset["dataset_id"]] = _upload_status(
            dataset["dataset_id"],
            "complete",
            100,
            False,
            error=None,
            audit_id=dataset["audit"]["audit_id"],
            timestamp=timestamp,
        )
        self.latest_upload_status = self.upload_statuses[dataset["dataset_id"]]
        self.latest_dataset_id = dataset["dataset_id"]
        self._record_audit(
            "dataset.upload.complete",
            provider=self.provider.name,
            dataset_id=dataset["dataset_id"],
            scope=model_scope.payload(),
            status="complete",
            retryable=False,
            audit_id=dataset["audit"]["audit_id"],
            message="AI Quest dataset upload completed",
        )
        return dataset

    def start_training(
        self,
        dataset_id: str = "",
        *,
        accuracy_gate: float = DEFAULT_ACCURACY_GATE,
    ) -> Dict[str, Any]:
        """Start a normalized AI Quest training job."""
        dataset_id = dataset_id or self.latest_dataset_id
        dataset = self.datasets.get(dataset_id)
        if dataset is None:
            raise AIQuestContractError(
                "AIQUEST_DATASET_NOT_FOUND",
                "Upload an AI Quest dataset before training",
            )
        try:
            provider_response = self.provider.start_training(
                dataset_id,
                dataset["rows"],
                accuracy_gate=_accuracy_gate(accuracy_gate),
            )
        except AIQuestProviderOperationError as exc:
            raise _provider_contract_error(exc) from exc
        except TrainerPipelineError as exc:
            raise AIQuestContractError(
                exc.code,
                exc.message,
                data=exc.data,
            ) from exc
        normalized = normalize_provider_training_response(
            self.provider.name,
            provider_response,
        )
        model = provider_response.get("modelRules")
        model_id = normalized["model_id"]
        if model_id:
            if model:
                self.models[model_id] = model
                self.cached_models[model_id] = model
            else:
                self.models[model_id] = {
                    "cloud_only": True,
                    "model": {
                        "id": model_id,
                        "accuracy": normalized["metrics"]["accuracy"],
                    },
                }
            model_scope = dataset["scope"]
            self.active_models[(model_scope["type"], model_scope["id"])] = (
                model_id
            )
        self.jobs[normalized["job_id"]] = {
            **normalized,
            "dataset_id": dataset_id,
        }
        self.latest_job_id = normalized["job_id"]
        return normalized

    def get_training_status(self, job_id: str = "") -> Dict[str, Any]:
        """Return normalized training job status."""
        job_id = job_id or self.latest_job_id
        job = self.jobs.get(job_id)
        if job is None:
            return {
                "job_id": job_id,
                "status": "notStarted",
                "model_id": "",
                "metrics": {"accuracy": 0},
            }
        return dict(job)

    def get_upload_status(self, dataset_id: str = "") -> Dict[str, Any]:
        """Return the latest upload progress visible to Scratch/REST."""
        if dataset_id:
            status = self.upload_statuses.get(dataset_id)
            if status is not None:
                return dict(status)
        if self.latest_upload_status is not None:
            return dict(self.latest_upload_status)
        return _upload_status(
            str(dataset_id or ""),
            "notStarted",
            0,
            False,
            error=None,
            audit_id="",
            timestamp=self.clock(),
        )

    def get_audit_log(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Return teacher-reviewable audit metadata without raw samples."""
        safe_limit = max(1, min(500, int(limit or 50)))
        return [dict(entry) for entry in self.audit_log[-safe_limit:]]

    def delete_dataset(self, dataset_id: str) -> Dict[str, Any]:
        """Delete provider/local dataset state and record an audit event."""
        safe_dataset_id = str(dataset_id or "")
        dataset = self.datasets.get(safe_dataset_id)
        if dataset is None:
            raise AIQuestContractError(
                "AIQUEST_DATASET_NOT_FOUND",
                "AI Quest dataset is not available",
            )
        try:
            provider_response = self.provider.delete_dataset(safe_dataset_id)
        except AIQuestProviderOperationError as exc:
            raise _provider_contract_error(exc) from exc
        audit_id = _provider_audit_id(provider_response)
        self.datasets.pop(safe_dataset_id, None)
        self.upload_statuses[safe_dataset_id] = _upload_status(
            safe_dataset_id,
            "deleted",
            100,
            False,
            error=None,
            audit_id=audit_id,
            timestamp=self.clock(),
        )
        self.latest_upload_status = self.upload_statuses[safe_dataset_id]
        if self.latest_dataset_id == safe_dataset_id:
            self.latest_dataset_id = ""
        result = {
            "dataset_id": safe_dataset_id,
            "status": "deleted",
            "raw_dataset_retained": False,
            "provider": self.provider.name,
            "audit_id": audit_id,
        }
        self._record_audit(
            "dataset.delete.complete",
            provider=self.provider.name,
            dataset_id=safe_dataset_id,
            scope=dataset["scope"],
            status="deleted",
            retryable=False,
            audit_id=audit_id,
            message="AI Quest dataset deleted",
        )
        return result

    def delete_model(self, model_id: str) -> Dict[str, Any]:
        """Delete provider/local model state and active references."""
        safe_model_id = str(model_id or "")
        if (
            safe_model_id not in self.models
            and safe_model_id not in self.cached_models
        ):
            raise AIQuestContractError(
                "AIQUEST_MODEL_NOT_FOUND",
                "AI Quest model is not available",
            )
        try:
            provider_response = self.provider.delete_model(safe_model_id)
        except AIQuestProviderOperationError as exc:
            raise _provider_contract_error(exc) from exc
        audit_id = _provider_audit_id(provider_response)
        self.models.pop(safe_model_id, None)
        self.cached_models.pop(safe_model_id, None)
        self.active_models = {
            key: value
            for key, value in self.active_models.items()
            if value != safe_model_id
        }
        result = {
            "model_id": safe_model_id,
            "status": "deleted",
            "cached_model_retained": False,
            "provider": self.provider.name,
            "audit_id": audit_id,
        }
        self._record_audit(
            "model.delete.complete",
            provider=self.provider.name,
            model_id=safe_model_id,
            status="deleted",
            retryable=False,
            audit_id=audit_id,
            message="AI Quest model deleted",
        )
        return result

    def select_model(
        self,
        model_id: str,
        *,
        scope: str = "project",
        scope_id: str = DEFAULT_PROJECT_SCOPE_ID,
    ) -> Dict[str, Any]:
        """Select a safe model reference for one project/class scope."""
        if model_id not in self.models and model_id not in self.cached_models:
            raise AIQuestContractError(
                "AIQUEST_MODEL_NOT_FOUND",
                "Selected AI Quest model is not available",
            )
        model_scope = _scope(scope, scope_id)
        self.active_models[(model_scope.type, model_scope.id)] = model_id
        return {
            "model_id": model_id,
            "scope": model_scope.payload(),
            "status": "selected",
        }

    def predict(
        self,
        features: Dict[str, Any],
        *,
        scope: str = "project",
        scope_id: str = DEFAULT_PROJECT_SCOPE_ID,
    ) -> Dict[str, Any]:
        """Predict a current EV3 sensor frame with cloud/cache/fallback modes."""
        model_scope = _scope(scope, scope_id)
        model_id = (
            self.active_models.get((model_scope.type, model_scope.id))
            or self._latest_model_id()
        )
        if model_id and model_id in self.models:
            try:
                return normalize_provider_prediction_response(
                    self.provider.name,
                    self.provider.predict(model_id, features),
                )
            except AIQuestProviderUnavailable:
                pass
        if model_id and model_id in self.cached_models:
            model = self.cached_models[model_id]
            return {
                "label": predict_with_model(model, features),
                "confidence": _safe_float(model["model"].get("accuracy", 0)),
                "mode": "cached",
                "model_id": model_id,
            }
        return local_fallback_prediction(features)

    def export_model(self, model_id: str = "") -> Dict[str, Any]:
        """Export model rules or report without raw samples or credentials."""
        model_id = model_id or self._latest_model_id()
        if not model_id:
            raise AIQuestContractError(
                "AIQUEST_MODEL_NOT_FOUND",
                "Train or select an AI Quest model before export",
            )
        if model_id in self.models and getattr(
            self.provider, "available", True
        ):
            try:
                report = self.provider.export_model(model_id)
            except AIQuestProviderUnavailable as exc:
                if model_id in self.cached_models:
                    report = export_model_rules(self.cached_models[model_id])
                else:
                    raise _provider_contract_error(exc) from exc
            except AIQuestProviderOperationError as exc:
                raise _provider_contract_error(exc) from exc
        else:
            report = export_model_rules(self.cached_models[model_id])
        return {
            "filename": "ai_quest_model_report.json",
            "json": report,
            "model_id": model_id,
            "raw_dataset_included": False,
            "provider_credentials_included": False,
        }

    def _latest_model_id(self) -> str:
        if not self.active_models:
            return ""
        return next(reversed(self.active_models.values()))

    def _record_audit(
        self,
        event: str,
        *,
        provider: str,
        dataset_id: str = "",
        model_id: str = "",
        scope: Optional[Dict[str, str]] = None,
        status: str,
        retryable: bool,
        audit_id: str = "",
        message: str,
    ) -> None:
        self.audit_log.append(
            {
                "event": event,
                "timestamp": self.clock(),
                "provider": provider,
                "dataset_id": dataset_id,
                "model_id": model_id,
                "scope": scope or {},
                "status": status,
                "retryable": retryable,
                "audit_id": audit_id,
                "message": message,
            }
        )

    def _record_upload_failure(
        self,
        event: str,
        *,
        code: str,
        message: str,
        provider: str,
        scope: Dict[str, str],
        retryable: bool,
    ) -> None:
        timestamp = self.clock()
        self.latest_upload_status = _upload_status(
            "",
            "failed",
            0,
            retryable,
            error={
                "code": code,
                "message": message,
            },
            audit_id="",
            timestamp=timestamp,
        )
        self._record_audit(
            event,
            provider=provider,
            dataset_id="",
            scope=scope,
            status="failed",
            retryable=retryable,
            message=message,
        )


def predict_with_model(model: Dict[str, Any], features: Dict[str, Any]) -> str:
    """Predict one label using the exported one-split decision tree."""
    rule = model.get("rule", {})
    feature = str(rule.get("feature", ""))
    threshold = _safe_float(rule.get("threshold", 0))
    value = _safe_float(features.get(feature, 0))
    if value <= threshold:
        return str(rule.get("trueLabel", ""))
    return str(rule.get("falseLabel", ""))


def local_fallback_prediction(features: Dict[str, Any]) -> Dict[str, Any]:
    """Small deterministic local model used when no cloud/cache model exists."""
    distance = _safe_float(features.get("ultrasonic_cm", 0))
    touch = _safe_float(features.get("touch_pressed", 0))
    label = "obstacle" if touch >= 1 or 0 < distance < 20 else "safe"
    return {
        "label": label,
        "confidence": 0.5,
        "mode": "localFallback",
        "model_id": LOCAL_FALLBACK_MODEL_ID,
    }


def features_from_trainer_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Extract model features from the latest Trainer sensor payload."""
    return {
        "color_reflected": _safe_float(payload.get("color_reflected", 0)),
        "ultrasonic_cm": _safe_float(payload.get("ultrasonic_cm", 0)),
        "gyro_angle": _safe_float(payload.get("gyro_angle", 0)),
        "touch_pressed": 1 if payload.get("touch_pressed") else 0,
        "motor_a_pos": _safe_float(payload.get("motor_a_pos", 0)),
    }


def _time_series_samples(
    rows: Sequence[Dict[str, Any]],
    raw_rows: Sequence[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    samples = []
    for index, row in enumerate(rows):
        raw_row = raw_rows[index] if index < len(raw_rows) else {}
        samples.append(
            {
                "timestamp": int(row.get("timestamp", 0)),
                "label": str(row.get("label", "")),
                "features": dict(row.get("features", {})),
                "sensor_frame": sanitize_sensor_frame(
                    raw_row.get("sensor_frame", {})
                ),
            }
        )
    return samples


def sanitize_sensor_frame(frame: Dict[str, Any]) -> Dict[str, Any]:
    """Keep only EV3 raw time-series fields allowed by the design."""
    if not isinstance(frame, dict):
        return {}
    sanitized: Dict[str, Any] = {}
    for key in ("type", "timestamp", "brick_id", "brick_name"):
        if key in frame:
            sanitized[key] = frame[key]
    sensors = _sanitize_port_map(
        frame.get("sensors", {}), ALLOWED_SENSOR_FIELDS
    )
    motors = _sanitize_port_map(frame.get("motors", {}), ALLOWED_MOTOR_FIELDS)
    system = _sanitize_fields(frame.get("system", {}), ALLOWED_SYSTEM_FIELDS)
    if sensors:
        sanitized["sensors"] = sensors
    if motors:
        sanitized["motors"] = motors
    if system:
        sanitized["system"] = system
    return sanitized


def _sanitize_port_map(
    value: Any,
    allowed_fields: set,
) -> Dict[str, Dict[str, Any]]:
    if not isinstance(value, dict):
        return {}
    result = {}
    for port, fields in value.items():
        if isinstance(fields, dict):
            sanitized = _sanitize_fields(fields, allowed_fields)
            if sanitized:
                result[str(port)] = sanitized
    return result


def _sanitize_fields(value: Any, allowed_fields: set) -> Dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    return {
        str(key): item
        for key, item in value.items()
        if key in allowed_fields and _safe_value(item)
    }


def _safe_value(value: Any) -> bool:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return True
    if isinstance(value, list):
        return all(_safe_value(item) for item in value)
    if isinstance(value, dict):
        return all(
            isinstance(key, str) and _safe_value(item)
            for key, item in value.items()
        )
    return False


def _safe_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    allowed = {"project_id", "class_session_id", "course_task_id"}
    return {
        str(key): str(value)
        for key, value in metadata.items()
        if key in allowed and value not in (None, "")
    }


def _scope(scope: str, scope_id: str) -> Scope:
    scope_type = str(scope or "project")
    if scope_type not in MODEL_SCOPES:
        scope_type = "project"
    safe_id = str(scope_id or DEFAULT_PROJECT_SCOPE_ID).strip()
    if not safe_id:
        safe_id = DEFAULT_PROJECT_SCOPE_ID
    return Scope(type=scope_type, id=safe_id[:96])


def _normalize_status(value: Any) -> str:
    normalized = str(value or "").lower()
    if normalized in {"done", "complete", "completed", "success"}:
        return "succeeded"
    if normalized in {"failed", "error"}:
        return "failed"
    if normalized in {"accepted", "created", "ok"}:
        return "ready"
    if normalized in {"ready", "succeeded", "queued", "running"}:
        return normalized
    return "ready"


def _provider_contract_error(
    exc: AIQuestProviderOperationError,
) -> AIQuestContractError:
    code = (
        "AIQUEST_PROVIDER_UNAVAILABLE"
        if exc.retryable
        else "AIQUEST_PROVIDER_INVALID_RESPONSE"
    )
    message = (
        "AI Quest provider is unavailable"
        if exc.retryable
        else "AI Quest provider response is invalid"
    )
    return AIQuestContractError(
        code,
        message,
        retryable=exc.retryable,
        data=exc.contract_data(),
    )


def _upload_status(
    dataset_id: str,
    status: str,
    progress: int,
    retryable: bool,
    *,
    error: Optional[Dict[str, str]],
    audit_id: str,
    timestamp: str,
) -> Dict[str, Any]:
    return {
        "dataset_id": dataset_id,
        "status": status,
        "progress": max(0, min(100, int(progress))),
        "retryable": retryable,
        "error": error,
        "audit_id": audit_id,
        "updated_at": timestamp,
    }


def _provider_audit_id(response: Dict[str, Any]) -> str:
    if not isinstance(response, dict):
        return ""
    audit = response.get("audit")
    return str(
        response.get("audit_id")
        or response.get("auditId")
        or (audit.get("id") if isinstance(audit, dict) else "")
        or ""
    )


def _accuracy_gate(value: Any) -> float:
    return max(0.0, min(1.0, _safe_float(value, DEFAULT_ACCURACY_GATE)))


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
