#!/usr/bin/env python3
"""Check whether this host can run the WeisileLink Windows release flow."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import platform
import shutil
import sys
from typing import List


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_JSON_REPORT = ROOT / "docs/desktop/evidence/windows-release-preflight.json"
DEFAULT_MARKDOWN_REPORT = ROOT / "docs/desktop/evidence/windows-release-preflight.md"
DEFAULT_EXECUTABLE = ROOT / "desktop/build/windows/WeisileLink.exe"
SIGN_IDENTITY_ENV = "WEISILE_WINDOWS_SIGN_IDENTITY"
TIMESTAMP_URL_ENV = "WEISILE_WINDOWS_TIMESTAMP_URL"
REQUIRED_TOOLS = ("signtool",)


def _tool_path(name: str) -> str | None:
    return shutil.which(name)


def _host_is_windows() -> bool:
    return platform.system().lower() == "windows"


def _resolve_optional_path(raw: str | None, default_path: Path | None) -> Path | None:
    if raw is None or not raw.strip():
        if default_path is not None and default_path.is_file():
            return default_path.resolve()
        return None
    return Path(raw).expanduser().resolve()


def _resolve_text(raw: str | None, env_name: str) -> str | None:
    if raw is not None and raw.strip():
        return raw.strip()
    value = os.environ.get(env_name)
    if value is not None and value.strip():
        return value.strip()
    return None


def _check_tool(name: str) -> dict[str, object]:
    found = _tool_path(name)
    return {
        "name": f"tool:{name}",
        "ok": found is not None,
        "detail": found or f"{name} was not found on PATH",
    }


def _check_host() -> dict[str, object]:
    return {
        "name": "host_os_windows",
        "ok": _host_is_windows(),
        "detail": platform.system() or "unknown",
    }


def _check_executable(path: Path | None) -> dict[str, object]:
    if path is None:
        return {
            "name": "executable_path",
            "ok": False,
            "detail": "executable_path was not provided",
        }
    if not path.is_file():
        return {
            "name": "executable_path",
            "ok": False,
            "detail": f"self-contained executable is missing: {path}",
        }
    if path.suffix.lower() != ".exe":
        return {
            "name": "executable_path",
            "ok": False,
            "detail": f"self-contained executable must be a .exe: {path}",
        }
    return {
        "name": "executable_path",
        "ok": True,
        "detail": str(path),
    }


def _check_sign_identity(identity: str | None) -> dict[str, object]:
    if identity is None:
        return {
            "name": "windows_sign_identity",
            "ok": False,
            "detail": "windows_sign_identity was not provided",
        }
    return {
        "name": "windows_sign_identity",
        "ok": True,
        "detail": identity,
    }


def _check_timestamp_url(timestamp_url: str | None) -> dict[str, object]:
    if timestamp_url is None:
        return {
            "name": "timestamp_url",
            "ok": False,
            "detail": "timestamp_url was not provided",
        }
    if not (
        timestamp_url.startswith("http://") or timestamp_url.startswith("https://")
    ):
        return {
            "name": "timestamp_url",
            "ok": False,
            "detail": "timestamp_url must start with http:// or https://",
        }
    return {
        "name": "timestamp_url",
        "ok": True,
        "detail": timestamp_url,
    }


def _check_packager_signing() -> dict[str, object]:
    return {
        "name": "windows_signing_implementation",
        "ok": True,
        "detail": (
            "desktop/scripts/build_release_artifacts.py runs "
            "SignTool sign and verify"
        ),
    }


def build_payload(args: argparse.Namespace) -> dict[str, object]:
    executable = _resolve_optional_path(args.executable, DEFAULT_EXECUTABLE)
    sign_identity = _resolve_text(args.sign_identity, SIGN_IDENTITY_ENV)
    timestamp_url = _resolve_text(args.timestamp_url, TIMESTAMP_URL_ENV)

    checks: List[dict[str, object]] = [_check_tool(name) for name in REQUIRED_TOOLS]
    checks.append(_check_host())
    checks.append(_check_executable(executable))
    checks.append(_check_sign_identity(sign_identity))
    checks.append(_check_timestamp_url(timestamp_url))
    checks.append(_check_packager_signing())

    missing_inputs = [
        check["name"]
        for check in checks
        if not check["ok"]
        and str(check["name"])
        in {"executable_path", "windows_sign_identity", "timestamp_url"}
        and "was not provided" in str(check["detail"])
    ]
    ready = all(bool(check["ok"]) for check in checks)
    return {
        "ready": ready,
        "target": "windows",
        "checks": checks,
        "missing_inputs": missing_inputs,
        "release_commands": _release_commands(
            args,
            executable,
            sign_identity,
            timestamp_url,
        ),
    }


def _release_commands(
    args: argparse.Namespace,
    executable_path: Path | None,
    sign_identity: str | None,
    timestamp_url: str | None,
) -> List[str]:
    executable = (
        str(executable_path)
        if executable_path
        else str(DEFAULT_EXECUTABLE.relative_to(ROOT))
    )
    identity = sign_identity or "VSLE Windows Code Signing"
    timestamp = timestamp_url or "https://timestamp.digicert.com"
    return [
        (
            "./.venv/bin/python desktop/scripts/build_release_artifacts.py windows "
            f"--executable {executable} "
            "--output desktop/release/windows --version 0.1.0 "
            f'--sign-identity "{identity}" '
            f"--timestamp-url {timestamp}"
        ),
    ]


def _write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _write_markdown(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Windows Release Preflight",
        "",
        f"Ready: {'yes' if payload['ready'] else 'no'}",
        "",
        "## Checks",
        "",
    ]
    for check in payload["checks"]:
        status = "pass" if check["ok"] else "fail"
        lines.append(f"- {check['name']}: {status} - {check['detail']}")
    lines.extend(["", "## Release Commands", ""])
    for command in payload["release_commands"]:
        lines.extend(["```bash", command, "```", ""])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Check local prerequisites for the Windows classroom release flow."
    )
    parser.add_argument("--executable", help="Self-contained WeisileLink.exe")
    parser.add_argument(
        "--sign-identity",
        help=(
            "Windows signing identity or certificate subject. May also be set "
            f"with {SIGN_IDENTITY_ENV}."
        ),
    )
    parser.add_argument(
        "--timestamp-url",
        help=(
            "RFC3161 timestamp URL for SignTool. May also be set with "
            f"{TIMESTAMP_URL_ENV}."
        ),
    )
    parser.add_argument(
        "--json-report",
        type=Path,
        default=DEFAULT_JSON_REPORT,
        help="JSON report path",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=DEFAULT_MARKDOWN_REPORT,
        help="Markdown report path",
    )
    args = parser.parse_args(argv)

    payload = build_payload(args)
    _write_json(args.json_report.expanduser().resolve(), payload)
    _write_markdown(args.report.expanduser().resolve(), payload)

    print(f"Windows release preflight report: {args.report}")
    return 0 if payload["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
