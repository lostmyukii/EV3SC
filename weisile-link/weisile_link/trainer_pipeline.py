"""Local WeisileAI Trainer model pipeline for EV3 classroom data.

Sources:
- VSLE spec Section 8.2 defines the AI Quest `record -> upload -> train ->
  export` workflow with a Decision Tree and 70% accuracy gate.
- VSLE spec Sections 10 and 15 define local Trainer REST contracts, local-first
  data handling, and deletion controls.
- `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/ai-middleware/README.md`
  was used as a read-only reference for keeping AI/model work isolated behind
  server-side contracts without exposing secrets or raw student data.
"""

from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
import json
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

TRAINER_MODEL_SCHEMA_VERSION = "vsle-ai-trainer-model-rules-v1"
DEFAULT_ACCURACY_GATE = 0.7
TRAINER_FEATURE_FIELDS = [
    "color_reflected",
    "ultrasonic_cm",
    "gyro_angle",
    "touch_pressed",
    "motor_a_pos",
]
MAX_TRAINER_LABEL_LENGTH = 64


class TrainerPipelineError(Exception):
    """Validation or training error surfaced through Trainer REST routes."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        data: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data or {}


@dataclass(frozen=True)
class _CandidateRule:
    feature: str
    threshold: float
    true_label: str
    false_label: str
    accuracy: float


def train_decision_tree(
    rows: Sequence[Dict[str, Any]],
    *,
    accuracy_gate: float = DEFAULT_ACCURACY_GATE,
    trained_at: Optional[str] = None,
) -> Dict[str, Any]:
    """Train a deterministic one-split decision tree over EV3 sensor rows."""
    gate = _normalize_accuracy_gate(accuracy_gate)
    normalized_rows = _validate_rows(rows)
    labels = sorted({row["label"] for row in normalized_rows})
    if len(labels) < 2:
        raise TrainerPipelineError(
            "TRAINER_INSUFFICIENT_DATA",
            "Training requires at least two labels",
            data={
                "row_count": len(normalized_rows),
                "label_count": len(labels),
            },
        )

    rule = _best_rule(normalized_rows)
    if rule is None:
        raise TrainerPipelineError(
            "TRAINER_INSUFFICIENT_DATA",
            "Training requires at least one varying numeric feature",
            data={
                "row_count": len(normalized_rows),
                "label_count": len(labels),
            },
        )
    if rule.accuracy < gate:
        raise TrainerPipelineError(
            "TRAINER_ACCURACY_GATE_FAILED",
            "Decision tree accuracy is below the classroom gate",
            data={
                "accuracy": rule.accuracy,
                "accuracy_gate": gate,
                "row_count": len(normalized_rows),
            },
        )

    return {
        "schemaVersion": TRAINER_MODEL_SCHEMA_VERSION,
        "model": {
            "type": "decision_tree",
            "accuracy": rule.accuracy,
            "accuracyGate": gate,
        },
        "features": list(TRAINER_FEATURE_FIELDS),
        "rule": {
            "feature": rule.feature,
            "operator": "<=",
            "threshold": rule.threshold,
            "trueLabel": rule.true_label,
            "falseLabel": rule.false_label,
        },
        "training": {
            "rows": len(normalized_rows),
            "labels": labels,
            "trainedAt": trained_at or _utc_timestamp(),
        },
        "privacy": {
            "localFirst": True,
            "studentDataIncluded": False,
            "clearRoute": "/api/data/clear",
        },
    }


def export_model_rules(model: Dict[str, Any]) -> str:
    """Serialize the trained rule model as `model_rules.json` content."""
    if model.get("schemaVersion") != TRAINER_MODEL_SCHEMA_VERSION:
        raise TrainerPipelineError(
            "TRAINER_INVALID_MODEL",
            "Trainer model schema is not exportable",
            data={"schemaVersion": model.get("schemaVersion")},
        )
    return (
        json.dumps(model, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    )


def _normalize_accuracy_gate(value: Any) -> float:
    try:
        gate = float(value)
    except (TypeError, ValueError):
        gate = DEFAULT_ACCURACY_GATE
    return max(0.0, min(1.0, gate))


def _validate_rows(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if len(rows) < 2:
        raise TrainerPipelineError(
            "TRAINER_INSUFFICIENT_DATA",
            "Training requires at least two collected rows",
            data={"row_count": len(rows)},
        )

    normalized_rows = []
    for index, row in enumerate(rows):
        features = row.get("features")
        label = str(row.get("label", "")).strip()
        if not isinstance(features, dict):
            raise TrainerPipelineError(
                "TRAINER_INVALID_ROWS",
                "Collected row is missing EV3 feature values",
                data={"row": index},
            )
        if not label:
            raise TrainerPipelineError(
                "TRAINER_INVALID_ROWS",
                "Collected row is missing a label",
                data={"row": index},
            )
        if len(label) > MAX_TRAINER_LABEL_LENGTH:
            raise TrainerPipelineError(
                "TRAINER_INVALID_ROWS",
                "Collected row label is too long",
                data={
                    "row": index,
                    "max_label_length": MAX_TRAINER_LABEL_LENGTH,
                },
            )

        normalized_features = {}
        for field in TRAINER_FEATURE_FIELDS:
            try:
                normalized_features[field] = float(features.get(field, 0))
            except (TypeError, ValueError):
                raise TrainerPipelineError(
                    "TRAINER_INVALID_ROWS",
                    "Collected row contains a non-numeric EV3 feature",
                    data={"row": index, "feature": field},
                )
        normalized_rows.append(
            {
                "features": normalized_features,
                "label": label,
                "timestamp": int(row.get("timestamp", 0)),
            }
        )
    return normalized_rows


def _best_rule(rows: Sequence[Dict[str, Any]]) -> Optional[_CandidateRule]:
    candidates = []
    for feature in TRAINER_FEATURE_FIELDS:
        values = sorted({row["features"][feature] for row in rows})
        for lower, upper in zip(values, values[1:]):
            threshold = _round_threshold((lower + upper) / 2)
            candidates.extend(_candidate_directions(rows, feature, threshold))
    if not candidates:
        return None
    return sorted(
        candidates,
        key=lambda rule: (
            -rule.accuracy,
            TRAINER_FEATURE_FIELDS.index(rule.feature),
            rule.threshold,
            rule.true_label,
            rule.false_label,
        ),
    )[0]


def _candidate_directions(
    rows: Sequence[Dict[str, Any]],
    feature: str,
    threshold: float,
) -> Iterable[_CandidateRule]:
    left = [row for row in rows if row["features"][feature] <= threshold]
    right = [row for row in rows if row["features"][feature] > threshold]
    if not left or not right:
        return []

    left_label = _majority_label(row["label"] for row in left)
    right_label = _majority_label(row["label"] for row in right)
    direct_accuracy = _rule_accuracy(
        rows, feature, threshold, left_label, right_label
    )
    reverse_accuracy = _rule_accuracy(
        rows, feature, threshold, right_label, left_label
    )
    return [
        _CandidateRule(
            feature=feature,
            threshold=threshold,
            true_label=left_label,
            false_label=right_label,
            accuracy=direct_accuracy,
        ),
        _CandidateRule(
            feature=feature,
            threshold=threshold,
            true_label=right_label,
            false_label=left_label,
            accuracy=reverse_accuracy,
        ),
    ]


def _majority_label(labels: Iterable[str]) -> str:
    counts = Counter(labels)
    return sorted(counts.items(), key=lambda item: (-item[1], item[0]))[0][0]


def _rule_accuracy(
    rows: Sequence[Dict[str, Any]],
    feature: str,
    threshold: float,
    true_label: str,
    false_label: str,
) -> float:
    correct = 0
    for row in rows:
        predicted = (
            true_label if row["features"][feature] <= threshold else false_label
        )
        if predicted == row["label"]:
            correct += 1
    return round(correct / len(rows), 4)


def _round_threshold(value: float) -> float:
    rounded = round(value, 4)
    if rounded.is_integer():
        return int(rounded)
    return rounded


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
