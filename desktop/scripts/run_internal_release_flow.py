#!/usr/bin/env python3
"""Build unsigned WeisileLink artifacts for internal testing."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import platform
import subprocess
import sys
from typing import Callable


ROOT = Path(__file__).resolve().parents[2]
PYTHON = sys.executable
BUILD_EXECUTABLE_SCRIPT = ROOT / "desktop/scripts/build_weisilelink_executable.py"
PACKAGER_SCRIPT = ROOT / "desktop/scripts/build_release_artifacts.py"
MACOS_NATIVE_BUILD_SCRIPT = ROOT / "desktop/macos/native/build.sh"
DEFAULT_VERSION = "0.1.0-internal"
DEFAULT_OUTPUT = ROOT / "desktop/release/internal"
DEFAULT_JSON_REPORT = ROOT / "docs/desktop/evidence/internal-release.json"
DEFAULT_MARKDOWN_REPORT = ROOT / "docs/desktop/evidence/internal-release.md"
DEFAULT_MACOS_EXECUTABLE = ROOT / "desktop/build/macos/WeisileLink"
DEFAULT_MACOS_NATIVE_ADAPTER = (
    ROOT
    / "desktop/build/macos/native/WeisileEV3BluetoothAdapter.app"
    / "Contents/MacOS/WeisileEV3BluetoothAdapter"
)
DEFAULT_WINDOWS_EXECUTABLE = ROOT / "desktop/build/windows/WeisileLink.exe"

CommandRunner = Callable[..., subprocess.CompletedProcess]
ACCEPTABLE_STARTUP_CODES = {0, 2, 3}


def _host() -> str:
    return platform.system().lower()


def _target_output(output: Path, target: str) -> Path:
    return output.expanduser().resolve() / target


def _display(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def _write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _write_markdown(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    internal = payload["internal_test_release"]
    production = payload["production_release"]
    known_prompts = internal.get("known_security_prompts") or []
    startup_commands = internal.get("startup_verification_commands") or []
    startup_result = internal.get("startup_verification_result") or {}
    core_commands = internal.get("core_verification_commands") or []
    lines = [
        "# Internal Test Release Evidence",
        "",
        f"Target: {payload['target']}",
        f"Internal status: {internal['status']}",
        f"Internal ready: {'yes' if internal['ready'] else 'no'}",
        "",
        "## Internal Test Release",
        "",
        "- Goal: runnable internal testing build.",
        "- macOS signing: Internal Test Optional",
        "- macOS notarization: Internal Test Optional",
        "- Windows signing: Internal Test Optional",
        "- Windows timestamp URL: Internal Test Optional",
        "",
        "## Internal Test Required Checks",
        "",
        "- macOS dev/unsigned build can generate: "
        + ("pass" if internal["ready"] else "not ready"),
        "- Application startup: verify with"
        + (" the command below." if startup_commands else " target-host checks."),
        "- Core function verification: verify with"
        + (" the commands below." if core_commands else " target-host checks."),
        "- Build commands are reproducible: "
        + ("yes" if internal["build_commands"] else "no"),
        "",
        "## Production Release",
        "",
        "- Goal: external/customer distribution.",
    ]
    for blocker in production["blockers"]:
        lines.append(f"- {blocker}: Production Release Blocker")
    lines.extend(["", "## Build Commands", ""])
    for command in internal["build_commands"]:
        lines.extend(["```bash", command, "```", ""])
    if internal.get("verification_commands"):
        lines.extend(["## Verification Commands", ""])
        for command in internal["verification_commands"]:
            lines.extend(["```bash", command, "```", ""])
    if startup_commands:
        lines.extend(["## Application Startup Verification", ""])
        for command in startup_commands:
            lines.extend(["```bash", str(command), "```", ""])
        if startup_result:
            lines.append(
                "Observed startup state: "
                f"`{startup_result.get('state', 'unknown')}` "
                f"(exit {startup_result.get('returncode', 'unknown')})."
            )
        lines.append(
            "Expected internal-test states are `ready`, `needs_pairing`, or "
            "`needs_attention`; an unpaired test machine normally reports "
            "`needs_pairing`."
        )
        lines.append("")
    if core_commands:
        lines.extend(["## Core Function Verification", ""])
        for command in core_commands:
            lines.extend(["```bash", str(command), "```", ""])
    if known_prompts:
        lines.extend(["## Known Security Prompts", ""])
        for prompt in known_prompts:
            lines.append(f"- {prompt}")
        lines.append("")
    if internal.get("notes"):
        lines.extend(["## Notes", ""])
        lines.append(str(internal["notes"]))
        lines.append("")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def _command_text(command: list[object]) -> str:
    return " ".join(str(part) for part in command)


def _run(command: list[object], runner: CommandRunner) -> int:
    result = runner([str(part) for part in command], cwd=ROOT, check=False)
    return int(result.returncode)


def _run_startup_check(
    command: list[object],
    runner: CommandRunner,
) -> dict[str, object]:
    result = runner(
        [str(part) for part in command],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    stdout = str(getattr(result, "stdout", "") or "").strip()
    state = "unknown"
    if stdout:
        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError:
            payload = {}
        if isinstance(payload, dict):
            state = str(payload.get("state") or state)
    return {
        "acceptable": int(result.returncode) in ACCEPTABLE_STARTUP_CODES,
        "command": _command_text(command),
        "returncode": int(result.returncode),
        "state": state,
    }


def _base_payload(target: str) -> dict[str, object]:
    return {
        "target": target,
        "internal_test_release": {
            "ready": False,
            "status": "not-run",
            "signed": False,
            "notarized": False,
            "build_commands": [],
            "verification_commands": [],
            "startup_verification_commands": [],
            "startup_verification_result": {},
            "core_verification_commands": [],
            "known_security_prompts": [],
            "blocking_items": [],
            "notes": "",
        },
        "production_release": {
            "ready": False,
            "blockers": [
                "macos_developer_id",
                "macos_notarization",
                "windows_code_signing_certificate",
                "windows_timestamp_url",
                "windows_publisher_reputation",
            ],
        },
    }


def _macos_payload(
    args: argparse.Namespace,
    runner: CommandRunner,
) -> tuple[int, dict[str, object]]:
    payload = _base_payload("macos")
    internal = payload["internal_test_release"]
    if _host() != "darwin":
        internal.update(
            {
                "status": "requires-macos-host",
                "blocking_items": ["macos_host"],
                "notes": (
                    "macOS unsigned internal build requires a real macOS host."
                ),
            }
        )
        return 2, payload

    executable = (args.executable or DEFAULT_MACOS_EXECUTABLE).resolve()
    native_adapter = (
        args.native_adapter or DEFAULT_MACOS_NATIVE_ADAPTER
    ).resolve()
    output = _target_output(args.output, "macos")
    build_commands: list[str] = []

    if args.clean or not executable.is_file():
        command = [
            PYTHON,
            BUILD_EXECUTABLE_SCRIPT,
            "--target",
            "macos",
            "--output",
            executable.parent,
        ]
        if args.clean:
            command.append("--clean")
        build_commands.append(_command_text(command))
        code = _run(command, runner)
        if code != 0:
            internal.update(
                {
                    "status": "executable-build-failed",
                    "build_commands": build_commands,
                    "blocking_items": ["macos_executable_build"],
                }
            )
            return code or 1, payload

    if not native_adapter.is_file() and MACOS_NATIVE_BUILD_SCRIPT.is_file():
        command = [MACOS_NATIVE_BUILD_SCRIPT]
        build_commands.append(_command_text(command))
        code = _run(command, runner)
        if code != 0:
            internal.update(
                {
                    "status": "native-adapter-build-failed",
                    "build_commands": build_commands,
                    "blocking_items": ["macos_native_adapter_build"],
                }
            )
            return code or 1, payload

    package_command = [
        PYTHON,
        PACKAGER_SCRIPT,
        "macos",
        "--executable",
        executable,
        "--native-adapter",
        native_adapter,
        "--output",
        output,
        "--version",
        args.version,
        "--allow-unsigned",
    ]
    build_commands.append(_command_text(package_command))
    code = _run(package_command, runner)
    if code != 0:
        internal.update(
            {
                "status": "packaging-failed",
                "build_commands": build_commands,
                "blocking_items": ["macos_unsigned_packaging"],
            }
        )
        return code or 1, payload

    startup_command = [
        executable,
        "desktop-start",
        "--check-only",
        "--config",
        ROOT / ".tmp/internal-release-check/config.json",
        "--ready-timeout",
        "0.1",
    ]
    startup_result = _run_startup_check(startup_command, runner)
    if not startup_result["acceptable"]:
        internal.update(
            {
                "status": "startup-verification-failed",
                "build_commands": build_commands,
                "blocking_items": ["macos_application_startup"],
                "startup_verification_commands": [
                    _command_text(startup_command)
                ],
                "startup_verification_result": startup_result,
            }
        )
        return int(startup_result["returncode"]) or 1, payload

    internal.update(
        {
            "ready": True,
            "status": "internal-build-ready",
            "build_commands": build_commands,
            "artifact_output": _display(output),
            "known_security_prompts": [
                "macOS may show 'cannot verify developer' for unsigned builds.",
            ],
            "verification_commands": [
                "./.venv/bin/python -m pytest "
                "tests/test_desktop_packaging.py "
                "tests/test_desktop_install_smoke.py -v"
            ],
            "startup_verification_commands": [
                "desktop/build/macos/WeisileLink desktop-start --check-only "
                "--config .tmp/internal-release-check/config.json "
                "--ready-timeout 0.1"
            ],
            "startup_verification_result": startup_result,
            "core_verification_commands": [
                "./.venv/bin/python -m pytest "
                "tests/test_desktop_packaging.py "
                "tests/test_desktop_install_smoke.py -v"
            ],
            "notes": (
                "Unsigned macOS internal builds are for VSLE-controlled "
                "test machines only and are not production release artifacts."
            ),
        }
    )
    return 0, payload


def _windows_payload(
    args: argparse.Namespace,
    runner: CommandRunner,
) -> tuple[int, dict[str, object]]:
    payload = _base_payload("windows")
    internal = payload["internal_test_release"]
    if _host() != "windows":
        internal.update(
            {
                "status": "requires-windows-host",
                "blocking_items": ["windows_host_or_actions"],
                "build_commands": [
                    "./.venv/bin/python "
                    "desktop/scripts/run_internal_release_flow.py "
                    "--target windows"
                ],
                "notes": (
                    "Windows unsigned internal build requires real Windows "
                    "host or GitHub Actions windows-latest. Windows code "
                    "signing certificate and timestamp URL are production "
                    "release blockers only."
                ),
            }
        )
        return 2, payload

    executable = (args.executable or DEFAULT_WINDOWS_EXECUTABLE).resolve()
    output = _target_output(args.output, "windows")
    build_commands: list[str] = []
    if args.clean or not executable.is_file():
        command = [
            PYTHON,
            BUILD_EXECUTABLE_SCRIPT,
            "--target",
            "windows",
            "--output",
            executable.parent,
        ]
        if args.clean:
            command.append("--clean")
        build_commands.append(_command_text(command))
        code = _run(command, runner)
        if code != 0:
            internal.update(
                {
                    "status": "executable-build-failed",
                    "build_commands": build_commands,
                    "blocking_items": ["windows_executable_build"],
                }
            )
            return code or 1, payload

    package_command = [
        PYTHON,
        PACKAGER_SCRIPT,
        "windows",
        "--executable",
        executable,
        "--output",
        output,
        "--version",
        args.version,
        "--allow-unsigned",
    ]
    build_commands.append(_command_text(package_command))
    code = _run(package_command, runner)
    if code != 0:
        internal.update(
            {
                "status": "packaging-failed",
                "build_commands": build_commands,
                "blocking_items": ["windows_unsigned_packaging"],
            }
        )
        return code or 1, payload

    internal.update(
        {
            "ready": True,
            "status": "internal-build-ready",
            "build_commands": build_commands,
            "artifact_output": _display(output),
            "known_security_prompts": [
                "Windows may show unknown publisher warnings.",
            ],
            "verification_commands": [
                "python -m pytest tests/test_desktop_packaging.py "
                "tests/test_desktop_install_smoke.py -v"
            ],
            "startup_verification_commands": [
                "WeisileLink.exe desktop-start --check-only "
                "--config %LOCALAPPDATA%\\VSLE\\WeisileLink\\config.json "
                "--ready-timeout 0.1"
            ],
            "startup_verification_result": {},
            "core_verification_commands": [
                "python -m pytest tests/test_desktop_packaging.py "
                "tests/test_desktop_install_smoke.py -v"
            ],
            "notes": (
                "Unsigned Windows internal builds are for VSLE-controlled "
                "test machines only and are not production release artifacts."
            ),
        }
    )
    return 0, payload


def run_internal_release_flow(
    args: argparse.Namespace,
    runner: CommandRunner = subprocess.run,
) -> int:
    targets = ["macos", "windows"] if args.target == "all" else [args.target]
    results = []
    exit_codes = []
    for target in targets:
        if target == "macos":
            code, payload = _macos_payload(args, runner)
        else:
            code, payload = _windows_payload(args, runner)
        results.append(payload)
        exit_codes.append(code)

    payload = results[0] if len(results) == 1 else {
        "target": "all",
        "results": results,
        "internal_test_release": {
            "ready": any(
                result["internal_test_release"]["ready"]
                for result in results
            ),
            "status": "partial" if any(code == 0 for code in exit_codes) else "blocked",
            "signed": False,
            "notarized": False,
            "build_commands": [
                command
                for result in results
                for command in result["internal_test_release"]["build_commands"]
            ],
            "verification_commands": [],
            "startup_verification_commands": [
                command
                for result in results
                for command in result["internal_test_release"].get(
                    "startup_verification_commands",
                    [],
                )
            ],
            "startup_verification_result": next(
                (
                    result["internal_test_release"].get(
                        "startup_verification_result",
                        {},
                    )
                    for result in results
                    if result["internal_test_release"].get(
                        "startup_verification_result"
                    )
                ),
                {},
            ),
            "core_verification_commands": [
                command
                for result in results
                for command in result["internal_test_release"].get(
                    "core_verification_commands",
                    [],
                )
            ],
            "known_security_prompts": [
                prompt
                for result in results
                for prompt in result["internal_test_release"].get(
                    "known_security_prompts",
                    [],
                )
            ],
            "blocking_items": [
                item
                for result in results
                for item in result["internal_test_release"]["blocking_items"]
            ],
            "notes": (
                "Target all builds the current host target and records host "
                "requirements for unavailable targets."
            ),
        },
        "production_release": _base_payload("all")["production_release"],
    }
    _write_json(args.json_report, payload)
    _write_markdown(args.report, payload)
    print(f"internal release report: {args.report}")
    if args.target == "all":
        return 0 if any(code == 0 for code in exit_codes) else max(exit_codes)
    return exit_codes[0]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build unsigned WeisileLink artifacts for internal testing."
    )
    parser.add_argument(
        "--target",
        choices=("macos", "windows", "all"),
        required=True,
    )
    parser.add_argument("--executable", type=Path)
    parser.add_argument("--native-adapter", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--version", default=DEFAULT_VERSION)
    parser.add_argument("--json-report", type=Path, default=DEFAULT_JSON_REPORT)
    parser.add_argument("--report", type=Path, default=DEFAULT_MARKDOWN_REPORT)
    parser.add_argument("--clean", action="store_true")
    return run_internal_release_flow(parser.parse_args(argv))


if __name__ == "__main__":
    raise SystemExit(main())
