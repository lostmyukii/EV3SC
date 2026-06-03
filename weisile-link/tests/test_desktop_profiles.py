import json
import os
import subprocess
from datetime import datetime, timezone

import pytest

from weisile_link.desktop.profiles import (
    DesktopProfileError,
    DesktopProfileStore,
    MacOSKeychainBackend,
    MemoryCredentialBackend,
    WindowsCredentialManagerBackend,
    credential_backend_for_platform,
    default_config_path,
    resolve_profile_environment,
    save_claimed_profile,
)


def claim_result(token="secret-token-1234567890"):
    return {
        "brick_id": "VSLE-EV3-583C",
        "brick_name": "Class EV3 01",
        "transport": "vsle-bluetooth",
        "ev3_bt": "A0:E6:F8:19:58:3C",
        "pairing_token": token,
        "server_version": "0.1.0",
        "capabilities": {
            "sensors": ["color", "ultrasonic", "gyro", "touch"],
            "motors": ["A", "B", "C", "D"],
            "ai_quest": True,
        },
    }


def test_save_claimed_profile_stores_token_ref_without_raw_token(tmp_path):
    store = DesktopProfileStore(tmp_path / "config.json")
    credentials = MemoryCredentialBackend()

    profile = save_claimed_profile(
        claim_result(),
        credential_backend=credentials,
        profile_store=store,
        now=lambda: datetime(2026, 6, 3, 8, 0, tzinfo=timezone.utc),
    )

    assert profile.brick_id == "VSLE-EV3-583C"
    assert profile.token_ref == "memory:vsle/VSLE-EV3-583C"
    payload = json.loads((tmp_path / "config.json").read_text(encoding="utf-8"))
    encoded = json.dumps(payload)
    assert payload["default_brick_id"] == "VSLE-EV3-583C"
    assert payload["scratchai_url"] == "http://101.42.92.6:18612/"
    assert payload["profiles"][0]["token_ref"] == "memory:vsle/VSLE-EV3-583C"
    assert "secret-token-1234567890" not in encoded
    assert "pairing_token" not in encoded.lower()
    if os.name != "nt":
        assert oct((tmp_path / "config.json").stat().st_mode & 0o777) == "0o600"


def test_resolve_profile_environment_reads_token_from_backend(tmp_path):
    store = DesktopProfileStore(tmp_path / "config.json")
    credentials = MemoryCredentialBackend()
    profile = save_claimed_profile(
        claim_result(),
        credential_backend=credentials,
        profile_store=store,
    )

    env = resolve_profile_environment(profile, credential_backend=credentials)

    assert env == {
        "WEISILE_TRANSPORT": "vsle-bluetooth",
        "EV3_BT": "A0:E6:F8:19:58:3C",
        "WEISILE_PAIRING_TOKEN": "secret-token-1234567890",
    }


def test_profile_store_upserts_profiles_and_keeps_default(tmp_path):
    store = DesktopProfileStore(tmp_path / "config.json")
    credentials = MemoryCredentialBackend()
    save_claimed_profile(
        claim_result("first-secret-token-123"),
        credential_backend=credentials,
        profile_store=store,
    )
    second = claim_result("second-secret-token-456")
    second["brick_id"] = "VSLE-EV3-2222"
    second["brick_name"] = "Class EV3 02"
    save_claimed_profile(
        second,
        credential_backend=credentials,
        profile_store=store,
    )

    payload = store.load()

    assert payload["default_brick_id"] == "VSLE-EV3-2222"
    assert [item["brick_id"] for item in payload["profiles"]] == [
        "VSLE-EV3-2222",
        "VSLE-EV3-583C",
    ]
    assert "first-secret-token-123" not in json.dumps(payload)
    assert "second-secret-token-456" not in json.dumps(payload)


def test_import_roster_stores_expected_sensors_without_tokens(tmp_path):
    store = DesktopProfileStore(tmp_path / "config.json")
    payload = store.import_roster(
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
    )

    encoded = json.dumps(payload)
    assert payload["roster"]["classroom_id"] == "school-a-room-302"
    assert payload["roster"]["devices"][0]["expected_sensors"]["S2"] == (
        "ultrasonic"
    )
    assert "pairing_token" not in encoded.lower()


def test_roster_expected_sensors_merge_into_claimed_profile(tmp_path):
    store = DesktopProfileStore(tmp_path / "config.json")
    credentials = MemoryCredentialBackend()
    store.import_roster(
        {
            "classroom_id": "school-a-room-302",
            "devices": [
                {
                    "brick_id": "VSLE-EV3-583C",
                    "label": "EV3-01",
                    "ev3_bt": "A0:E6:F8:19:58:3C",
                    "expected_sensors": {"S1": "color", "S4": "touch"},
                }
            ],
        }
    )

    profile = save_claimed_profile(
        claim_result(),
        credential_backend=credentials,
        profile_store=store,
    )
    stored = store.get_profile("VSLE-EV3-583C")

    assert profile.brick_id == "VSLE-EV3-583C"
    assert stored.name == "EV3-01"
    assert stored.expected_sensors == {"S1": "color", "S4": "touch"}


def test_export_roster_omits_token_refs_and_raw_tokens(tmp_path):
    store = DesktopProfileStore(tmp_path / "config.json")
    credentials = MemoryCredentialBackend()
    profile = save_claimed_profile(
        claim_result(),
        credential_backend=credentials,
        profile_store=store,
    )
    payload = store.load()
    payload["profiles"][0]["expected_sensors"] = {"S4": "touch"}
    store.save(payload)

    roster = store.export_roster()
    encoded = json.dumps(roster).lower()

    assert roster["devices"][0]["brick_id"] == profile.brick_id
    assert roster["devices"][0]["expected_sensors"] == {"S4": "touch"}
    assert "token_ref" not in encoded
    assert "pairing_token" not in encoded
    assert "secret-token-1234567890" not in encoded


def test_import_roster_rejects_invalid_sensor_layout(tmp_path):
    store = DesktopProfileStore(tmp_path / "config.json")

    with pytest.raises(DesktopProfileError):
        store.import_roster(
            {
                "devices": [
                    {
                        "brick_id": "VSLE-EV3-583C",
                        "expected_sensors": {"S9": "touch"},
                    }
                ]
            }
        )


def test_import_roster_rejects_raw_token_payload(tmp_path):
    store = DesktopProfileStore(tmp_path / "config.json")

    with pytest.raises(DesktopProfileError):
        store.import_roster(
            {
                "devices": [{"brick_id": "VSLE-EV3-583C"}],
                "pairing_token": "secret-token-1234567890",
            }
        )


def test_profile_store_rejects_config_with_raw_token(tmp_path):
    config = tmp_path / "config.json"
    config.write_text(
        json.dumps(
            {"profiles": [{"brick_id": "X", "pairing_token": "secret"}]}
        ),
        encoding="utf-8",
    )
    store = DesktopProfileStore(config)

    with pytest.raises(DesktopProfileError):
        store.load()


def test_save_claimed_profile_requires_real_token(tmp_path):
    store = DesktopProfileStore(tmp_path / "config.json")
    credentials = MemoryCredentialBackend()
    result = claim_result(token="short")

    with pytest.raises(DesktopProfileError):
        save_claimed_profile(
            result,
            credential_backend=credentials,
            profile_store=store,
        )

    assert not (tmp_path / "config.json").exists()


def test_macos_keychain_backend_uses_security_cli_without_config_storage():
    calls = []

    def fake_runner(args, capture_output, text, check):
        calls.append(args)
        stdout = (
            "secret-token-1234567890\n"
            if "find-generic-password" in args
            else ""
        )
        return subprocess.CompletedProcess(args, 0, stdout=stdout, stderr="")

    backend = MacOSKeychainBackend(runner=fake_runner)

    token_ref = backend.store_pairing_token(
        "VSLE-EV3-583C",
        "secret-token-1234567890",
    )
    token = backend.get_pairing_token(token_ref)
    backend.delete_pairing_token(token_ref)

    assert token_ref == "keychain:vsle/VSLE-EV3-583C"
    assert token == "secret-token-1234567890"
    assert calls[0][:4] == [
        "security",
        "add-generic-password",
        "-a",
        "WEISILE_PAIRING_TOKEN",
    ]
    assert calls[1][:2] == ["security", "find-generic-password"]
    assert calls[2][:2] == ["security", "delete-generic-password"]


def test_windows_credential_manager_backend_delegates_to_credential_api():
    class FakeCredentialAPI:
        def __init__(self):
            self.tokens = {}
            self.deleted = []

        def write(self, target, token):
            self.tokens[target] = token

        def read(self, target):
            return self.tokens[target]

        def delete(self, target):
            self.deleted.append(target)
            self.tokens.pop(target, None)

    api = FakeCredentialAPI()
    backend = WindowsCredentialManagerBackend(api=api)

    token_ref = backend.store_pairing_token(
        "VSLE-EV3-583C",
        "secret-token-1234567890",
    )
    token = backend.get_pairing_token(token_ref)
    backend.delete_pairing_token(token_ref)

    assert token_ref == "wincred:vsle/VSLE-EV3-583C"
    assert token == "secret-token-1234567890"
    assert api.deleted == ["vsle/VSLE-EV3-583C"]


def test_platform_helpers_select_classroom_paths(monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", r"C:\Users\Teacher\AppData\Local")

    assert "Library/Application Support/VSLE/WeisileLink/config.json" in str(
        default_config_path("Darwin")
    )
    assert str(default_config_path("Windows")).endswith(
        r"C:\Users\Teacher\AppData\Local/VSLE/WeisileLink/config.json"
    )
    assert credential_backend_for_platform("Darwin").scheme == "keychain"
    assert credential_backend_for_platform("Windows").scheme == "wincred"
    with pytest.raises(DesktopProfileError):
        credential_backend_for_platform("Linux")
