from weisile_link.protocol.errors import ErrorCode
from weisile_link.runtime.degradation import (
    DegradationManager,
    SensorSnapshot,
    TransportKind,
)
from weisile_link.runtime.reconnect import ReconnectPolicy


def test_reconnect_policy_uses_spec_backoff_with_deterministic_jitter():
    policy = ReconnectPolicy(
        jitter_fraction=0.1,
        jitter_source=lambda attempt: 1.0 if attempt % 2 else -1.0,
    )

    assert policy.delay_for_attempt(1) == 0.55
    assert policy.delay_for_attempt(2) == 0.9
    assert policy.delay_for_attempt(3) == 2.2
    assert policy.delay_for_attempt(4) == 4.5
    assert policy.delay_for_attempt(9) == 5.0


def test_degradation_prefers_wifi_then_bluetooth_when_supported():
    manager = DegradationManager(bluetooth_supported=True)

    assert manager.choose_next_transport() == TransportKind.WIFI

    manager.record_transport_failure(TransportKind.WIFI, "wifi down")

    assert manager.choose_next_transport() == TransportKind.BLUETOOTH


def test_degradation_does_not_try_bluetooth_without_stdlib_rfcomm():
    manager = DegradationManager(bluetooth_supported=False)
    manager.record_transport_failure(TransportKind.WIFI, "wifi down")

    assert manager.choose_next_transport() is None
    assert manager.connection_state.connected is False


def test_no_transport_returns_json_rpc_command_error():
    manager = DegradationManager(bluetooth_supported=False)
    manager.record_transport_failure(TransportKind.WIFI, "wifi down")

    response = manager.command_error_response("req-9", "motor.runTimed")

    assert response["error"]["code"] == "EV3_TRANSPORT_DISCONNECTED"
    assert response["error"]["data"] == {
        "method": "motor.runTimed",
        "retryable": True,
        "wifi_failed": True,
        "bluetooth_failed": False,
    }


def test_reconnect_clears_pending_commands_and_keeps_collected_data_count():
    manager = DegradationManager(bluetooth_supported=True)
    manager.mark_command_pending("cmd-1")
    manager.mark_command_pending("cmd-2")
    manager.record_collected_points(12)
    manager.record_transport_failure(TransportKind.WIFI, "wifi down")

    cleared = manager.record_reconnected(TransportKind.BLUETOOTH)

    assert cleared == ("cmd-1", "cmd-2")
    assert manager.connection_state.connected is True
    assert manager.connection_state.active_transport == TransportKind.BLUETOOTH
    assert manager.pending_command_ids == ()
    assert manager.collected_points == 12


def test_trainer_unavailable_does_not_break_robot_control():
    manager = DegradationManager(bluetooth_supported=True)
    manager.record_reconnected(TransportKind.WIFI)
    manager.record_trainer_unavailable("upload refused")

    response = manager.trainer_error_response("trainer-1")

    assert manager.connection_state.connected is True
    assert response["error"]["code"] == "TRAINER_UNAVAILABLE"
    assert response["error"]["data"]["retryable"] is True


def test_sensor_stale_after_200ms_returns_last_safe_value_and_disconnects():
    manager = DegradationManager(bluetooth_supported=True)
    manager.record_reconnected(TransportKind.WIFI)
    manager.record_sensor_snapshot(
        "sensors.S2.distance_cm",
        SensorSnapshot(value=23.4, received_at_ms=1_000),
    )

    stale = manager.get_sensor_value(
        "sensors.S2.distance_cm",
        now_ms=1_250,
        default=0,
    )

    assert stale.value == 23.4
    assert stale.stale is True
    assert stale.error_code == ErrorCode.EV3_SENSOR_STALE
    assert manager.connection_state.connected is False


def test_data_buffer_full_error_when_collection_cap_is_reached():
    manager = DegradationManager(max_collected_points=3)
    manager.record_collected_points(3)

    response = manager.data_buffer_error_response("data-1")

    assert response["error"]["code"] == "DATA_BUFFER_FULL"
    assert response["error"]["data"] == {
        "collected_points": 3,
        "max_collected_points": 3,
        "retryable": False,
    }
