import asyncio
import json

from weisile_link.desktop.diagnostics import (
    DesktopDiagnosticsService,
    build_diagnostics_bundle,
    redact_secret_text,
    run_diagnostics_command,
    sanitize_diagnostics_value,
)
from weisile_link.desktop.profiles import (
    DesktopProfileStore,
    MemoryCredentialBackend,
    save_claimed_profile,
)
from weisile_link.desktop.runtime import (
    DesktopHealthState,
    DesktopRuntimeService,
)
from weisile_link.cli import main as cli_main


CLAIM_RESULT = {
    "brick_id": "VSLE-EV3-583C",
    "brick_name": "Class EV3 01",
    "transport": "vsle-bluetooth",
    "ev3_bt": "A0:E6:F8:19:58:3C",
    "pairing_token": "secret-token-1234567890",
    "server_version": "0.1.0",
    "capabilities": {
        "sensors": ["color", "ultrasonic", "gyro", "touch"],
        "motors": ["A", "B", "C", "D"],
        "ai_quest": True,
    },
}


class FakeDiagnosticsTransport:
    def __init__(self, state, pairing_token):
        self.state = state
        self.pairing_token = pairing_token

    async def connect(self, on_sensor_data):
        self.state["connect_token"] = self.pairing_token
        if not self.state.get("connect_ok", True):
            return False
        if self.state.get("emit_sensor", True):
            await on_sensor_data(
                {
                    "type": "sensor_update",
                    "sensors": {"S4": {"pressed": 1}},
                    "motors": {},
                    "system": {"battery_v": 7.5},
                }
            )
        return True

    async def disconnect(self):
        self.state["disconnects"] = self.state.get("disconnects", 0) + 1


def fake_transport_factory(state):
    def build(
        ev3_bt, *, pairing_token="", native_adapter_path="", manager=None
    ):
        state.setdefault("transport_builds", []).append(
            {
                "ev3_bt": ev3_bt,
                "pairing_token": pairing_token,
                "native_adapter_path": native_adapter_path,
            }
        )
        return FakeDiagnosticsTransport(state, pairing_token)

    return build


def diagnostics_service(tmp_path, *, state=None, with_profile=True):
    if state is None:
        state = {}
    credentials = MemoryCredentialBackend()
    store = DesktopProfileStore(tmp_path / "config.json")
    if with_profile:
        save_claimed_profile(
            dict(CLAIM_RESULT),
            credential_backend=credentials,
            profile_store=store,
        )
    runtime = DesktopRuntimeService(
        credential_backend=credentials,
        profile_store=store,
        transport_factory=fake_transport_factory(state),
    )
    return DesktopDiagnosticsService(
        runtime_service=runtime,
        profile_store=store,
        port_checker=lambda host, port: True,
        app_version="0.1.0-test",
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


def test_sanitize_diagnostics_value_redacts_nested_health_device_ids():
    payload = {
        "health": {
            "ev3_bt": "A0:E6:F8:19:58:3C",
            "token_ref": "memory:vsle/VSLE-EV3-583C",
            "logs": ["WEISILE_PAIRING_TOKEN=secret-token-1234567890"],
        }
    }

    safe = sanitize_diagnostics_value(payload)

    encoded = json.dumps(safe)
    assert "A0:E6:F8:19:58:3C" not in encoded
    assert "secret-token-1234567890" not in encoded
    assert safe["health"]["token_ref"] == "<redacted>"


def test_desktop_diagnostics_collects_ready_bundle_without_secrets(tmp_path):
    adapter = tmp_path / "WeisileEV3BluetoothAdapter"
    adapter.write_text("#!/bin/sh\n", encoding="utf-8")
    adapter.chmod(0o755)
    state = {}
    service = diagnostics_service(tmp_path, state=state)

    result = asyncio.run(
        service.collect(
            native_adapter_path=str(adapter),
            ready_timeout_s=0.1,
            recent_logs=[
                "WEISILE_PAIRING_TOKEN=secret-token-1234567890",
                "ev3_bt=A0:E6:F8:19:58:3C",
            ],
        )
    )

    payload = result.safe_payload()
    encoded = json.dumps(payload)
    assert result.state == DesktopHealthState.READY
    assert payload["state"] == "ready"
    assert "secret-token-1234567890" not in encoded
    assert "A0:E6:F8:19:58:3C" not in encoded
    assert state["connect_token"] == "secret-token-1234567890"
    checks = {check["name"]: check for check in payload["checks"]}
    assert checks["profile"]["ok"] is True
    assert checks["credential"]["ok"] is True
    assert checks["native_adapter"]["ok"] is True
    assert checks["scratch_link_port"]["status"] == "listening"
    assert checks["trainer_port"]["status"] == "listening"
    assert checks["ev3_ready_check"]["status"] == "ready"


def test_desktop_diagnostics_can_include_device_identifiers(tmp_path):
    adapter = tmp_path / "WeisileEV3BluetoothAdapter"
    adapter.write_text("#!/bin/sh\n", encoding="utf-8")
    adapter.chmod(0o755)
    service = diagnostics_service(tmp_path)

    result = asyncio.run(
        service.collect(
            native_adapter_path=str(adapter),
            include_device_identifiers=True,
            ready_timeout_s=0.1,
        )
    )

    payload = result.safe_payload(include_device_identifiers=True)
    encoded = json.dumps(payload)
    assert "A0:E6:F8:19:58:3C" in encoded
    assert "secret-token-1234567890" not in encoded


def test_desktop_diagnostics_missing_profile_returns_needs_pairing(tmp_path):
    service = diagnostics_service(tmp_path, with_profile=False)

    result = asyncio.run(service.collect(ready_timeout_s=0.01))

    payload = result.safe_payload()
    checks = {check["name"]: check for check in payload["checks"]}
    assert result.state == DesktopHealthState.NEEDS_PAIRING
    assert checks["profile"]["ok"] is False
    assert checks["ev3_ready_check"]["status"] == "not_checked"


def test_desktop_diagnostics_missing_adapter_returns_attention(tmp_path):
    service = diagnostics_service(tmp_path)

    result = asyncio.run(
        service.collect(
            native_adapter_path=str(tmp_path / "missing-adapter"),
            ready_timeout_s=0.1,
        )
    )

    payload = result.safe_payload()
    checks = {check["name"]: check for check in payload["checks"]}
    assert result.state == DesktopHealthState.NEEDS_ATTENTION
    assert checks["native_adapter"]["ok"] is False
    assert checks["ev3_ready_check"]["ok"] is True


def test_run_diagnostics_command_writes_safe_support_bundle(tmp_path, capsys):
    adapter = tmp_path / "WeisileEV3BluetoothAdapter"
    adapter.write_text("#!/bin/sh\n", encoding="utf-8")
    adapter.chmod(0o755)
    log_file = tmp_path / "weisile.log"
    log_file.write_text(
        "WEISILE_PAIRING_TOKEN=secret-token-1234567890\n"
        "ev3_bt=A0:E6:F8:19:58:3C\n",
        encoding="utf-8",
    )
    output = tmp_path / "diagnostics/support.json"
    service = diagnostics_service(tmp_path)

    exit_code = asyncio.run(
        run_diagnostics_command(
            [
                "--native-adapter",
                str(adapter),
                "--output",
                str(output),
                "--log-file",
                str(log_file),
                "--ready-timeout",
                "0.1",
            ],
            service_factory=lambda _args: service,
        )
    )

    stdout = capsys.readouterr().out
    written = output.read_text(encoding="utf-8")
    payload = json.loads(stdout)
    assert exit_code == 0
    assert payload["state"] == "ready"
    assert "secret-token-1234567890" not in stdout
    assert "A0:E6:F8:19:58:3C" not in stdout
    assert "secret-token-1234567890" not in written
    assert "A0:E6:F8:19:58:3C" not in written


def test_cli_dispatches_desktop_diagnostics_subcommand(monkeypatch):
    calls = []

    async def fake_run_diagnostics_command(argv):
        calls.append(argv)
        return 2

    monkeypatch.setattr(
        "weisile_link.cli.run_diagnostics_command",
        fake_run_diagnostics_command,
    )

    try:
        cli_main(["desktop-diagnostics", "--ready-timeout", "0.1"])
    except SystemExit as exc:
        assert exc.code == 2

    assert calls == [["--ready-timeout", "0.1"]]
