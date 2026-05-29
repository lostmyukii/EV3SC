#!/usr/bin/env python3
"""Run the guarded macOS WeisileLink release chain after preflight passes."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
from typing import Callable


ROOT = Path(__file__).resolve().parents[2]
PYTHON = sys.executable
PREFLIGHT_SCRIPT = ROOT / "desktop/scripts/check_macos_release_preflight.py"
PACKAGER_SCRIPT = ROOT / "desktop/scripts/build_release_artifacts.py"
NOTARIZE_SCRIPT = ROOT / "desktop/scripts/notarize_macos_release.py"
PKG_SCRIPT = ROOT / "desktop/scripts/build_macos_pkg.py"
DEFAULT_PREFLIGHT_JSON = ROOT / "docs/desktop/evidence/macos-release-preflight.json"
DEFAULT_PREFLIGHT_REPORT = ROOT / "docs/desktop/evidence/macos-release-preflight.md"
DEFAULT_JSON_REPORT = ROOT / "docs/desktop/evidence/macos-release-flow.json"
DEFAULT_MARKDOWN_REPORT = ROOT / "docs/desktop/evidence/macos-release-flow.md"
DEFAULT_OUTPUT = ROOT / "desktop/release/macos"
DEFAULT_VERSION = "0.1.0"

CommandRunner = Callable[..., subprocess.CompletedProcess]


def _append_optional(command: list[str], flag: str, value: object | None) -> None:
    if value is None:
        return
    text = str(value)
    if text.strip():
        command.extend([flag, text])


def _preflight_command(args: argparse.Namespace) -> list[str]:
    command = [
        PYTHON,
        str(PREFLIGHT_SCRIPT),
        "--json-report",
        str(args.preflight_json_report),
        "--report",
        str(args.preflight_report),
    ]
    _append_optional(command, "--executable", args.executable)
    _append_optional(command, "--native-adapter", args.native_adapter)
    _append_optional(command, "--app-sign-identity", args.app_sign_identity)
    _append_optional(
        command,
        "--installer-sign-identity",
        args.installer_sign_identity,
    )
    _append_optional(
        command,
        "--notary-keychain-profile",
        args.notary_keychain_profile,
    )
    return command


def _load_preflight(path: Path) -> dict[str, object]:
    if not path.is_file():
        raise ValueError(f"preflight JSON report was not written: {path}")
    decoded = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(decoded, dict):
        raise ValueError("preflight JSON report must be an object")
    return decoded


def _command_name(command: list[str]) -> str:
    if len(command) < 2:
        return "unknown"
    return Path(command[1]).name


def _write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _write_markdown(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    executed = payload.get("commands_executed")
    if not isinstance(executed, list):
        executed = []
    failures = payload.get("preflight_failures")
    if not isinstance(failures, list):
        failures = []
    release_commands = payload.get("release_commands_after_preflight")
    if not isinstance(release_commands, list):
        release_commands = []
    lines = [
        "# macOS Release Flow",
        "",
        f"Status: {payload['status']}",
        f"Preflight ready: {'yes' if payload['preflight_ready'] else 'no'}",
        f"Commands executed: {len(executed)}",
        "",
    ]
    if payload.get("blocked_reason"):
        lines.append(f"Blocked reason: {payload['blocked_reason']}")
        lines.append("")
    if failures:
        lines.extend(["## Preflight Blocking Checks", ""])
        for failure in failures:
            if not isinstance(failure, dict):
                continue
            lines.append(f"- {failure.get('name')}: {failure.get('detail')}")
        lines.append("")
    if release_commands:
        lines.extend(["## Release Commands After Preflight Passes", ""])
        for command in release_commands:
            lines.extend(["```bash", str(command), "```", ""])
    if executed:
        lines.extend(["## Commands", ""])
        for command in executed:
            lines.append(f"- {command}")
        lines.append("")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def _write_reports(args: argparse.Namespace, payload: dict[str, object]) -> None:
    _write_json(args.json_report, payload)
    _write_markdown(args.report, payload)


def _blocked_preflight_details(path: Path) -> dict[str, object]:
    try:
        payload = _load_preflight(path)
    except (OSError, ValueError, json.JSONDecodeError):
        return {
            "preflight_failures": [],
            "release_commands_after_preflight": [],
        }

    failures: list[dict[str, object]] = []
    checks = payload.get("checks")
    if isinstance(checks, list):
        for check in checks:
            if not isinstance(check, dict):
                continue
            if check.get("ok") is False:
                failures.append(
                    {
                        "name": check.get("name", "unknown"),
                        "detail": check.get("detail", "not recorded"),
                    }
                )

    release_commands = payload.get("release_commands")
    if not isinstance(release_commands, list):
        release_commands = []

    return {
        "preflight_failures": failures,
        "release_commands_after_preflight": release_commands,
    }


def _check_detail(payload: dict[str, object], name: str) -> str:
    checks = payload.get("checks")
    if not isinstance(checks, list):
        raise ValueError("preflight JSON report lacks checks")
    for check in checks:
        if not isinstance(check, dict):
            continue
        if check.get("name") == name and check.get("ok") is True:
            detail = check.get("detail")
            if isinstance(detail, str) and detail:
                return detail
    raise ValueError(f"preflight check did not pass: {name}")


def _release_commands(
    args: argparse.Namespace,
    payload: dict[str, object],
) -> list[list[str]]:
    executable = _check_detail(payload, "executable_path")
    native_adapter = _check_detail(payload, "native_adapter_path")
    app_identity = _check_detail(payload, "app_sign_identity")
    installer_identity = _check_detail(payload, "installer_sign_identity")
    notary_profile = _check_detail(payload, "notary_keychain_profile")
    manifest = args.output / f"WeisileLink-macos-{args.version}-manifest.json"
    return [
        [
            PYTHON,
            str(PACKAGER_SCRIPT),
            "macos",
            "--executable",
            executable,
            "--native-adapter",
            native_adapter,
            "--output",
            str(args.output),
            "--version",
            args.version,
            "--sign-identity",
            app_identity,
        ],
        [
            PYTHON,
            str(NOTARIZE_SCRIPT),
            "--manifest",
            str(manifest),
            "--keychain-profile",
            notary_profile,
        ],
        [
            PYTHON,
            str(PKG_SCRIPT),
            "--manifest",
            str(manifest),
            "--sign-identity",
            installer_identity,
        ],
    ]


def run_release_flow(
    args: argparse.Namespace,
    runner: CommandRunner = subprocess.run,
) -> int:
    preflight = _preflight_command(args)
    preflight_result = runner(preflight, cwd=ROOT, check=False)
    if preflight_result.returncode != 0:
        details = _blocked_preflight_details(args.preflight_json_report)
        _write_reports(
            args,
            {
                "blocked_reason": "macOS release preflight did not pass",
                "commands_executed": [],
                "preflight_ready": False,
                "preflight_report": str(args.preflight_report),
                "status": "blocked-preflight",
                **details,
            },
        )
        print(
            f"macOS release preflight did not pass; see {args.preflight_report}",
            file=sys.stderr,
        )
        return 2

    try:
        payload = _load_preflight(args.preflight_json_report)
        if payload.get("ready") is not True:
            raise ValueError("preflight JSON report is not ready")
        commands = _release_commands(args, payload)
    except ValueError as exc:
        _write_reports(
            args,
            {
                "blocked_reason": str(exc),
                "commands_executed": [],
                "preflight_ready": False,
                "preflight_report": str(args.preflight_report),
                "status": "blocked-preflight",
            },
        )
        print(str(exc), file=sys.stderr)
        return 2

    executed: list[str] = []
    for command in commands:
        result = runner(command, cwd=ROOT, check=False)
        executed.append(_command_name(command))
        if result.returncode != 0:
            _write_reports(
                args,
                {
                    "blocked_reason": f"release command failed: {_command_name(command)}",
                    "commands_executed": executed,
                    "preflight_ready": True,
                    "preflight_report": str(args.preflight_report),
                    "status": "failed",
                },
            )
            print(f"release command failed: {' '.join(command)}", file=sys.stderr)
            return result.returncode or 1

    manifest = args.output / f"WeisileLink-macos-{args.version}-manifest.json"
    result = {
        "commands_executed": executed,
        "manifest": str(manifest),
        "preflight_ready": True,
        "preflight_report": str(args.preflight_report),
        "status": "release-flow-complete",
    }
    _write_reports(args, result)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Run the macOS WeisileLink signed app, notarization, and signed "
            "pkg flow after the release preflight reports Ready: yes."
        )
    )
    parser.add_argument("--executable", type=Path)
    parser.add_argument("--native-adapter", type=Path)
    parser.add_argument("--app-sign-identity")
    parser.add_argument("--installer-sign-identity")
    parser.add_argument("--notary-keychain-profile")
    parser.add_argument(
        "--preflight-json-report",
        type=Path,
        default=DEFAULT_PREFLIGHT_JSON,
    )
    parser.add_argument(
        "--preflight-report",
        type=Path,
        default=DEFAULT_PREFLIGHT_REPORT,
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--version", default=DEFAULT_VERSION)
    parser.add_argument(
        "--json-report",
        type=Path,
        default=DEFAULT_JSON_REPORT,
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=DEFAULT_MARKDOWN_REPORT,
    )
    return run_release_flow(parser.parse_args(argv))


if __name__ == "__main__":
    raise SystemExit(main())
