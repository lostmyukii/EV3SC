import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CLASSROOM = ROOT / "docs" / "classroom"
SAMPLES = ROOT / "ai-quest-samples" / "projects"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _sample(path: str) -> dict:
    return json.loads((SAMPLES / path).read_text(encoding="utf-8"))


def test_teacher_guide_covers_classroom_setup_safety_privacy_and_recovery():
    guide = _read(CLASSROOM / "TEACHER_GUIDE.md")

    for required in (
        "45-minute classroom flow",
        "Teacher preflight checklist",
        "Scratch visual identity",
        "Unsandboxed VSLE-EV3 extension",
        "SensorCache",
        "record -> upload -> train -> export",
        "70% accuracy gate",
        "WEISILE_PAIRING_TOKEN",
        "localhost-only",
        "/api/data/clear",
        "Emergency stop",
        "Troubleshooting",
        "Assessment rubric",
        "Section 13.6 Critical Remediation Gates",
        "30-device rehearsal",
        "vsle_ev3_data.csv",
        "model_rules.json",
    ):
        assert required in guide

    assert "student names" in guide
    assert "photos" in guide
    assert "voice" in guide
    assert "Never modify Scratch visual design" in guide


def test_classroom_index_links_teacher_guide_and_all_workbooks():
    index = _read(CLASSROOM / "README.md")

    for filename in (
        "TEACHER_GUIDE.md",
        "WORKBOOK_OBSTACLE_AVOIDANCE.md",
        "WORKBOOK_LINE_PATROL.md",
        "WORKBOOK_TOUCH_STOP_SAFETY.md",
    ):
        assert filename in index

    assert "Phase 3 teacher guide + student workbooks" in index
    assert "ages 7-15" in index


def test_student_workbooks_match_ai_quest_sample_manifests():
    expected = [
        (
            "WORKBOOK_OBSTACLE_AVOIDANCE.md",
            _sample("obstacle_avoidance_collector.json"),
        ),
        (
            "WORKBOOK_LINE_PATROL.md",
            _sample("line_patrol_color_collector.json"),
        ),
        (
            "WORKBOOK_TOUCH_STOP_SAFETY.md",
            _sample("touch_stop_safety_collector.json"),
        ),
    ]

    for filename, sample in expected:
        workbook = _read(CLASSROOM / filename)

        assert sample["title"] in workbook
        assert sample["goal"] in workbook
        assert str(sample["estimatedMinutes"]) in workbook
        for motor in sample["hardware"]["motors"]:
            assert f"`{motor}`" in workbook
        for sensor in sample["hardware"]["sensors"]:
            assert f"`{sensor}`" in workbook
        for label in sample["labels"]:
            assert label in workbook
        for stage in ("record", "upload", "train", "export"):
            assert stage in workbook
        for feature in sample["trainer"]["features"]:
            assert feature in workbook
        for artifact in sample["trainer"]["exportArtifacts"]:
            assert artifact in workbook
        assert "70% accuracy gate" in workbook
        assert "Prediction test" in workbook
        assert "Reflection" in workbook
        assert "/api/data/clear" in workbook
        assert "No names, photos, or voice recordings" in workbook


def test_teacher_and_workbook_docs_have_no_placeholders_or_secret_values():
    for path in CLASSROOM.glob("*.md"):
        text = _read(path)
        lowered = text.lower()

        assert "tbd" not in lowered
        assert "todo" not in lowered
        assert "fill in" not in lowered
        assert "placeholder" not in lowered
        assert "WEISILE_PAIRING_TOKEN=" not in text
        assert "maker" not in lowered
