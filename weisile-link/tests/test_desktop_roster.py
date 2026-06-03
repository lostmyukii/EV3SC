import json

from weisile_link.cli import main as cli_main


def test_desktop_roster_import_and_export_cli(tmp_path, capsys):
    config = tmp_path / "config.json"
    roster = tmp_path / "roster.json"
    exported = tmp_path / "exported.json"
    roster.write_text(
        json.dumps(
            {
                "classroom_id": "school-a-room-302",
                "scratchai_url": "http://101.42.92.6:18612/",
                "devices": [
                    {
                        "brick_id": "VSLE-EV3-583C",
                        "label": "EV3-01",
                        "ev3_bt": "A0:E6:F8:19:58:3C",
                        "expected_sensors": {
                            "S1": "color",
                            "S2": "ultrasonic",
                            "S3": "gyro",
                            "S4": "touch",
                        },
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    _run_cli(
        "desktop-roster",
        "--config",
        str(config),
        "import",
        "--input",
        str(roster),
    )
    import_output = json.loads(capsys.readouterr().out)

    assert import_output["imported"] is True
    assert import_output["devices"] == 1

    _run_cli(
        "desktop-roster",
        "--config",
        str(config),
        "export",
        "--output",
        str(exported),
    )
    export_output = json.loads(capsys.readouterr().out)
    exported_payload = json.loads(exported.read_text(encoding="utf-8"))
    encoded = json.dumps(exported_payload).lower()

    assert export_output["exported"] is True
    assert (
        exported_payload["devices"][0]["expected_sensors"]["S2"] == "ultrasonic"
    )
    assert "pairing_token" not in encoded
    assert "token_ref" not in encoded


def test_desktop_roster_cli_returns_error_for_invalid_json(tmp_path):
    config = tmp_path / "config.json"
    roster = tmp_path / "bad.json"
    roster.write_text("{", encoding="utf-8")

    try:
        cli_main(
            [
                "desktop-roster",
                "--config",
                str(config),
                "import",
                "--input",
                str(roster),
            ]
        )
    except SystemExit as exc:
        assert exc.code != 0
    else:
        raise AssertionError("invalid roster JSON should exit non-zero")


def _run_cli(*args):
    try:
        cli_main(list(args))
    except SystemExit as exc:
        assert exc.code == 0
