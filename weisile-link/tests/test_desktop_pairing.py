import asyncio
import json

from weisile_link.desktop.pairing import (
    DesktopPairingService,
    run_pairing_command,
)
from weisile_link.desktop.profiles import (
    DesktopProfileStore,
    MemoryCredentialBackend,
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


class FakePairingTransport:
    def __init__(self, state, ev3_bt, pairing_token):
        self.state = state
        self.ev3_bt = ev3_bt
        self.pairing_token = pairing_token
        self.disconnected = False

    async def claim(self, **params):
        self.state["claim_params"] = params
        return dict(CLAIM_RESULT)

    async def connect(self, on_sensor_data):
        self.state["connect_token"] = self.pairing_token
        if not self.state.get("connect_ok", True):
            return False
        if self.state.get("emit_sensor", True):
            await on_sensor_data(
                self.state.get(
                    "sensor_payload",
                    {
                        "type": "sensor_update",
                        "sensors": {"S4": {"pressed": 1}},
                        "motors": {},
                        "system": {},
                    },
                )
            )
        return True

    async def disconnect(self):
        self.disconnected = True
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
        return FakePairingTransport(state, ev3_bt, pairing_token)

    return build


def test_pairing_service_claims_saves_profile_and_ready_checks(tmp_path):
    state = {}
    credentials = MemoryCredentialBackend()
    store = DesktopProfileStore(tmp_path / "config.json")
    service = DesktopPairingService(
        credential_backend=credentials,
        profile_store=store,
        transport_factory=fake_transport_factory(state),
    )

    result = asyncio.run(
        service.pair_ev3(
            ev3_bt="A0:E6:F8:19:58:3C",
            claim_code="12345678",
            host_id="teacher-macbook-01",
            host_public_key="",
            native_adapter_path="/Applications/WeisileLink/native/vsle-bt",
            ready_timeout_s=0.1,
        )
    )

    assert result.paired is True
    assert result.ready is True
    assert result.profile["brick_id"] == "VSLE-EV3-583C"
    assert result.profile["token_ref"] == "memory:vsle/VSLE-EV3-583C"
    assert result.ready_check["sensor_updates_observed"] == 1
    assert state["claim_params"]["claim_code"] == "12345678"
    assert state["claim_params"]["host_id"] == "teacher-macbook-01"
    assert state["connect_token"] == "secret-token-1234567890"
    assert state["transport_builds"][0]["pairing_token"] == ""
    assert state["transport_builds"][1]["pairing_token"] == (
        "secret-token-1234567890"
    )
    config_text = (tmp_path / "config.json").read_text(encoding="utf-8")
    assert "secret-token-1234567890" not in config_text
    assert "pairing_token" not in config_text.lower()


def test_pairing_service_keeps_profile_when_ready_check_times_out(tmp_path):
    state = {"emit_sensor": False}
    service = DesktopPairingService(
        credential_backend=MemoryCredentialBackend(),
        profile_store=DesktopProfileStore(tmp_path / "config.json"),
        transport_factory=fake_transport_factory(state),
    )

    result = asyncio.run(
        service.pair_ev3(
            ev3_bt="A0:E6:F8:19:58:3C",
            claim_code="12345678",
            host_id="teacher-macbook-01",
            ready_timeout_s=0.01,
        )
    )

    assert result.paired is True
    assert result.ready is False
    assert result.ready_check["connected"] is True
    assert result.ready_check["sensor_updates_observed"] == 0
    assert "timeout" in result.ready_check["error"].lower()
    assert (tmp_path / "config.json").exists()


def test_pairing_service_uses_imported_roster_ready_layout(tmp_path):
    state = {
        "sensor_payload": {
            "type": "sensor_update",
            "sensors": {"S1": {"reflected": 22}, "S4": {"pressed": 1}},
            "motors": {},
            "system": {},
        }
    }
    credentials = MemoryCredentialBackend()
    store = DesktopProfileStore(tmp_path / "config.json")
    store.import_roster(
        {
            "devices": [
                {
                    "brick_id": "VSLE-EV3-583C",
                    "label": "EV3-01",
                    "expected_sensors": {"S1": "color", "S4": "touch"},
                }
            ]
        }
    )
    service = DesktopPairingService(
        credential_backend=credentials,
        profile_store=store,
        transport_factory=fake_transport_factory(state),
    )

    result = asyncio.run(
        service.pair_ev3(
            ev3_bt="A0:E6:F8:19:58:3C",
            claim_code="12345678",
            host_id="teacher-macbook-01",
            ready_timeout_s=0.1,
        )
    )

    assert result.ready is True
    assert result.profile["name"] == "EV3-01"
    assert result.profile["expected_sensors"] == {"S1": "color", "S4": "touch"}
    assert result.ready_check["observed_sensors"] == {
        "S1": "color",
        "S4": "touch",
    }


def test_run_pairing_command_prints_safe_json_without_token(tmp_path, capsys):
    state = {}

    def service_factory(_args):
        return DesktopPairingService(
            credential_backend=MemoryCredentialBackend(),
            profile_store=DesktopProfileStore(tmp_path / "config.json"),
            transport_factory=fake_transport_factory(state),
        )

    exit_code = asyncio.run(
        run_pairing_command(
            [
                "--ev3-bt",
                "A0:E6:F8:19:58:3C",
                "--claim-code",
                "12345678",
                "--host-id",
                "teacher-macbook-01",
                "--ready-timeout",
                "0.1",
            ],
            service_factory=service_factory,
        )
    )

    output = capsys.readouterr().out
    payload = json.loads(output)
    assert exit_code == 0
    assert payload["paired"] is True
    assert payload["ready"] is True
    assert payload["profile"]["token_ref"] == "memory:vsle/VSLE-EV3-583C"
    assert "secret-token-1234567890" not in output
    assert "pairing_token" not in output.lower()


def test_run_pairing_command_returns_needs_attention_on_ready_failure(
    tmp_path, capsys
):
    state = {"connect_ok": False}

    def service_factory(_args):
        return DesktopPairingService(
            credential_backend=MemoryCredentialBackend(),
            profile_store=DesktopProfileStore(tmp_path / "config.json"),
            transport_factory=fake_transport_factory(state),
        )

    exit_code = asyncio.run(
        run_pairing_command(
            [
                "--ev3-bt",
                "A0:E6:F8:19:58:3C",
                "--claim-code",
                "12345678",
                "--host-id",
                "teacher-macbook-01",
            ],
            service_factory=service_factory,
        )
    )

    payload = json.loads(capsys.readouterr().out)
    assert exit_code == 2
    assert payload["paired"] is True
    assert payload["ready"] is False
    assert payload["ready_check"]["connected"] is False


def test_cli_dispatches_desktop_pair_subcommand(monkeypatch):
    calls = []

    async def fake_run_pairing_command(argv):
        calls.append(argv)
        return 2

    monkeypatch.setattr(
        "weisile_link.cli.run_pairing_command",
        fake_run_pairing_command,
    )

    try:
        cli_main(["desktop-pair", "--ev3-bt", "A0:E6:F8:19:58:3C"])
    except SystemExit as exc:
        assert exc.code == 2

    assert calls == [["--ev3-bt", "A0:E6:F8:19:58:3C"]]
