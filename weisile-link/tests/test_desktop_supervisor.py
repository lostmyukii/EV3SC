import asyncio
import json

from weisile_link.cli import main as cli_main
from weisile_link.desktop.profiles import (
    DesktopProfileStore,
    MemoryCredentialBackend,
    save_claimed_profile,
)
from weisile_link.desktop.runtime import (
    DesktopHealthState,
    DesktopRuntimeService,
)
from weisile_link.desktop.supervisor import (
    DesktopSupervisorService,
    build_desktop_start_command,
    run_supervisor_command,
    wait_for_local_ports,
)


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


class FakeTransport:
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
        return FakeTransport(state, pairing_token)

    return build


def runtime_service(tmp_path, *, state=None, with_profile=True):
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


def test_supervisor_without_profile_routes_to_pairing_and_does_not_start(
    tmp_path,
):
    launched = []
    service = DesktopSupervisorService(
        runtime_service=runtime_service(tmp_path, with_profile=False),
        process_launcher=lambda command: launched.append(command),
    )

    result = asyncio.run(service.start())

    assert result.state == DesktopHealthState.NEEDS_PAIRING
    assert result.process_started is False
    assert launched == []
    assert result.safe_payload()["diagnostics"]["teacher_action"] == (
        "Open pairing wizard."
    )


def test_supervisor_starts_bridge_and_opens_scratchai_when_ready(tmp_path):
    launched = []
    opened = []
    service = DesktopSupervisorService(
        runtime_service=runtime_service(tmp_path),
        process_launcher=lambda command: launched.append(tuple(command)),
        port_checker=lambda host, port: True,
        browser_opener=lambda url: opened.append(url) or True,
        python_executable="/Applications/WeisileLink.app/Contents/MacOS/WeisileLink",
    )

    result = asyncio.run(
        service.start(
            config_path=str(tmp_path / "config.json"),
            native_adapter_path="/native/vsle-bt",
            open_scratchai=True,
            port_timeout_s=0.01,
            port_interval_s=0.01,
        )
    )

    payload = result.safe_payload()
    command_text = " ".join(launched[0])
    assert result.state == DesktopHealthState.READY
    assert result.process_started is True
    assert result.browser_opened is True
    assert opened == ["http://101.42.92.6:18612/"]
    assert "--config" in launched[0]
    assert "--native-adapter" in launched[0]
    assert "desktop-start" in launched[0]
    assert "secret-token-1234567890" not in command_text
    assert "pairing_token" not in json.dumps(payload).lower()
    assert payload["ports"] == {"20111": True, "8766": True}


def test_supervisor_starts_selected_profile_by_brick_id(tmp_path):
    state = {}
    launched = []
    service = DesktopSupervisorService(
        runtime_service=runtime_service_with_two_profiles(
            tmp_path, state=state
        ),
        process_launcher=lambda command: launched.append(tuple(command)),
        port_checker=lambda host, port: True,
        python_executable="/bin/weisilelink",
    )

    result = asyncio.run(
        service.start(
            brick_id="VSLE-EV3-583C",
            port_timeout_s=0.01,
            port_interval_s=0.01,
        )
    )

    command = list(launched[0])
    assert result.state == DesktopHealthState.READY
    assert result.startup["profile"]["brick_id"] == "VSLE-EV3-583C"
    assert state["connect_token"] == "secret-token-1234567890"
    assert "--brick-id" in command
    assert command[command.index("--brick-id") + 1] == "VSLE-EV3-583C"
    assert "secret-token" not in json.dumps(result.safe_payload()).lower()


def test_supervisor_ready_check_failure_routes_to_attention(tmp_path):
    service = DesktopSupervisorService(
        runtime_service=runtime_service(tmp_path, state={"emit_sensor": False}),
        process_launcher=lambda command: None,
        port_checker=lambda host, port: True,
    )

    result = asyncio.run(
        service.start(ready_timeout_s=0.01, port_timeout_s=0.01)
    )

    assert result.state == DesktopHealthState.NEEDS_ATTENTION
    assert result.process_started is False
    assert result.diagnostics["teacher_action"] == "Open guided diagnostics."


def test_supervisor_port_failure_routes_to_attention(tmp_path):
    launched = []
    service = DesktopSupervisorService(
        runtime_service=runtime_service(tmp_path),
        process_launcher=lambda command: launched.append(command),
        port_checker=lambda host, port: port == 20111,
    )

    result = asyncio.run(
        service.start(port_timeout_s=0.01, port_interval_s=0.01)
    )

    assert launched
    assert result.state == DesktopHealthState.NEEDS_ATTENTION
    assert result.process_started is True
    assert result.ports == {"20111": True, "8766": False}
    assert result.diagnostics["local_bridge"] == "port_check_failed"


def test_run_supervisor_command_prints_safe_json(tmp_path, capsys):
    service = DesktopSupervisorService(
        runtime_service=runtime_service(tmp_path),
        process_launcher=lambda command: None,
        port_checker=lambda host, port: True,
        browser_opener=lambda url: True,
        python_executable="/bin/weisilelink",
    )

    exit_code = asyncio.run(
        run_supervisor_command(
            [
                "--config",
                str(tmp_path / "config.json"),
                "--open-scratchai",
                "--port-timeout",
                "0.01",
            ],
            service_factory=lambda _args: service,
        )
    )

    output = capsys.readouterr().out
    payload = json.loads(output)
    assert exit_code == 0
    assert payload["state"] == "ready"
    assert payload["browser_opened"] is True
    assert "secret-token-1234567890" not in output
    assert "pairing_token" not in output.lower()


def test_build_desktop_start_command_contains_no_secret_material():
    command = build_desktop_start_command(
        python_executable="/bin/weisilelink",
        config_path="/config.json",
        brick_id="VSLE-EV3-583C",
        native_adapter_path="/native/vsle-bt",
        extra_allowed_origins=("http://101.42.92.6:18612",),
    )
    text = " ".join(command)

    assert command[:4] == [
        "/bin/weisilelink",
        "-m",
        "weisile_link",
        "desktop-start",
    ]
    assert "--config" in command
    assert "--allowed-origin" in command
    assert "token" not in text.lower()


def test_wait_for_local_ports_uses_checker_until_all_ports_open():
    calls = []

    def checker(host, port):
        calls.append((host, port))
        return port == 20111 or calls.count((host, port)) > 1

    status = asyncio.run(
        wait_for_local_ports(
            "127.0.0.1",
            (20111, 8766),
            checker=checker,
            timeout_s=0.05,
            interval_s=0.01,
        )
    )

    assert status == {20111: True, 8766: True}
    assert ("127.0.0.1", 20111) in calls
    assert calls.count(("127.0.0.1", 8766)) == 2


def test_cli_dispatches_desktop_supervise_subcommand(monkeypatch):
    calls = []

    async def fake_run_supervisor_command(argv):
        calls.append(argv)
        return 2

    monkeypatch.setattr(
        "weisile_link.cli.run_supervisor_command",
        fake_run_supervisor_command,
    )

    try:
        cli_main(["desktop-supervise", "--open-scratchai"])
    except SystemExit as exc:
        assert exc.code == 2

    assert calls == [["--open-scratchai"]]
