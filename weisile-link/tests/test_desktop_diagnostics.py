from weisile_link.desktop.diagnostics import (
    build_diagnostics_bundle,
    redact_secret_text,
)


def test_redact_secret_text_removes_tokens_api_keys_and_long_labels():
    text = (
        "WEISILE_PAIRING_TOKEN=abc123\n"
        "DEEPSEEK_API_KEY=sk-secret\n"
        "label=" + "x" * 80 + "\n"
    )

    redacted = redact_secret_text(text)

    assert "abc123" not in redacted
    assert "sk-secret" not in redacted
    assert "WEISILE_PAIRING_TOKEN=<redacted>" in redacted
    assert "DEEPSEEK_API_KEY=<redacted>" in redacted
    assert "x" * 80 not in redacted
    assert "label=<truncated>" in redacted


def test_redact_secret_text_redacts_bluetooth_addresses_by_default():
    redacted = redact_secret_text("ev3_bt=00:16:53:12:34:56")

    assert "00:16:53:12:34:56" not in redacted
    assert "<redacted-bluetooth-address>" in redacted


def test_redact_secret_text_can_keep_bluetooth_addresses_for_support():
    redacted = redact_secret_text(
        "ev3_bt=00:16:53:12:34:56",
        include_device_identifiers=True,
    )

    assert "00:16:53:12:34:56" in redacted


def test_build_diagnostics_bundle_excludes_raw_student_data():
    bundle = build_diagnostics_bundle(
        version="0.1.0-test",
        health={"ok": True, "collected_points": 42},
        config={
            "WEISILE_LINK_HOST": "127.0.0.1",
            "WEISILE_PAIRING_TOKEN": "secret",
            "EV3_BT_ADDRESS": "00:16:53:12:34:56",
        },
        recent_logs=[
            "transport_connected",
            "WEISILE_PAIRING_TOKEN=secret",
            "ev3_bt=00:16:53:12:34:56",
        ],
        include_student_data=False,
        student_data=[{"label": "student-row", "distance_cm": 24}],
    )

    assert bundle["version"] == "0.1.0-test"
    assert bundle["health"]["ok"] is True
    assert bundle["config"]["WEISILE_PAIRING_TOKEN"] == "<redacted>"
    assert bundle["config"]["EV3_BT_ADDRESS"] == "<redacted>"
    logs = "\n".join(bundle["recent_logs"])
    assert "secret" not in logs
    assert "00:16:53:12:34:56" not in logs
    assert "student_data" not in bundle


def test_build_diagnostics_bundle_includes_student_data_only_when_requested():
    bundle = build_diagnostics_bundle(
        version="0.1.0-test",
        health={"ok": True},
        config={},
        recent_logs=[],
        include_student_data=True,
        student_data=[{"label": "line", "distance_cm": 24}],
    )

    assert bundle["student_data"] == [{"label": "line", "distance_cm": 24}]
