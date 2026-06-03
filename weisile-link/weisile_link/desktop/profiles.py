from __future__ import annotations

import json
import os
import platform
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional


DEFAULT_SCRATCHAI_URL = "http://101.42.92.6:18612/"
DEFAULT_SERVICE_PREFIX = "vsle"
KEYCHAIN_SCHEME = "keychain"
WINDOWS_CREDENTIAL_SCHEME = "wincred"
SENSOR_PORTS = ("S1", "S2", "S3", "S4")
SENSOR_TYPES = ("color", "ultrasonic", "gyro", "touch", "infrared")


class DesktopProfileError(RuntimeError):
    """Raised when a Desktop profile or credential operation fails."""


@dataclass
class DesktopProfile:
    brick_id: str
    name: str
    transport: str
    ev3_bt: str
    token_ref: str
    last_seen_at: str
    server_version: str = ""
    capabilities: Dict[str, Any] = field(default_factory=dict)
    expected_sensors: Dict[str, str] = field(default_factory=dict)

    def to_config(self) -> Dict[str, Any]:
        payload = asdict(self)
        return {key: value for key, value in payload.items() if value not in ("", {})}


class CredentialBackend:
    """Small interface used by Desktop profile storage."""

    scheme = ""

    def store_pairing_token(self, brick_id: str, token: str) -> str:
        raise NotImplementedError

    def get_pairing_token(self, token_ref: str) -> str:
        raise NotImplementedError

    def delete_pairing_token(self, token_ref: str) -> None:
        raise NotImplementedError


class MemoryCredentialBackend(CredentialBackend):
    """In-memory backend for tests and offline dry runs."""

    scheme = "memory"

    def __init__(self) -> None:
        self._tokens: Dict[str, str] = {}

    def store_pairing_token(self, brick_id: str, token: str) -> str:
        target = _credential_target(brick_id)
        self._tokens[target] = _require_token(token)
        return "{}:{}".format(self.scheme, target)

    def get_pairing_token(self, token_ref: str) -> str:
        target = _target_from_ref(token_ref, self.scheme)
        try:
            return self._tokens[target]
        except KeyError as exc:
            raise DesktopProfileError("Pairing token not found") from exc

    def delete_pairing_token(self, token_ref: str) -> None:
        target = _target_from_ref(token_ref, self.scheme)
        self._tokens.pop(target, None)


class MacOSKeychainBackend(CredentialBackend):
    """macOS Keychain adapter backed by the `security` CLI."""

    scheme = KEYCHAIN_SCHEME

    def __init__(
        self,
        *,
        runner: Optional[Callable[..., subprocess.CompletedProcess[str]]] = None,
    ) -> None:
        self._runner = runner or subprocess.run

    def store_pairing_token(self, brick_id: str, token: str) -> str:
        target = _credential_target(brick_id)
        self._run(
            [
                "security",
                "add-generic-password",
                "-a",
                "WEISILE_PAIRING_TOKEN",
                "-s",
                target,
                "-w",
                _require_token(token),
                "-U",
            ]
        )
        return "{}:{}".format(self.scheme, target)

    def get_pairing_token(self, token_ref: str) -> str:
        target = _target_from_ref(token_ref, self.scheme)
        result = self._run(
            [
                "security",
                "find-generic-password",
                "-a",
                "WEISILE_PAIRING_TOKEN",
                "-s",
                target,
                "-w",
            ]
        )
        return result.stdout.strip()

    def delete_pairing_token(self, token_ref: str) -> None:
        target = _target_from_ref(token_ref, self.scheme)
        self._run(
            [
                "security",
                "delete-generic-password",
                "-a",
                "WEISILE_PAIRING_TOKEN",
                "-s",
                target,
            ],
            allow_missing=True,
        )

    def _run(
        self,
        args: List[str],
        *,
        allow_missing: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        result = self._runner(
            args,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0 or allow_missing:
            return result
        raise DesktopProfileError(result.stderr.strip() or "Keychain command failed")


class WindowsCredentialManagerBackend(CredentialBackend):
    """Windows Credential Manager adapter."""

    scheme = WINDOWS_CREDENTIAL_SCHEME

    def __init__(self, *, api: Optional[Any] = None) -> None:
        self._api = api

    def store_pairing_token(self, brick_id: str, token: str) -> str:
        target = _credential_target(brick_id)
        self._credential_api().write(target, _require_token(token))
        return "{}:{}".format(self.scheme, target)

    def get_pairing_token(self, token_ref: str) -> str:
        target = _target_from_ref(token_ref, self.scheme)
        return self._credential_api().read(target)

    def delete_pairing_token(self, token_ref: str) -> None:
        target = _target_from_ref(token_ref, self.scheme)
        self._credential_api().delete(target)

    def _credential_api(self) -> Any:
        if self._api is None:
            self._api = _WindowsCredentialAPI()
        return self._api


class _WindowsCredentialAPI:
    """Thin ctypes wrapper for CredWriteW, CredReadW, and CredDeleteW."""

    CRED_TYPE_GENERIC = 1
    CRED_PERSIST_LOCAL_MACHINE = 2

    def __init__(self) -> None:
        import ctypes
        from ctypes import wintypes

        if platform.system() != "Windows":
            raise DesktopProfileError("Windows Credential Manager is unavailable")

        class FILETIME(ctypes.Structure):
            _fields_ = [
                ("dwLowDateTime", wintypes.DWORD),
                ("dwHighDateTime", wintypes.DWORD),
            ]

        class CREDENTIALW(ctypes.Structure):
            _fields_ = [
                ("Flags", wintypes.DWORD),
                ("Type", wintypes.DWORD),
                ("TargetName", wintypes.LPWSTR),
                ("Comment", wintypes.LPWSTR),
                ("LastWritten", FILETIME),
                ("CredentialBlobSize", wintypes.DWORD),
                ("CredentialBlob", ctypes.POINTER(wintypes.BYTE)),
                ("Persist", wintypes.DWORD),
                ("AttributeCount", wintypes.DWORD),
                ("Attributes", wintypes.LPVOID),
                ("TargetAlias", wintypes.LPWSTR),
                ("UserName", wintypes.LPWSTR),
            ]

        self.ctypes = ctypes
        self.wintypes = wintypes
        self.advapi32 = ctypes.WinDLL("advapi32", use_last_error=True)
        self.CREDENTIALW = CREDENTIALW
        self.PCREDENTIALW = ctypes.POINTER(CREDENTIALW)
        self.advapi32.CredWriteW.argtypes = [
            ctypes.POINTER(CREDENTIALW),
            wintypes.DWORD,
        ]
        self.advapi32.CredWriteW.restype = wintypes.BOOL
        self.advapi32.CredReadW.argtypes = [
            wintypes.LPCWSTR,
            wintypes.DWORD,
            wintypes.DWORD,
            ctypes.POINTER(self.PCREDENTIALW),
        ]
        self.advapi32.CredReadW.restype = wintypes.BOOL
        self.advapi32.CredDeleteW.argtypes = [
            wintypes.LPCWSTR,
            wintypes.DWORD,
            wintypes.DWORD,
        ]
        self.advapi32.CredDeleteW.restype = wintypes.BOOL
        self.advapi32.CredFree.argtypes = [wintypes.LPVOID]
        self.advapi32.CredFree.restype = None

    def write(self, target: str, token: str) -> None:
        ctypes = self.ctypes
        blob = token.encode("utf-16-le")
        blob_buffer = ctypes.create_string_buffer(blob)
        credential = self.CREDENTIALW()
        credential.Type = self.CRED_TYPE_GENERIC
        credential.TargetName = target
        credential.CredentialBlobSize = len(blob)
        credential.CredentialBlob = ctypes.cast(
            blob_buffer,
            ctypes.POINTER(self.wintypes.BYTE),
        )
        credential.Persist = self.CRED_PERSIST_LOCAL_MACHINE
        credential.UserName = "VSLE"
        if not self.advapi32.CredWriteW(ctypes.byref(credential), 0):
            self._raise_last_error("CredWriteW failed")

    def read(self, target: str) -> str:
        ctypes = self.ctypes
        credential_pointer = self.PCREDENTIALW()
        if not self.advapi32.CredReadW(
            target,
            self.CRED_TYPE_GENERIC,
            0,
            ctypes.byref(credential_pointer),
        ):
            self._raise_last_error("CredReadW failed")
        try:
            credential = credential_pointer.contents
            raw = ctypes.string_at(
                credential.CredentialBlob,
                credential.CredentialBlobSize,
            )
            return raw.decode("utf-16-le")
        finally:
            self.advapi32.CredFree(credential_pointer)

    def delete(self, target: str) -> None:
        if not self.advapi32.CredDeleteW(target, self.CRED_TYPE_GENERIC, 0):
            self._raise_last_error("CredDeleteW failed")

    def _raise_last_error(self, message: str) -> None:
        raise DesktopProfileError(
            "{}: {}".format(message, self.ctypes.get_last_error())
        )


class DesktopProfileStore:
    """Read and write non-secret WeisileLink Desktop profile config."""

    def __init__(
        self,
        path: Optional[Path] = None,
        *,
        scratchai_url: str = DEFAULT_SCRATCHAI_URL,
    ) -> None:
        self.path = Path(path) if path is not None else default_config_path()
        self.scratchai_url = scratchai_url

    def load(self) -> Dict[str, Any]:
        if not self.path.exists():
            return {
                "default_brick_id": "",
                "scratchai_url": self.scratchai_url,
                "profiles": [],
                "roster": {"classroom_id": "", "devices": []},
            }
        with self.path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        payload.setdefault("scratchai_url", self.scratchai_url)
        payload.setdefault("default_brick_id", "")
        payload.setdefault("profiles", [])
        payload.setdefault("roster", {"classroom_id": "", "devices": []})
        _assert_config_has_no_raw_token(payload)
        return payload

    def save(self, payload: Dict[str, Any]) -> None:
        _assert_config_has_no_raw_token(payload)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.write("\n")
        if os.name != "nt":
            os.chmod(self.path, 0o600)

    def upsert_profile(self, profile: DesktopProfile) -> Dict[str, Any]:
        payload = self.load()
        roster_device = _find_roster_device(payload, profile.brick_id)
        expected_sensors = (
            profile.expected_sensors
            or (roster_device or {}).get("expected_sensors", {})
            or {}
        )
        profile_payload = profile.to_config()
        if expected_sensors:
            profile_payload["expected_sensors"] = dict(expected_sensors)
        if roster_device and roster_device.get("label"):
            profile_payload["name"] = str(roster_device["label"])
        profiles = [
            item
            for item in payload.get("profiles", [])
            if item.get("brick_id") != profile.brick_id
        ]
        profiles.append(profile_payload)
        profiles.sort(key=lambda item: item.get("brick_id", ""))
        payload["profiles"] = profiles
        payload["default_brick_id"] = profile.brick_id
        payload["scratchai_url"] = payload.get("scratchai_url") or self.scratchai_url
        self.save(payload)
        return payload

    def get_profile(self, brick_id: Optional[str] = None) -> DesktopProfile:
        payload = self.load()
        target = brick_id or payload.get("default_brick_id")
        for item in payload.get("profiles", []):
            if item.get("brick_id") == target:
                return DesktopProfile(
                    brick_id=item["brick_id"],
                    name=item.get("name", item["brick_id"]),
                    transport=item.get("transport", "vsle-bluetooth"),
                    ev3_bt=item.get("ev3_bt", ""),
                    token_ref=item["token_ref"],
                    last_seen_at=item.get("last_seen_at", ""),
                    server_version=item.get("server_version", ""),
                    capabilities=item.get("capabilities", {}),
                    expected_sensors=_expected_sensors_for_profile(
                        payload,
                        item,
                    ),
                )
        raise DesktopProfileError("Desktop profile not found")

    def import_roster(self, roster_payload: Dict[str, Any]) -> Dict[str, Any]:
        """Import a non-secret classroom roster package."""
        payload = self.load()
        roster = _normalize_roster(roster_payload)
        if roster.get("scratchai_url"):
            payload["scratchai_url"] = roster["scratchai_url"]
        payload["roster"] = {
            "classroom_id": roster.get("classroom_id", ""),
            "devices": roster["devices"],
        }
        profiles = [
            _merge_profile_roster(payload, item) for item in payload["profiles"]
        ]
        profiles.sort(key=lambda item: item.get("brick_id", ""))
        payload["profiles"] = profiles
        self.save(payload)
        return payload

    def export_roster(self) -> Dict[str, Any]:
        """Export a non-secret roster package from profiles and roster data."""
        payload = self.load()
        devices_by_id: Dict[str, Dict[str, Any]] = {}
        for device in payload.get("roster", {}).get("devices", []):
            normalized = _normalize_roster_device(device)
            devices_by_id[normalized["brick_id"]] = normalized

        for item in payload.get("profiles", []):
            brick_id = str(item.get("brick_id") or "")
            if not brick_id:
                continue
            device = devices_by_id.get(brick_id, {})
            exported = {
                "brick_id": brick_id,
                "label": str(device.get("label") or item.get("name") or brick_id),
                "ev3_bt": str(device.get("ev3_bt") or item.get("ev3_bt") or ""),
            }
            expected = (
                device.get("expected_sensors") or item.get("expected_sensors") or {}
            )
            if expected:
                exported["expected_sensors"] = _normalize_expected_sensors(expected)
            devices_by_id[brick_id] = _normalize_roster_device(exported)

        return {
            "classroom_id": str(payload.get("roster", {}).get("classroom_id") or ""),
            "scratchai_url": str(payload.get("scratchai_url") or self.scratchai_url),
            "devices": [devices_by_id[brick_id] for brick_id in sorted(devices_by_id)],
        }

    def rename_device(self, brick_id: str, name: str) -> Dict[str, Any]:
        """Rename a paired profile and matching roster device without touching tokens."""
        target = _require_non_empty(brick_id, "brick_id")
        label = _require_non_empty(name, "name")
        payload = self.load()
        matched = False
        for item in payload.get("profiles", []):
            if item.get("brick_id") == target:
                item["name"] = label
                matched = True
        for item in payload.get("roster", {}).get("devices", []):
            if item.get("brick_id") == target:
                item["label"] = label
                matched = True
        if not matched:
            raise DesktopProfileError("Desktop device not found")
        self.save(payload)
        return payload

    def remove_profile(self, brick_id: str) -> DesktopProfile:
        """Remove a paired profile while preserving non-secret roster data."""
        payload = self.load()
        target = _require_non_empty(brick_id, "brick_id")
        removed = None
        profiles = []
        for item in payload.get("profiles", []):
            if item.get("brick_id") == target:
                removed = item
            else:
                profiles.append(item)
        if removed is None:
            raise DesktopProfileError("Desktop profile not found")
        payload["profiles"] = profiles
        if payload.get("default_brick_id") == target:
            payload["default_brick_id"] = profiles[0]["brick_id"] if profiles else ""
        self.save(payload)
        return DesktopProfile(
            brick_id=removed["brick_id"],
            name=removed.get("name", removed["brick_id"]),
            transport=removed.get("transport", "vsle-bluetooth"),
            ev3_bt=removed.get("ev3_bt", ""),
            token_ref=removed["token_ref"],
            last_seen_at=removed.get("last_seen_at", ""),
            server_version=removed.get("server_version", ""),
            capabilities=removed.get("capabilities", {}),
            expected_sensors=_expected_sensors_for_profile(payload, removed),
        )


def save_claimed_profile(
    claim_result: Dict[str, Any],
    *,
    credential_backend: CredentialBackend,
    profile_store: DesktopProfileStore,
    now: Optional[Callable[[], datetime]] = None,
) -> DesktopProfile:
    """Persist an `auth.claim` result without writing raw tokens to config."""
    brick_id = _require_non_empty(claim_result.get("brick_id"), "brick_id")
    token = _require_token(str(claim_result.get("pairing_token", "")))
    token_ref = credential_backend.store_pairing_token(brick_id, token)
    current_time = now() if now is not None else datetime.now(timezone.utc)
    profile = DesktopProfile(
        brick_id=brick_id,
        name=str(claim_result.get("brick_name") or brick_id),
        transport=str(claim_result.get("transport") or "vsle-bluetooth"),
        ev3_bt=str(claim_result.get("ev3_bt") or ""),
        token_ref=token_ref,
        last_seen_at=current_time.astimezone(timezone.utc).isoformat(),
        server_version=str(claim_result.get("server_version") or ""),
        capabilities=dict(claim_result.get("capabilities") or {}),
        expected_sensors=_normalize_expected_sensors(
            claim_result.get("expected_sensors") or {}
        ),
    )
    profile_store.upsert_profile(profile)
    return profile_store.get_profile(brick_id)


def save_rotated_profile_token(
    profile: DesktopProfile,
    rotated_result: Dict[str, Any],
    *,
    credential_backend: CredentialBackend,
    profile_store: DesktopProfileStore,
    now: Optional[Callable[[], datetime]] = None,
) -> DesktopProfile:
    """Persist an `auth.rotate` result without writing raw tokens to config."""
    token = _require_token(str(rotated_result.get("pairing_token", "")))
    token_ref = credential_backend.store_pairing_token(profile.brick_id, token)
    current_time = now() if now is not None else datetime.now(timezone.utc)
    updated = DesktopProfile(
        brick_id=profile.brick_id,
        name=str(rotated_result.get("brick_name") or profile.name),
        transport=str(rotated_result.get("transport") or profile.transport),
        ev3_bt=str(rotated_result.get("ev3_bt") or profile.ev3_bt),
        token_ref=token_ref,
        last_seen_at=current_time.astimezone(timezone.utc).isoformat(),
        server_version=str(
            rotated_result.get("server_version") or profile.server_version
        ),
        capabilities=dict(profile.capabilities),
        expected_sensors=dict(profile.expected_sensors),
    )
    profile_store.upsert_profile(updated)
    return profile_store.get_profile(profile.brick_id)


def resolve_profile_environment(
    profile: DesktopProfile,
    *,
    credential_backend: CredentialBackend,
) -> Dict[str, str]:
    """Build runtime env vars from a stored profile and secure token backend."""
    token = credential_backend.get_pairing_token(profile.token_ref)
    return {
        "WEISILE_TRANSPORT": profile.transport,
        "EV3_BT": profile.ev3_bt,
        "WEISILE_PAIRING_TOKEN": token,
    }


def credential_backend_for_platform(
    system_name: Optional[str] = None,
) -> CredentialBackend:
    system = system_name or platform.system()
    if system == "Darwin":
        return MacOSKeychainBackend()
    if system == "Windows":
        return WindowsCredentialManagerBackend()
    raise DesktopProfileError("Unsupported credential platform: {}".format(system))


def default_config_path(system_name: Optional[str] = None) -> Path:
    system = system_name or platform.system()
    if system == "Darwin":
        return (
            Path.home()
            / "Library"
            / "Application Support"
            / "VSLE"
            / "WeisileLink"
            / "config.json"
        )
    if system == "Windows":
        local_app_data = os.environ.get("LOCALAPPDATA") or str(Path.home())
        return Path(local_app_data) / "VSLE" / "WeisileLink" / "config.json"
    return Path.home() / ".config" / "vsle" / "weisilelink" / "config.json"


def _credential_target(brick_id: str) -> str:
    return "{}/{}".format(
        DEFAULT_SERVICE_PREFIX, _require_non_empty(brick_id, "brick_id")
    )


def _target_from_ref(token_ref: str, scheme: str) -> str:
    prefix = "{}:".format(scheme)
    if not token_ref.startswith(prefix):
        raise DesktopProfileError("Token ref does not use {} scheme".format(scheme))
    target = token_ref[len(prefix) :]
    if not target.startswith("{}/".format(DEFAULT_SERVICE_PREFIX)):
        raise DesktopProfileError("Token ref target is outside VSLE namespace")
    return target


def _require_non_empty(value: Any, field: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise DesktopProfileError("{} is required".format(field))
    if len(text) > 128 or any(ord(char) < 32 for char in text):
        raise DesktopProfileError("{} is invalid".format(field))
    return text


def _require_token(token: str) -> str:
    token = str(token or "").strip()
    if len(token) < 16:
        raise DesktopProfileError("Pairing token is missing or too short")
    return token


def _assert_config_has_no_raw_token(payload: Dict[str, Any]) -> None:
    encoded = json.dumps(payload, sort_keys=True).lower()
    forbidden = ("pairing_token", "weisile_pairing_token")
    if any(key in encoded for key in forbidden):
        raise DesktopProfileError("Desktop config must not contain raw tokens")


def _normalize_roster(roster_payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(roster_payload, dict):
        raise DesktopProfileError("Roster package must be a JSON object")
    _assert_config_has_no_raw_token(roster_payload)
    devices = roster_payload.get("devices")
    if not isinstance(devices, list):
        raise DesktopProfileError("Roster package must include devices")
    normalized = [_normalize_roster_device(device) for device in devices]
    brick_ids = [device["brick_id"] for device in normalized]
    if len(set(brick_ids)) != len(brick_ids):
        raise DesktopProfileError("Roster package contains duplicate brick_id")
    normalized.sort(key=lambda item: item["brick_id"])
    return {
        "classroom_id": str(roster_payload.get("classroom_id") or ""),
        "scratchai_url": str(
            roster_payload.get("scratchai_url") or DEFAULT_SCRATCHAI_URL
        ),
        "devices": normalized,
    }


def _normalize_roster_device(device: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(device, dict):
        raise DesktopProfileError("Roster device must be a JSON object")
    brick_id = _require_non_empty(device.get("brick_id"), "brick_id")
    payload = {
        "brick_id": brick_id,
        "label": str(device.get("label") or device.get("name") or brick_id),
        "ev3_bt": str(device.get("ev3_bt") or ""),
        "expected_sensors": _normalize_expected_sensors(
            device.get("expected_sensors") or {}
        ),
    }
    return {key: value for key, value in payload.items() if value not in ("", {})}


def _normalize_expected_sensors(raw: Any) -> Dict[str, str]:
    if raw in (None, ""):
        return {}
    if not isinstance(raw, dict):
        raise DesktopProfileError("expected_sensors must be an object")
    expected: Dict[str, str] = {}
    for raw_port, raw_type in raw.items():
        port = str(raw_port or "").upper()
        sensor_type = str(raw_type or "").strip().lower()
        if port not in SENSOR_PORTS:
            raise DesktopProfileError("expected_sensors uses unsupported port")
        if sensor_type not in SENSOR_TYPES:
            raise DesktopProfileError("expected_sensors uses unsupported type")
        expected[port] = sensor_type
    return {port: expected[port] for port in SENSOR_PORTS if port in expected}


def _find_roster_device(
    payload: Dict[str, Any],
    brick_id: str,
) -> Optional[Dict[str, Any]]:
    for item in payload.get("roster", {}).get("devices", []):
        if item.get("brick_id") == brick_id:
            return item
    return None


def _expected_sensors_for_profile(
    payload: Dict[str, Any],
    profile_item: Dict[str, Any],
) -> Dict[str, str]:
    roster_device = _find_roster_device(
        payload,
        str(profile_item.get("brick_id") or ""),
    )
    raw = (
        profile_item.get("expected_sensors")
        or (roster_device or {}).get("expected_sensors")
        or {}
    )
    return _normalize_expected_sensors(raw)


def _merge_profile_roster(
    payload: Dict[str, Any],
    profile_item: Dict[str, Any],
) -> Dict[str, Any]:
    merged = dict(profile_item)
    roster_device = _find_roster_device(
        payload,
        str(profile_item.get("brick_id") or ""),
    )
    if not roster_device:
        return merged
    if roster_device.get("label"):
        merged["name"] = roster_device["label"]
    expected = roster_device.get("expected_sensors") or {}
    if expected:
        merged["expected_sensors"] = dict(expected)
    if roster_device.get("ev3_bt") and not merged.get("ev3_bt"):
        merged["ev3_bt"] = roster_device["ev3_bt"]
    return merged
