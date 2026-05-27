from __future__ import annotations

import struct
from typing import Iterable, List, Optional, Sequence


# Source basis:
# - LEGO MINDSTORMS EV3 Communication Developer Kit, Section 4, defines the
#   Direct Command header and Direct Reply layout.
# - EV3SC-owned Scratch official EV3 extension defines these constants and the
#   device-list, READSI, OUTPUT_STOP, and OUTPUT_GET_COUNT bytecode sequences.
DIRECT_COMMAND_REPLY = 0x00
DIRECT_COMMAND_NO_REPLY = 0x80
DIRECT_REPLY = 0x02
DIRECT_REPLY_ERROR = 0x04

ONE_BYTE = 0x81
TWO_BYTES = 0x82
FOUR_BYTES = 0x83
GLOBAL_VARIABLE_ONE_BYTE = 0xE1
GLOBAL_CONSTANT_INDEX_0 = 0x20
GLOBAL_VARIABLE_INDEX_0 = 0x60

OPINPUT_DEVICE_LIST = 0x98
OPINPUT_READSI = 0x9D
OPOUTPUT_STOP = 0xA3
OPOUTPUT_TIME_SPEED = 0xAF
OPOUTPUT_GET_COUNT = 0xB3
OPSOUND = 0x94
OPSOUND_CMD_TONE = 1

LAYER = 0
DO_NOT_CHANGE_TYPE = 0
MAX_DEVICES = 32
FLOAT_GLOBAL_ALLOCATION = 4
DEVICE_LIST_GLOBAL_ALLOCATION = 33


def _validate_byte(value: int, name: str) -> int:
    if value < 0 or value > 0xFF:
        raise ValueError(f"{name} must fit in one byte")
    return value


def _global_variable_index(index: int) -> List[int]:
    return [GLOBAL_VARIABLE_ONE_BYTE, _validate_byte(index, "global index")]


def build_direct_command(
    command_type: int,
    bytecode: Iterable[int],
    *,
    allocation: int = 0,
    message_counter: int = 0,
) -> bytes:
    """Build an EV3 Direct Command frame with the LEGO header layout."""
    if command_type not in (DIRECT_COMMAND_REPLY, DIRECT_COMMAND_NO_REPLY):
        raise ValueError("command_type must be a Direct Command type")
    if allocation < 0 or allocation > 0x3FF:
        raise ValueError("allocation must be 0..1023 global bytes")

    command = bytearray()
    command.extend(b"\x00\x00")
    command.append(message_counter & 0xFF)
    command.append((message_counter >> 8) & 0xFF)
    command.append(command_type)
    command.append(allocation & 0xFF)
    command.append((allocation >> 8) & 0xFF)
    command.extend(
        _validate_byte(value, "bytecode value") for value in bytecode
    )

    length = len(command) - 2
    command[0] = length & 0xFF
    command[1] = (length >> 8) & 0xFF
    return bytes(command)


def build_poll_device_list(*, message_counter: int = 0) -> bytes:
    """Request the official firmware device list into global memory."""
    return build_direct_command(
        DIRECT_COMMAND_REPLY,
        [
            OPINPUT_DEVICE_LIST,
            ONE_BYTE,
            MAX_DEVICES,
            GLOBAL_VARIABLE_INDEX_0,
            GLOBAL_VARIABLE_ONE_BYTE,
            GLOBAL_CONSTANT_INDEX_0,
        ],
        allocation=DEVICE_LIST_GLOBAL_ALLOCATION,
        message_counter=message_counter,
    )


def build_motor_stop(
    *,
    port_mask: int,
    brake: bool,
    message_counter: int = 0,
) -> bytes:
    """Build OUTPUT_STOP for one or more output ports."""
    return build_direct_command(
        DIRECT_COMMAND_NO_REPLY,
        [OPOUTPUT_STOP, LAYER, port_mask & 0x0F, 1 if brake else 0],
        message_counter=message_counter,
    )


def build_sensor_si_poll(
    *,
    port_index: int,
    mode: int,
    global_index: int = 0,
    message_counter: int = 0,
) -> bytes:
    """Read one sensor value as SI float from an official firmware EV3."""
    _validate_byte(port_index, "port_index")
    _validate_byte(mode, "mode")
    bytecode = [
        OPINPUT_READSI,
        LAYER,
        port_index,
        DO_NOT_CHANGE_TYPE,
        mode,
        *_global_variable_index(global_index),
    ]
    return build_direct_command(
        DIRECT_COMMAND_REPLY,
        bytecode,
        allocation=FLOAT_GLOBAL_ALLOCATION,
        message_counter=message_counter,
    )


def build_motor_count_poll(
    *,
    port_index: int,
    global_index: int = 0,
    message_counter: int = 0,
) -> bytes:
    """Read one motor rotation count from an official firmware EV3."""
    _validate_byte(port_index, "port_index")
    bytecode = [
        OPOUTPUT_GET_COUNT,
        LAYER,
        port_index,
        *_global_variable_index(global_index),
    ]
    return build_direct_command(
        DIRECT_COMMAND_REPLY,
        bytecode,
        allocation=FLOAT_GLOBAL_ALLOCATION,
        message_counter=message_counter,
    )


def build_sensor_motor_poll(
    sensor_modes: Sequence[Optional[int]],
    *,
    message_counter: int = 0,
) -> bytes:
    """Poll four sensor slots and four motor counts like Scratch EV3."""
    if len(sensor_modes) != 4:
        raise ValueError("sensor_modes must contain exactly four ports")

    bytecode: List[int] = []
    global_index = 0
    for port_index, mode in enumerate(sensor_modes):
        if mode is not None:
            _validate_byte(mode, "mode")
            bytecode.extend(
                [
                    OPINPUT_READSI,
                    LAYER,
                    port_index,
                    DO_NOT_CHANGE_TYPE,
                    mode,
                    *_global_variable_index(global_index),
                ]
            )
        global_index += FLOAT_GLOBAL_ALLOCATION

    for port_index in range(4):
        bytecode.extend(
            [
                OPOUTPUT_GET_COUNT,
                LAYER,
                port_index,
                *_global_variable_index(global_index),
            ]
        )
        global_index += FLOAT_GLOBAL_ALLOCATION

    return build_direct_command(
        DIRECT_COMMAND_REPLY,
        bytecode,
        allocation=global_index,
        message_counter=message_counter,
    )


def parse_direct_reply_payload(
    frame: bytes,
    *,
    expected_counter: Optional[int] = None,
) -> bytes:
    """Validate an EV3 Direct Reply frame and return global memory bytes."""
    if len(frame) < 5:
        raise ValueError("Direct Reply frame is too short")

    declared_length = frame[0] | (frame[1] << 8)
    actual_length = len(frame) - 2
    if declared_length != actual_length:
        raise ValueError("Direct Reply length header does not match frame")

    message_counter = frame[2] | (frame[3] << 8)
    if expected_counter is not None and message_counter != (
        expected_counter & 0xFFFF
    ):
        raise ValueError("Direct Reply message counter mismatch")

    reply_type = frame[4]
    if reply_type == DIRECT_REPLY_ERROR:
        raise ValueError("EV3 returned Direct Command error reply")
    if reply_type != DIRECT_REPLY:
        raise ValueError("frame is not an EV3 Direct Reply")

    return frame[5:]


def decode_float_globals(payload: bytes) -> List[float]:
    """Decode Direct Reply global memory as little-endian SI floats."""
    _validate_global_payload_size(payload)
    return [
        struct.unpack_from("<f", payload, offset)[0]
        for offset in range(0, len(payload), FLOAT_GLOBAL_ALLOCATION)
    ]


def decode_int32_globals(payload: bytes) -> List[int]:
    """Decode Direct Reply global memory as little-endian signed integers."""
    _validate_global_payload_size(payload)
    return [
        struct.unpack_from("<i", payload, offset)[0]
        for offset in range(0, len(payload), FLOAT_GLOBAL_ALLOCATION)
    ]


def _validate_global_payload_size(payload: bytes) -> None:
    if len(payload) % FLOAT_GLOBAL_ALLOCATION != 0:
        raise ValueError("global payload length must be a multiple of 4")
