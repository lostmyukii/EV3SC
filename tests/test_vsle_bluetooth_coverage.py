from pathlib import Path

from scripts.generate_vsle_bluetooth_coverage import (
    CoverageRow,
    generate_coverage_rows,
    render_markdown,
)


ROOT = Path(__file__).resolve().parents[1]


def test_full_vsle_bluetooth_matrix_has_no_unknown_current_blocks():
    rows = generate_coverage_rows(ROOT)

    assert rows
    unknown = [
        row for row in rows if row.full_vsle_bluetooth_status == "unknown"
    ]
    assert unknown == []

    opcodes = {row.opcode for row in rows}
    assert "motorRunTimed" in opcodes
    assert "getGyroAngle" in opcodes
    assert "playTone" in opcodes
    assert "displayText" in opcodes
    assert "startDataCollection" in opcodes
    assert "updateAIQuestPrediction" in opcodes


def test_cache_backed_blocks_are_not_marked_ev3_dispatched():
    rows = generate_coverage_rows(ROOT)
    by_opcode = {row.opcode: row for row in rows}

    assert by_opcode["getUltrasonicDistance"].full_vsle_bluetooth_status == (
        "cache-backed"
    )
    assert by_opcode["getTouchPressed"].full_vsle_bluetooth_status == (
        "cache-backed"
    )
    assert by_opcode["getBatteryLevel"].full_vsle_bluetooth_status == (
        "cache-backed"
    )
    assert by_opcode["isColor"].full_vsle_bluetooth_status == "cache-backed"
    assert by_opcode["isUltrasonicNear"].full_vsle_bluetooth_status == (
        "cache-backed"
    )


def test_official_firmware_compatibility_stays_separate():
    rows = generate_coverage_rows(ROOT)
    by_opcode = {row.opcode: row for row in rows}

    assert by_opcode["motorStop"].official_firmware_status in {
        "native",
        "compatibility-unavailable",
    }
    assert by_opcode["motorSetPID"].official_firmware_status == (
        "compatibility-unavailable"
    )
    assert by_opcode["uploadToTrainer"].official_firmware_status == (
        "host-side"
    )


def test_markdown_report_is_deterministic_and_mentions_source_files():
    rows = [
        CoverageRow(
            module="Motor",
            opcode="motorStop",
            block_type="command",
            method="motor.stop",
            full_vsle_bluetooth_status="ev3-dispatched",
            official_firmware_status="native",
            source="vsle-ev3-extension/index.js",
        )
    ]

    markdown = render_markdown(rows)

    assert "# VSLE Bluetooth Full Module Command Coverage" in markdown
    assert "`vsle-ev3-extension/index.js`" in markdown
    assert (
        "| Motor | `motorStop` | command | `motor.stop` | "
        "ev3-dispatched | native |"
    ) in markdown
