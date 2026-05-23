import json

import pytest

from weisile_link.trainer_pipeline import (
    TRAINER_MODEL_SCHEMA_VERSION,
    TrainerPipelineError,
    export_model_rules,
    train_decision_tree,
)


def row(distance, label, timestamp):
    return {
        "features": {
            "color_reflected": 40,
            "ultrasonic_cm": distance,
            "gyro_angle": 0,
            "touch_pressed": 0,
            "motor_a_pos": 0,
        },
        "label": label,
        "timestamp": timestamp,
    }


def test_trainer_pipeline_learns_threshold_rule_and_exports_model_rules():
    rows = [
        row(8.0, "obstacle", 1716387600001),
        row(12.0, "obstacle", 1716387600002),
        row(35.0, "safe", 1716387600003),
        row(42.0, "safe", 1716387600004),
    ]

    model = train_decision_tree(
        rows,
        accuracy_gate=0.7,
        trained_at="2026-05-23T00:00:00Z",
    )
    exported = json.loads(export_model_rules(model))

    assert exported["schemaVersion"] == TRAINER_MODEL_SCHEMA_VERSION
    assert exported["model"]["type"] == "decision_tree"
    assert exported["model"]["accuracy"] == 1.0
    assert exported["model"]["accuracyGate"] == 0.7
    assert exported["rule"] == {
        "feature": "ultrasonic_cm",
        "operator": "<=",
        "threshold": 23.5,
        "trueLabel": "obstacle",
        "falseLabel": "safe",
    }
    assert exported["training"] == {
        "rows": 4,
        "labels": ["obstacle", "safe"],
        "trainedAt": "2026-05-23T00:00:00Z",
    }
    assert exported["privacy"] == {
        "localFirst": True,
        "studentDataIncluded": False,
        "clearRoute": "/api/data/clear",
    }
    assert "rows" not in exported


def test_trainer_pipeline_rejects_low_accuracy_training_sets():
    rows = [
        row(8.0, "obstacle", 1),
        row(12.0, "safe", 2),
        row(35.0, "obstacle", 3),
        row(42.0, "safe", 4),
    ]

    with pytest.raises(TrainerPipelineError) as error:
        train_decision_tree(rows, accuracy_gate=0.9)

    assert error.value.code == "TRAINER_ACCURACY_GATE_FAILED"
    assert error.value.data["accuracy"] < 0.9
    assert error.value.data["accuracy_gate"] == 0.9


def test_trainer_pipeline_requires_two_labels_and_rows():
    with pytest.raises(TrainerPipelineError) as error:
        train_decision_tree([row(8.0, "obstacle", 1)])

    assert error.value.code == "TRAINER_INSUFFICIENT_DATA"
