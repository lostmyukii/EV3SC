import asyncio
import json

from weisile_link.cli import (
    WeisileLinkRuntimeConfig,
    build_server,
    main as cli_main,
    runtime_config_from_desktop_plan,
)
from weisile_link.desktop.profiles import (
    DesktopProfileStore,
    MemoryCredentialBackend,
    save_claimed_profile,
)
from weisile_link.desktop.runtime import (
    DesktopHealthState,
    DesktopRuntimeService,
    classroom_allowed_origins,
    run_desktop_start_command,
)
from weisile_link.transport.selector import AutoTransport


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


class FakeRuntimeTransport:
    def __init__(self, state, ev3_bt, pairing_token):
        self.state = state
        self.ev3_bt = ev3_bt
        self.pairing_token = pairing_token
        self.disconnected = False

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
                        "system": {"battery_v": 7.5},
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
        return FakeRuntimeTransport(state, ev3_bt, pairing_token)

    return build


def runtime_service(tmp_path, *, state=None):
    if state is None:
        state = {}
    credentials = MemoryCredentialBackend()
    store = DesktopProfileStore(tmp_path / "config.json")
    save_claimed_profile(
        dict(CLAIM_RESULT),
        credential_backend=credentials,
        profile_store=store,
    )
    return DesktopRuntimeService(
        credential_backend=credentials,
        profile_store=store,
        transport_factory=fake_transport_factory(state),
    )


def runtime_service_with_roster(tmp_path, *, state=None, expected_sensors=None):
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
                    "expected_sensors": expected_sensors or {"S4": "touch"},
                }
            ],
        }
    )
    save_claimed_profile(
        dict(CLAIM_RESULT),
        credential_backend=credentials,
        profile_store=store,
    )
    return DesktopRuntimeService(
        credential_backend=credentials,
        profile_store=store,
        transport_factory=fake_transport_factory(state),
    )


def runtime_service_with_two_profiles(tmp_path, *, state=None):
    if state is None:
        state = {}
    credentials = MemoryCredentialBackend()
    store = DesktopProfileStore(tmp_path / "config.json")
    save_claimed_profile(
        dict(CLAIM_RESULT),
        credential_backend=credentials,
        profile_store=store,
    )
    second_claim = dict(CLAIM_RESULT)
    second_claim.update(
        {
            "brick_id": "VSLE-EV3-9999",
            "brick_name": "Table 9 EV3",
            "ev3_bt": "A0:E6:F8:19:59:99",
            "pairing_token": "second-secret-token-1234567890",
        }
    )
    save_claimed_profile(
        second_claim,
        credential_backend=credentials,
        profile_store=store,
    )
    return DesktopRuntimeService(
        credential_backend=credentials,
        profile_store=store,
        transport_factory=fake_transport_factory(state),
    )


def test_prepare_startup_uses_saved_profile_without_safe_token_output(tmp_path):
    service = runtime_service(tmp_path)

    plan = service.prepare_startup(
        native_adapter_path="/Applications/WeisileLink/native/vsle-bt",
    )

    assert plan.state == DesktopHealthState.STARTING
    assert plan.transport == "vsle-bluetooth"
    assert plan.ev3_bt == "A0:E6:F8:19:58:3C"
    assert plan.pairing_token == "secret-token-1234567890"
    assert "http://101.42.92.6:18612" in plan.allowed_origins
    safe = json.dumps(plan.safe_payload())
    assert "secret-token-1234567890" not in safe
    assert "pairing_token" not in safe.lower()
    assert plan.safe_payload()["state"] == "starting"


def test_prepare_startup_can_select_non_default_profile_by_brick_id(tmp_path):
    service = runtime_service_with_two_profiles(tmp_path)

    plan = service.prepare_startup(brick_id="VSLE-EV3-583C")
    default_plan = service.prepare_startup()

    assert plan.profile["brick_id"] == "VSLE-EV3-583C"
    assert plan.ev3_bt == "A0:E6:F8:19:58:3C"
    assert plan.pairing_token == "secret-token-1234567890"
    assert default_plan.profile["brick_id"] == "VSLE-EV3-9999"
    assert default_plan.pairing_token == "second-secret-token-1234567890"
    assert "secret-token" not in json.dumps(plan.safe_payload()).lower()


def test_prepare_startup_without_profile_reports_needs_pairing(tmp_path):
    service = DesktopRuntimeService(
        credential_backend=MemoryCredentialBackend(),
        profile_store=DesktopProfileStore(tmp_path / "config.json"),
    )

    plan = service.prepare_startup()

    assert plan.state == DesktopHealthState.NEEDS_PAIRING
    assert plan.safe_payload()["checks"]["credential"] is False


def test_ready_status_reports_ready_after_sensor_frame(tmp_path):
    state = {}
    service = runtime_service(tmp_path, state=state)

    plan = asyncio.run(service.ready_status(timeout_s=0.1))

    assert plan.state == DesktopHealthState.READY
    assert plan.safe_payload()["checks"]["sensor_updates_observed"] == 1
    assert state["connect_token"] == "secret-token-1234567890"


def test_ready_status_uses_roster_expected_sensors(tmp_path):
    state = {
        "sensor_payload": {
            "type": "sensor_update",
            "sensors": {"S1": {"type": "color"}, "S4": {"pressed": 1}},
            "motors": {},
            "system": {"battery_v": 7.5},
        }
    }
    service = runtime_service_with_roster(
        tmp_path,
        state=state,
        expected_sensors={"S1": "color", "S4": "touch"},
    )

    plan = asyncio.run(service.ready_status(timeout_s=0.1))

    assert plan.state == DesktopHealthState.READY
    assert plan.safe_payload()["checks"]["expected_sensors"] == {
        "S1": "color",
        "S4": "touch",
    }
    assert plan.safe_payload()["checks"]["observed_sensors"] == {
        "S1": "color",
        "S4": "touch",
    }
    assert plan.safe_payload()["checks"]["missing_expected_sensors"] == {}


def test_ready_status_reports_missing_roster_sensor(tmp_path):
    state = {
        "sensor_payload": {
            "type": "sensor_update",
            "sensors": {"S4": {"pressed": 1}},
            "motors": {},
            "system": {"battery_v": 7.5},
        }
    }
    service = runtime_service_with_roster(
        tmp_path,
        state=state,
        expected_sensors={"S1": "color", "S4": "touch"},
    )

    plan = asyncio.run(service.ready_status(timeout_s=0.01))

    assert plan.state == DesktopHealthState.NEEDS_ATTENTION
    assert "expected sensors not observed" in plan.message.lower()
    assert plan.safe_payload()["checks"]["missing_expected_sensors"] == {
        "S1": "color"
    }


def test_ready_status_reports_needs_attention_without_sensor_frame(tmp_path):
    state = {"emit_sensor": False}
    service = runtime_service(tmp_path, state=state)

    plan = asyncio.run(service.ready_status(timeout_s=0.01))

    assert plan.state == DesktopHealthState.NEEDS_ATTENTION
    assert "timeout" in plan.message.lower()
    assert plan.safe_payload()["checks"]["sensor_stream"] == "failed"


def test_run_desktop_start_command_runs_runtime_from_profile(tmp_path, capsys):
    service = runtime_service(tmp_path)
    runtime_configs = []

    def service_factory(_args):
        return service

    def config_factory(args, plan):
        return runtime_config_from_desktop_plan(args, plan)

    async def runtime_runner(config):
        runtime_configs.append(config)

    exit_code = asyncio.run(
        run_desktop_start_command(
            ["--native-adapter", "/native/vsle-bt"],
            service_factory=service_factory,
            runtime_config_factory=config_factory,
            runtime_runner=runtime_runner,
        )
    )

    output = capsys.readouterr().out
    payload = json.loads(output)
    assert exit_code == 0
    assert payload["state"] == "starting"
    assert runtime_configs[0].pairing_token == "secret-token-1234567890"
    assert runtime_configs[0].transport == "vsle-bluetooth"
    assert runtime_configs[0].vsle_bt_adapter == "/native/vsle-bt"
    assert "secret-token-1234567890" not in output
    assert "pairing_token" not in output.lower()


def test_run_desktop_start_command_check_only_uses_ready_state(
    tmp_path, capsys
):
    service = runtime_service(tmp_path)

    exit_code = asyncio.run(
        run_desktop_start_command(
            ["--check-only", "--ready-timeout", "0.1"],
            service_factory=lambda _args: service,
        )
    )

    payload = json.loads(capsys.readouterr().out)
    assert exit_code == 0
    assert payload["state"] == "ready"
    assert payload["checks"]["sensor_stream"] == "fresh"


def test_classroom_allowed_origins_adds_public_scratchai_origin_once():
    origins = classroom_allowed_origins(
        "http://101.42.92.6:18612/",
        ("http://101.42.92.6:18612",),
    )

    assert origins.count("http://101.42.92.6:18612") == 1


def test_build_server_uses_runtime_config_pairing_token():
    config = WeisileLinkRuntimeConfig(
        transport="vsle-bluetooth",
        ev3_bt="00:16:53:AA:BB:CC",
        pairing_token="stored-secret-token",
    )

    server = build_server(config)

    assert isinstance(server.transport, AutoTransport)
    assert (
        server.transport.bluetooth_transport._pairing_token
        == "stored-secret-token"
    )


def test_cli_dispatches_desktop_start_subcommand(monkeypatch):
    calls = []

    async def fake_run_desktop_start_command(argv, **kwargs):
        calls.append((argv, sorted(kwargs)))
        return 3

    monkeypatch.setattr(
        "weisile_link.cli.run_desktop_start_command",
        fake_run_desktop_start_command,
    )

    try:
        cli_main(["desktop-start", "--check-only"])
    except SystemExit as exc:
        assert exc.code == 3

    assert calls == [
        (
            ["--check-only"],
            ["runtime_config_factory", "runtime_runner"],
        )
    ]
