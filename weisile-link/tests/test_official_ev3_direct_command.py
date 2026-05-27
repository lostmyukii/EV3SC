import struct

from weisile_link.protocol.official_ev3_direct_command import (
    DIRECT_COMMAND_NO_REPLY,
    DIRECT_COMMAND_REPLY,
    DIRECT_REPLY,
    DIRECT_REPLY_ERROR,
    OPINPUT_DEVICE_LIST,
    OPINPUT_READSI,
    OPOUTPUT_GET_COUNT,
    OPOUTPUT_STOP,
    build_direct_command,
    build_sensor_motor_poll,
    decode_float_globals,
    decode_int32_globals,
    build_motor_count_poll,
    build_motor_stop,
    build_poll_device_list,
    build_sensor_si_poll,
    parse_direct_reply_payload,
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


def test_build_sensor_motor_poll_matches_scratch_global_layout():
    command = build_sensor_motor_poll([1, None, None, 0])

    assert command[4] == DIRECT_COMMAND_REPLY
    assert command[5] == 32
    assert command[7] == OPINPUT_READSI
    assert command[13] == 0
    assert command[14] == OPINPUT_READSI
    assert command[20] == 12
    assert command[21] == OPOUTPUT_GET_COUNT


def test_parse_direct_reply_payload_validates_header_and_counter():
    payload = struct.pack("<f", 42.5)
    reply = _direct_reply(payload, message_counter=0x1234)

    parsed = parse_direct_reply_payload(reply, expected_counter=0x1234)

    assert parsed == payload


def test_parse_direct_reply_payload_rejects_error_reply():
    reply = _direct_reply(b"", reply_type=DIRECT_REPLY_ERROR)

    try:
        parse_direct_reply_payload(reply)
    except ValueError as exc:
        assert "error reply" in str(exc)
    else:
        raise AssertionError("expected Direct Reply error to be rejected")


def test_decode_direct_reply_globals_as_float_and_signed_int32():
    payload = (
        struct.pack("<f", 42.5)
        + struct.pack("<f", -3.25)
        + struct.pack("<i", -360)
    )

    assert decode_float_globals(payload[:8]) == [42.5, -3.25]
    assert decode_int32_globals(payload[8:]) == [-360]


def _direct_reply(
    payload: bytes,
    *,
    message_counter: int = 0,
    reply_type: int = DIRECT_REPLY,
) -> bytes:
    frame = bytearray()
    frame.extend(b"\x00\x00")
    frame.append(message_counter & 0xFF)
    frame.append((message_counter >> 8) & 0xFF)
    frame.append(reply_type)
    frame.extend(payload)
    frame[0] = (len(frame) - 2) & 0xFF
    frame[1] = ((len(frame) - 2) >> 8) & 0xFF
    return bytes(frame)
