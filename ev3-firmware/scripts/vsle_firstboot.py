#!/usr/bin/env python3
"""First-boot provisioning for classroom EV3 golden SD images.

Sources:
- ev3dev systemd deployments in this project use
  `/home/robot/.config/vsle/ev3.env` as the service EnvironmentFile.
- `docs/classroom/EV3_CLASSROOM_PROVISIONING_DESIGN.md` defines the
  unprovisioned golden-image requirement: every cloned EV3 must generate its
  own brick ID, pairing token, and claim code on first boot.
"""

import argparse
import base64
import datetime as _dt
import hashlib
import json
import os
import random
import re
import stat
from pathlib import Path


DEFAULT_CONFIG_DIR = Path("/home/robot/.config/vsle")
DEFAULT_TOOLS_DIR = Path("/home/robot/vsle-tools")
DEFAULT_ENV_FILE = DEFAULT_CONFIG_DIR / "ev3.env"
DEFAULT_DEVICE_FILE = DEFAULT_CONFIG_DIR / "device.json"
DEFAULT_MANIFEST_FILE = DEFAULT_CONFIG_DIR / "manifest.json"
DEFAULT_MACHINE_ID_FILE = Path("/etc/machine-id")
DEFAULT_BLUETOOTH_ADDRESS_FILE = Path("/sys/class/bluetooth/hci0/address")
DEFAULT_CLAIM_CODE_DIGITS = 8
DEFAULT_BRICK_PREFIX = "VSLE-EV3"
DEFAULT_RFCOMM_CHANNEL = 1
ENV_KEY_ORDER = (
    "WEISILE_PAIRING_TOKEN",
    "VSLE_BRICK_ID",
    "VSLE_BRICK_NAME",
    "VSLE_CLAIM_CODE",
    "VSLE_CLAIM_CODE_CREATED_AT",
    "VSLE_CLAIM_CODE_USED",
    "EV3_WS_PORT",
    "MAX_COLLECTED_POINTS",
    "LOG_LEVEL",
    "EV3_ENABLE_BLUETOOTH",
    "EV3_BT_ADDRESS",
    "EV3_BT_RFCOMM_CHANNEL",
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Provision VSLE identity on first EV3 boot."
    )
    subparsers = parser.add_subparsers(dest="command")
    _add_common_args(subparsers.add_parser("provision", help="Provision if needed."))
    _add_common_args(
        subparsers.add_parser("show-code", help="Print the current claim code.")
    )
    _add_common_args(
        subparsers.add_parser("reset", help="Remove provisioned identity files.")
    )
    args = parser.parse_args()
    if args.command is None:
        args.command = "provision"
        _apply_common_defaults(args)

    paths = _paths_from_args(args)
    if args.command == "provision":
        result = provision(paths, force=args.force, display=args.display)
        print(
            "VSLE first boot provisioned: {brick_id} claim_code={claim_code}".format(
                **result
            )
        )
        return 0
    if args.command == "show-code":
        result = load_identity(paths)
        _display_claim_code(result, enabled=args.display)
        print(
            "{brick_id} claim_code={claim_code}".format(
                brick_id=result["brick_id"],
                claim_code=result["claim_code"],
            )
        )
        return 0
    if args.command == "reset":
        reset_identity(paths)
        print("VSLE first boot identity reset.")
        return 0

    parser.error("unsupported command: {0}".format(args.command))
    return 2


def _add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--config-dir", default=str(DEFAULT_CONFIG_DIR))
    parser.add_argument("--env-file", default=str(DEFAULT_ENV_FILE))
    parser.add_argument("--device-file", default=str(DEFAULT_DEVICE_FILE))
    parser.add_argument("--manifest-file", default=str(DEFAULT_MANIFEST_FILE))
    parser.add_argument("--machine-id-file", default=str(DEFAULT_MACHINE_ID_FILE))
    parser.add_argument(
        "--bluetooth-address-file",
        default=str(DEFAULT_BLUETOOTH_ADDRESS_FILE),
    )
    parser.add_argument("--brick-prefix", default=DEFAULT_BRICK_PREFIX)
    parser.add_argument("--brick-name", default="")
    parser.add_argument("--bluetooth-address", default="")
    parser.add_argument("--rfcomm-channel", type=int, default=DEFAULT_RFCOMM_CHANNEL)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--display", action="store_true")


def _apply_common_defaults(args: argparse.Namespace) -> None:
    args.config_dir = str(DEFAULT_CONFIG_DIR)
    args.env_file = str(DEFAULT_ENV_FILE)
    args.device_file = str(DEFAULT_DEVICE_FILE)
    args.manifest_file = str(DEFAULT_MANIFEST_FILE)
    args.machine_id_file = str(DEFAULT_MACHINE_ID_FILE)
    args.bluetooth_address_file = str(DEFAULT_BLUETOOTH_ADDRESS_FILE)
    args.brick_prefix = DEFAULT_BRICK_PREFIX
    args.brick_name = ""
    args.bluetooth_address = ""
    args.rfcomm_channel = DEFAULT_RFCOMM_CHANNEL
    args.force = False
    args.display = False


def _paths_from_args(args: argparse.Namespace) -> dict:
    return {
        "config_dir": Path(args.config_dir),
        "env_file": Path(args.env_file),
        "device_file": Path(args.device_file),
        "manifest_file": Path(args.manifest_file),
        "machine_id_file": Path(args.machine_id_file),
        "bluetooth_address_file": Path(args.bluetooth_address_file),
        "brick_prefix": args.brick_prefix,
        "brick_name": args.brick_name,
        "bluetooth_address": args.bluetooth_address,
        "rfcomm_channel": args.rfcomm_channel,
    }


def provision(paths: dict, *, force: bool = False, display: bool = False) -> dict:
    """Create EV3 identity files without leaking the pairing token to JSON."""
    env_file = paths["env_file"]
    if _identity_complete(paths) and not force:
        result = load_identity(paths)
        _display_claim_code(result, enabled=display)
        return result

    env = _read_env(env_file) if env_file.exists() and not force else {}
    now = _utc_now()
    bluetooth_address = _normalize_bluetooth_address(
        paths["bluetooth_address"]
        or _read_first_line(paths["bluetooth_address_file"])
        or env.get("EV3_BT_ADDRESS", "")
    )
    brick_id = env.get("VSLE_BRICK_ID") or _brick_id(
        paths["brick_prefix"],
        bluetooth_address,
        _read_first_line(paths["machine_id_file"]),
    )
    brick_name = paths["brick_name"] or env.get("VSLE_BRICK_NAME") or brick_id
    claim_code = _claim_code(DEFAULT_CLAIM_CODE_DIGITS)
    pairing_token = env.get("WEISILE_PAIRING_TOKEN") or _token()

    env.update(
        {
            "WEISILE_PAIRING_TOKEN": pairing_token,
            "VSLE_BRICK_ID": brick_id,
            "VSLE_BRICK_NAME": brick_name,
            "VSLE_CLAIM_CODE": claim_code,
            "VSLE_CLAIM_CODE_CREATED_AT": now,
            "VSLE_CLAIM_CODE_USED": "0",
            "EV3_WS_PORT": env.get("EV3_WS_PORT", "8765"),
            "MAX_COLLECTED_POINTS": env.get("MAX_COLLECTED_POINTS", "10000"),
            "LOG_LEVEL": env.get("LOG_LEVEL", "INFO"),
            "EV3_ENABLE_BLUETOOTH": env.get("EV3_ENABLE_BLUETOOTH", "1"),
            "EV3_BT_ADDRESS": bluetooth_address,
            "EV3_BT_RFCOMM_CHANNEL": str(paths["rfcomm_channel"]),
        }
    )

    _write_env(env_file, env)
    _write_json(
        paths["device_file"],
        _device_manifest(
            brick_id=brick_id,
            brick_name=brick_name,
            bluetooth_address=bluetooth_address,
            rfcomm_channel=paths["rfcomm_channel"],
            claim_code=claim_code,
            provisioned_at=now,
        ),
        mode=0o644,
    )
    _write_json(
        paths["manifest_file"],
        {
            "schema_version": 1,
            "package": "ev3sc-vsle-ev3-firmware",
            "provisioning": "firstboot",
            "server": "/home/robot/vsle_ev3_server.py",
            "environment": str(env_file),
            "device": str(paths["device_file"]),
        },
        mode=0o644,
    )

    result = {
        "brick_id": brick_id,
        "brick_name": brick_name,
        "claim_code": claim_code,
        "bluetooth_address": bluetooth_address,
    }
    _display_claim_code(result, enabled=display)
    return result


def load_identity(paths: dict) -> dict:
    env = _read_env(paths["env_file"])
    missing = [
        key
        for key in ("VSLE_BRICK_ID", "VSLE_BRICK_NAME", "VSLE_CLAIM_CODE")
        if not env.get(key)
    ]
    if missing:
        raise SystemExit("VSLE identity is missing: {0}".format(", ".join(missing)))
    return {
        "brick_id": env["VSLE_BRICK_ID"],
        "brick_name": env["VSLE_BRICK_NAME"],
        "claim_code": env["VSLE_CLAIM_CODE"],
        "bluetooth_address": env.get("EV3_BT_ADDRESS", ""),
    }


def reset_identity(paths: dict) -> None:
    for key in ("env_file", "device_file", "manifest_file"):
        try:
            paths[key].unlink()
        except FileNotFoundError:
            pass


def _identity_complete(paths: dict) -> bool:
    return all(
        paths[key].exists() for key in ("env_file", "device_file", "manifest_file")
    )


def _device_manifest(
    *,
    brick_id: str,
    brick_name: str,
    bluetooth_address: str,
    rfcomm_channel: int,
    claim_code: str,
    provisioned_at: str,
) -> dict:
    return {
        "schema_version": 1,
        "brick_id": brick_id,
        "brick_name": brick_name,
        "provisioned_at_utc": provisioned_at,
        "transport": "vsle-bluetooth",
        "bluetooth": {
            "address": bluetooth_address,
            "rfcomm_channel": rfcomm_channel,
        },
        "claim": {
            "required": True,
            "code_digits": len(claim_code),
            "code_fingerprint": hashlib.sha256(claim_code.encode("utf-8")).hexdigest()[
                :12
            ],
        },
        "capabilities": {
            "sensors": ["color", "ultrasonic", "gyro", "touch"],
            "motors": ["A", "B", "C", "D"],
            "ai_quest": True,
        },
    }


def _display_claim_code(identity: dict, *, enabled: bool) -> None:
    if not enabled:
        return
    try:
        from ev3dev2.display import Display

        display = Display()
        display.clear()
        display.text_pixels("VSLE EV3 Ready", x=0, y=0, clear_screen=False)
        display.text_pixels(identity["brick_id"], x=0, y=18, clear_screen=False)
        display.text_pixels("Code:", x=0, y=42, clear_screen=False)
        display.text_pixels(identity["claim_code"], x=0, y=62, clear_screen=False)
        display.update()
    except Exception:
        return


def _brick_id(prefix: str, bluetooth_address: str, machine_id: str) -> str:
    suffix_source = bluetooth_address or machine_id or _token()
    suffix = re.sub(r"[^A-Fa-f0-9]", "", suffix_source).upper()
    if len(suffix) >= 4:
        return "{0}-{1}".format(prefix, suffix[-4:])
    digest = hashlib.sha256(suffix_source.encode("utf-8")).hexdigest().upper()
    return "{0}-{1}".format(prefix, digest[:4])


def _claim_code(digits: int) -> str:
    lower = 10 ** (digits - 1)
    upper = (10**digits) - 1
    return str(random.SystemRandom().randint(lower, upper))


def _token() -> str:
    return base64.urlsafe_b64encode(os.urandom(32)).decode("ascii").rstrip("=")


def _read_first_line(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8").splitlines()[0].strip()
    except (IndexError, OSError):
        return ""


def _normalize_bluetooth_address(value: str) -> str:
    value = value.strip().upper()
    if re.match(r"^[0-9A-F]{2}(:[0-9A-F]{2}){5}$", value):
        return value
    return ""


def _read_env(path: Path) -> dict:
    values = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return values
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key] = value
    return values


def _write_env(path: Path, values: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ordered_keys = list(ENV_KEY_ORDER)
    extra_keys = sorted(key for key in values if key not in ordered_keys)
    lines = [
        "{0}={1}".format(key, values[key])
        for key in ordered_keys + extra_keys
        if key in values
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    os.chmod(str(path), stat.S_IRUSR | stat.S_IWUSR)


def _write_json(path: Path, payload: dict, *, mode: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.chmod(str(path), mode)


def _utc_now() -> str:
    return _dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


if __name__ == "__main__":
    raise SystemExit(main())
