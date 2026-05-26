from weisile_link.protocol.official_ev3_direct_command import (
    DIRECT_COMMAND_NO_REPLY,
    DIRECT_COMMAND_REPLY,
    OPINPUT_DEVICE_LIST,
    OPINPUT_READSI,
    OPOUTPUT_GET_COUNT,
    OPOUTPUT_STOP,
    build_direct_command,
    build_motor_count_poll,
    build_motor_stop,
    build_poll_device_list,
    build_sensor_si_poll,
)


def test_build_direct_command_adds_size_and_header():
    payload = [OPOUTPUT_STOP, 0, 1, 1]

    command = build_direct_command(DIRECT_COMMAND_NO_REPLY, payload)

    assert command[0] == len(command) - 2
    assert command[1] == 0
    assert command[2] == 0
    assert command[3] == 0
    assert command[4] == DIRECT_COMMAND_NO_REPLY
    assert command[7:] == bytes(payload)


def test_build_direct_command_encodes_counter_and_allocation_little_endian():
    command = build_direct_command(
        DIRECT_COMMAND_REPLY,
        [OPINPUT_DEVICE_LIST],
        allocation=0x0123,
        message_counter=0x4567,
    )

    assert command[2:4] == bytes([0x67, 0x45])
    assert command[5:7] == bytes([0x23, 0x01])


def test_build_motor_stop_uses_output_stop_opcode():
    command = build_motor_stop(port_mask=1, brake=True)

    assert command[4] == DIRECT_COMMAND_NO_REPLY
    assert command[7] == OPOUTPUT_STOP
    assert command[-1] == 1


def test_build_motor_stop_masks_invalid_port_bits():
    command = build_motor_stop(port_mask=0xFF, brake=False)

    assert command[9] == 0x0F
    assert command[-1] == 0


def test_build_poll_device_list_requests_33_bytes():
    command = build_poll_device_list()

    assert command[4] == DIRECT_COMMAND_REPLY
    assert command[5] == 33
    assert OPINPUT_DEVICE_LIST in command


def test_build_sensor_si_poll_uses_input_readsi_and_allocates_float():
    command = build_sensor_si_poll(port_index=2, mode=1)

    assert command[4] == DIRECT_COMMAND_REPLY
    assert command[5] == 4
    assert command[7] == OPINPUT_READSI
    assert command[9] == 2


def test_build_motor_count_poll_uses_output_get_count():
    command = build_motor_count_poll(port_index=3)

    assert command[4] == DIRECT_COMMAND_REPLY
    assert command[5] == 4
    assert command[7] == OPOUTPUT_GET_COUNT
    assert command[9] == 3
