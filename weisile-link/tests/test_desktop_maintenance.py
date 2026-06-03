import asyncio
import json

from weisile_link.cli import main as cli_main
from weisile_link.desktop.maintenance import (
    DesktopMaintenanceService,
    run_device_command,
    run_token_command,
)
from weisile_link.desktop.profiles import (
    DesktopProfileStore,
    MemoryCredentialBackend,
    save_claimed_profile,
)


CLAIM_RESULT = {
    "brick_id": "VSLE-EV3-583C",
    "brick_name": "Class EV3 01",
    "transport": "vsle-bluetooth",
    "ev3_bt": "A0:E6:F8:19:58:3C",
    "pairing_token": "old-secret-token-1234567890",
    "server_version": "0.1.0",
    "capabilities": {
        "sensors": ["color", "ultrasonic", "gyro", "touch"],
        "motors": ["A", "B", "C", "D"],
        "ai_quest": True,
    },
}


class FakeRotateTransport:
    def __init__(self, state, ev3_bt, pairing_token):
        self.state = state
        self.ev3_bt = ev3_bt
        self.pairing_token = pairing_token

    async def rotate_pairing_token(self, *, host_id, app_version=""):
        self.state["rotate"] = {
            "ev3_bt": self.ev3_bt,
            "pairing_token": self.pairing_token,
            "host_id": host_id,
            "app_version": app_version,
        }
        return {
            "brick_id": "VSLE-EV3-583C",
            "brick_name": "EV3-01",
            "transport": "vsle-bluetooth",
            "ev3_bt": "A0:E6:F8:19:58:3C",
            "pairing_token": "rotated-secret-token-1234567890",
            "server_version": "0.1.0",
        }


def fake_transport_factory(state):
    def build(ev3_bt, *, pairing_token="", native_adapter_path="", manager=None):
        state["native_adapter_path"] = native_adapter_path
        return FakeRotateTransport(state, ev3_bt, pairing_token)

    return build


def maintenance_service(tmp_path, *, state=None):
    if state is None:
        state = {}
    credentials = MemoryCredentialBackend()
    store = DesktopProfileStore(tmp_path / "config.json")
    store.import_roster(
        {
            "classroom_id": "school-a-room-302",
            "devices": [
                {
                    "brick_id": "VSLE-EV3-583C",
                    "label": "EV3-01",
                    "ev3_bt": "A0:E6:F8:19:58:3C",
                    "expected_sensors": {"S1": "color", "S4": "touch"},
                }
            ],
        }
    )
    save_claimed_profile(
        dict(CLAIM_RESULT),
        credential_backend=credentials,
        profile_store=store,
    )
    service = DesktopMaintenanceService(
        credential_backend=credentials,
        profile_store=store,
        transport_factory=fake_transport_factory(state),
        app_version="0.1.0",
    )
    return service, store, credentials, state


def test_rename_device_updates_profile_and_roster(tmp_path):
    service, store, _credentials, _state = maintenance_service(tmp_path)

    result = service.rename_device(brick_id="VSLE-EV3-583C", name="Table 1 EV3")

    payload = store.load()
    assert result.ok is True
    assert result.profile["name"] == "Table 1 EV3"
    assert payload["profiles"][0]["name"] == "Table 1 EV3"
    assert payload["roster"]["devices"][0]["label"] == "Table 1 EV3"


def test_rotate_token_stores_new_token_without_safe_output_leak(tmp_path):
    service, store, credentials, state = maintenance_service(tmp_path)

    result = asyncio.run(
        service.rotate_token(
            brick_id="VSLE-EV3-583C",
            host_id="teacher-macbook-01",
            native_adapter_path="/native/vsle-bt",
        )
    )
    profile = store.get_profile("VSLE-EV3-583C")
    token = credentials.get_pairing_token(profile.token_ref)
    encoded = json.dumps(result.profile).lower()

    assert result.ok is True
    assert result.mutated is True
    assert token == "rotated-secret-token-1234567890"
    assert state["rotate"]["pairing_token"] == "old-secret-token-1234567890"
    assert state["rotate"]["host_id"] == "teacher-macbook-01"
    assert state["native_adapter_path"] == "/native/vsle-bt"
    assert "rotated-secret-token-1234567890" not in encoded
    assert "pairing_token" not in encoded


def test_recover_lost_token_requires_confirmation_without_mutation(tmp_path):
    service, store, _credentials, _state = maintenance_service(tmp_path)

    result = service.recover_lost_token(
        brick_id="VSLE-EV3-583C",
        confirm_delete_profile=False,
    )

    assert result.ok is False
    assert result.recovery_required is True
    assert result.mutated is False
    assert store.get_profile("VSLE-EV3-583C").brick_id == "VSLE-EV3-583C"


def test_recover_lost_token_confirm_removes_profile_preserves_roster(tmp_path):
    service, store, credentials, _state = maintenance_service(tmp_path)

    result = service.recover_lost_token(
        brick_id="VSLE-EV3-583C",
        confirm_delete_profile=True,
    )
    payload = store.load()

    assert result.ok is True
    assert result.mutated is True
    assert payload["profiles"] == []
    assert payload["roster"]["devices"][0]["brick_id"] == "VSLE-EV3-583C"
    assert credentials._tokens == {}


def test_device_and_token_commands_print_safe_json(tmp_path, capsys):
    service, _store, _credentials, _state = maintenance_service(tmp_path)

    exit_code = run_device_command(
        ["rename", "--brick-id", "VSLE-EV3-583C", "--name", "Table 1 EV3"],
        service_factory=lambda _args: service,
    )
    rename_output = capsys.readouterr().out

    assert exit_code == 0
    assert json.loads(rename_output)["profile"]["name"] == "Table 1 EV3"

    exit_code = asyncio.run(
        run_token_command(
            ["recover", "--brick-id", "VSLE-EV3-583C"],
            service_factory=lambda _args: service,
        )
    )
    recover_output = capsys.readouterr().out

    assert exit_code == 2
    assert json.loads(recover_output)["recovery_required"] is True
    assert "old-secret-token-1234567890" not in recover_output
    assert "pairing_token" not in recover_output.lower()


def test_cli_dispatches_desktop_device_and_token(monkeypatch):
    calls = []

    def fake_run_device_command(argv):
        calls.append(("device", argv))
        return 0

    async def fake_run_token_command(argv):
        calls.append(("token", argv))
        return 2

    monkeypatch.setattr(
        "weisile_link.cli.run_device_command",
        fake_run_device_command,
    )
    monkeypatch.setattr(
        "weisile_link.cli.run_token_command",
        fake_run_token_command,
    )

    try:
        cli_main(["desktop-device", "rename", "--brick-id", "A", "--name", "B"])
    except SystemExit as exc:
        assert exc.code == 0

    try:
        cli_main(["desktop-token", "recover", "--brick-id", "A"])
    except SystemExit as exc:
        assert exc.code == 2

    assert calls == [
        ("device", ["rename", "--brick-id", "A", "--name", "B"]),
        ("token", ["recover", "--brick-id", "A"]),
    ]
