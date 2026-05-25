import importlib.util
from pathlib import Path


ROOT = Path("/Users/yukii/Desktop/EV3SC")


class _Consumer:
    consumer_type = "scratch"


def _load_preview_server():
    module_path = ROOT / "preview/weisile_preview_server.py"
    spec = importlib.util.spec_from_file_location(
        "weisile_preview_server_under_test",
        module_path,
    )
    module = importlib.util.module_from_spec(spec)
    assert spec is not None
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_preview_backend_targets_section_13_7_sensor_freshness():
    module = _load_preview_server()
    source = (ROOT / "preview/weisile_preview_server.py").read_text(
        encoding="utf-8"
    )

    assert module.SENSOR_INTERVAL_SECONDS <= 1.0 / 45.0
    assert "await asyncio.sleep(sleep_for)" in source
    assert "next_tick += SENSOR_INTERVAL_SECONDS" in source
    assert "sleep_for = 0.0" in source
    assert "time.monotonic()" in source


def test_preview_backend_can_create_30_simulated_ev3_sessions():
    module = _load_preview_server()

    server = module.build_preview_server(
        host="127.0.0.1",
        link_port=20211,
        trainer_port=18766,
        preview_ev3_count=30,
    )

    peripherals = server.sessions.peripheral_payloads()

    assert len(peripherals) == 30
    assert peripherals[0]["peripheralId"] == "vsle-ev3-wifi"
    assert peripherals[1]["peripheralId"] == "vsle-ev3-wifi-02"
    assert peripherals[-1]["peripheralId"] == "vsle-ev3-wifi-30"
    assert all(
        server.sessions.require_session(
            peripheral["peripheralId"]
        ).transport.active_transport_name
        == "preview"
        for peripheral in peripherals
    )


def test_preview_sensor_loop_skips_idle_multi_device_sessions():
    module = _load_preview_server()
    server = module.build_preview_server(
        host="127.0.0.1",
        link_port=20211,
        trainer_port=18766,
        preview_ev3_count=30,
    )
    idle_session = server.sessions.require_session("vsle-ev3-wifi-02")

    assert module._preview_session_is_active(idle_session) is False

    idle_session.router.register(_Consumer())

    assert module._preview_session_is_active(idle_session) is True
