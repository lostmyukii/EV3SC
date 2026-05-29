#!/usr/bin/env python3
"""Check whether this Mac can run the WeisileLink classroom release flow."""

from __future__ import annotations

import argparse
import json
import plistlib
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Callable, List, Tuple


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_JSON_REPORT = ROOT / "docs/desktop/evidence/macos-release-preflight.json"
DEFAULT_MARKDOWN_REPORT = ROOT / "docs/desktop/evidence/macos-release-preflight.md"
DEFAULT_EXECUTABLE = ROOT / "desktop/build/macos/WeisileLink"
DEFAULT_NATIVE_ADAPTER = (
    ROOT
    / "desktop/build/macos/native/WeisileEV3BluetoothAdapter.app"
    / "Contents/MacOS/WeisileEV3BluetoothAdapter"
)
REQUIRED_TOOLS = (
    "codesign",
    "security",
    "xcrun",
    "pkgbuild",
    "productbuild",
)


CommandRunner = Callable[..., subprocess.CompletedProcess]


def _resolve_optional_path(
    raw: str | None,
    default_path: Path | None = None,
) -> Path | None:
    if raw is None or not raw.strip():
        if default_path is not None and default_path.is_file():
            return default_path.resolve()
        return None
    return Path(raw).expanduser().resolve()


def _tool_path(name: str) -> str | None:
    return shutil.which(name)


def _check_tool(name: str) -> dict[str, object]:
    found = _tool_path(name)
    return {
        "name": f"tool:{name}",
        "ok": found is not None,
        "detail": found or f"{name} was not found on PATH",
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
    if not path.stat().st_mode & 0o111:
        return {
            "name": "executable_path",
            "ok": False,
            "detail": f"self-contained executable is not executable: {path}",
        }
    return {
        "name": "executable_path",
        "ok": True,
        "detail": str(path),
    }


def _find_app_bundle(path: Path) -> Path | None:
    for candidate in (path, *path.parents):
        if candidate.suffix == ".app":
            return candidate
    return None


def _check_native_adapter(path: Path | None) -> dict[str, object]:
    if path is None:
        return {
            "name": "native_adapter_path",
            "ok": False,
            "detail": "native_adapter_path was not provided",
        }

    app = _find_app_bundle(path)
    if app is None:
        return {
            "name": "native_adapter_path",
            "ok": False,
            "detail": "native adapter must be inside a .app bundle",
        }

    executable = app / "Contents/MacOS/WeisileEV3BluetoothAdapter"
    info_plist = app / "Contents/Info.plist"
    if not executable.is_file():
        return {
            "name": "native_adapter_path",
            "ok": False,
            "detail": f"native adapter executable is missing: {executable}",
        }
    if not info_plist.is_file():
        return {
            "name": "native_adapter_path",
            "ok": False,
            "detail": f"native adapter Info.plist is missing: {info_plist}",
        }

    try:
        info = plistlib.loads(info_plist.read_bytes())
    except Exception as exc:
        return {
            "name": "native_adapter_path",
            "ok": False,
            "detail": f"native adapter Info.plist is invalid: {exc!r}",
        }

    if "NSBluetoothAlwaysUsageDescription" not in info:
        return {
            "name": "native_adapter_path",
            "ok": False,
            "detail": (
                "native adapter Info.plist lacks " "NSBluetoothAlwaysUsageDescription"
            ),
        }

    return {
        "name": "native_adapter_path",
        "ok": True,
        "detail": str(executable),
    }


def _security_identities(runner: CommandRunner) -> Tuple[str, str | None]:
    if _tool_path("security") is None:
        return "", "security was not found on PATH"
    try:
        result = runner(
            ["security", "find-identity", "-v"],
            check=False,
            capture_output=True,
            text=True,
            timeout=20,
        )
    except subprocess.SubprocessError as exc:
        return "", f"security find-identity failed: {exc!r}"

    output = f"{result.stdout}\n{result.stderr}"
    if result.returncode != 0:
        return output, "security find-identity returned non-zero"
    return output, None


def _quoted_identities(identities_output: str) -> List[str]:
    return re.findall(r'"([^"]+)"', identities_output)


def _find_unique_identity(
    prefix: str, identities_output: str
) -> Tuple[str | None, str]:
    matches = sorted(
        {
            identity
            for identity in _quoted_identities(identities_output)
            if identity.startswith(prefix)
        }
    )
    if len(matches) == 1:
        return matches[0], "unique"
    if not matches:
        return None, "missing"
    return None, "multiple"


def _check_identity(
    label: str,
    identity: str | None,
    identity_prefix: str,
    identities_output: str,
    identity_error: str | None,
) -> Tuple[dict[str, object], str | None]:
    if identity is None or not identity.strip():
        if identity_error is not None:
            return (
                {
                    "name": label,
                    "ok": False,
                    "detail": identity_error,
                },
                None,
            )

        detected, detection_status = _find_unique_identity(
            identity_prefix,
            identities_output,
        )
        if detected is not None:
            return (
                {
                    "name": label,
                    "ok": True,
                    "detail": detected,
                },
                detected,
            )
        if detection_status == "multiple":
            detail = (
                f"{label} was not provided and multiple {identity_prefix} "
                "identities were found; provide the exact identity"
            )
        else:
            detail = (
                f"{label} was not provided and no {identity_prefix} "
                "identity was found"
            )
        return {
            "name": label,
            "ok": False,
            "detail": detail,
        }, None
    if identity_error is not None:
        return {
            "name": label,
            "ok": False,
            "detail": identity_error,
        }, identity
    if identity not in identities_output:
        return {
            "name": label,
            "ok": False,
            "detail": f"{identity} was not found in keychain identities",
        }, identity
    return {
        "name": label,
        "ok": True,
        "detail": identity,
    }, identity


def _check_notary_profile(
    profile: str | None,
    runner: CommandRunner,
) -> dict[str, object]:
    if profile is None or not profile.strip():
        return {
            "name": "notary_keychain_profile",
            "ok": False,
            "detail": "notary_keychain_profile was not provided",
        }
    if _tool_path("xcrun") is None:
        return {
            "name": "notary_keychain_profile",
            "ok": False,
            "detail": "xcrun was not found on PATH",
        }

    try:
        result = runner(
            [
                "xcrun",
                "notarytool",
                "history",
                "--keychain-profile",
                profile,
                "--output-format",
                "json",
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except subprocess.SubprocessError as exc:
        return {
            "name": "notary_keychain_profile",
            "ok": False,
            "detail": f"notarytool profile check failed: {exc!r}",
        }

    if result.returncode != 0:
        return {
            "name": "notary_keychain_profile",
            "ok": False,
            "detail": "notarytool profile check returned non-zero",
        }
    return {
        "name": "notary_keychain_profile",
        "ok": True,
        "detail": profile,
    }


def build_payload(args: argparse.Namespace, runner: CommandRunner) -> dict[str, object]:
    executable = _resolve_optional_path(args.executable, DEFAULT_EXECUTABLE)
    native_adapter = _resolve_optional_path(args.native_adapter, DEFAULT_NATIVE_ADAPTER)

    checks: List[dict[str, object]] = [_check_tool(name) for name in REQUIRED_TOOLS]
    checks.append(_check_executable(executable))
    checks.append(_check_native_adapter(native_adapter))

    identities_output, identity_error = _security_identities(runner)
    app_identity_check, app_identity = _check_identity(
        "app_sign_identity",
        args.app_sign_identity,
        "Developer ID Application:",
        identities_output,
        identity_error,
    )
    checks.append(app_identity_check)
    installer_identity_check, installer_identity = _check_identity(
        "installer_sign_identity",
        args.installer_sign_identity,
        "Developer ID Installer:",
        identities_output,
        identity_error,
    )
    checks.append(installer_identity_check)
    checks.append(_check_notary_profile(args.notary_keychain_profile, runner))

    missing_inputs = [
        check["name"]
        for check in checks
        if not check["ok"]
        and str(check["name"])
        in {
            "executable_path",
            "native_adapter_path",
            "app_sign_identity",
            "installer_sign_identity",
            "notary_keychain_profile",
        }
        and "was not provided" in str(check["detail"])
    ]
    ready = all(bool(check["ok"]) for check in checks)
    return {
        "ready": ready,
        "target": "macos",
        "checks": checks,
        "missing_inputs": missing_inputs,
        "release_commands": _release_commands(
            args,
            executable,
            native_adapter,
            app_identity,
            installer_identity,
        ),
    }


def _release_commands(
    args: argparse.Namespace,
    executable_path: Path | None,
    native_adapter_path: Path | None,
    detected_app_identity: str | None,
    detected_installer_identity: str | None,
) -> List[str]:
    executable = (
        str(executable_path)
        if executable_path
        else "<path-to-self-contained-WeisileLink>"
    )
    native_adapter = (
        str(native_adapter_path)
        if native_adapter_path
        else str(DEFAULT_NATIVE_ADAPTER.relative_to(ROOT))
    )
    app_identity = (
        args.app_sign_identity
        or detected_app_identity
        or "Developer ID Application: WeisileEDU"
    )
    installer_identity = (
        args.installer_sign_identity
        or detected_installer_identity
        or "Developer ID Installer: WeisileEDU"
    )
    notary_profile = args.notary_keychain_profile or "VSLE_NOTARY"
    manifest = "desktop/release/macos/WeisileLink-macos-0.1.0-manifest.json"
    return [
        (
            "./.venv/bin/python desktop/scripts/build_release_artifacts.py macos "
            f"--executable {executable} "
            f"--native-adapter {native_adapter} "
            "--output desktop/release/macos --version 0.1.0 "
            f'--sign-identity "{app_identity}"'
        ),
        (
            "./.venv/bin/python desktop/scripts/notarize_macos_release.py "
            f"--manifest {manifest} --keychain-profile {notary_profile}"
        ),
        (
            "./.venv/bin/python desktop/scripts/build_macos_pkg.py "
            f'--manifest {manifest} --sign-identity "{installer_identity}"'
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
        "# macOS Release Preflight",
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
        description="Check local prerequisites for the macOS classroom release flow."
    )
    parser.add_argument("--executable", help="Self-contained WeisileLink executable")
    parser.add_argument(
        "--native-adapter",
        help="Built WeisileEV3BluetoothAdapter.app or executable inside it",
    )
    parser.add_argument("--app-sign-identity", help="Developer ID Application identity")
    parser.add_argument(
        "--installer-sign-identity",
        help="Developer ID Installer identity",
    )
    parser.add_argument(
        "--notary-keychain-profile",
        help="Apple notarytool keychain profile name",
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

    payload = build_payload(args, subprocess.run)
    _write_json(args.json_report.expanduser().resolve(), payload)
    _write_markdown(args.report.expanduser().resolve(), payload)

    print(f"macOS release preflight report: {args.report}")
    return 0 if payload["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
