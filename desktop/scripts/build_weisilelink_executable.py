#!/usr/bin/env python3
"""Build a self-contained WeisileLink executable with PyInstaller."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import platform
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
PYTHON = sys.executable
ENTRYPOINT = ROOT / "weisile-link/weisile_link/__main__.py"
DEFAULT_BUILD_ROOT = ROOT / "desktop/build"

TARGET_HOSTS = {
    "macos": "darwin",
    "windows": "windows",
}


def _host_key() -> str:
    return platform.system().lower()


def _require_host(target: str) -> None:
    host = _host_key()
    expected = TARGET_HOSTS[target]
    if host == expected:
        return
    if target == "windows":
        raise ValueError("Windows executable build must run on Windows.")
    if target == "macos":
        raise ValueError("macOS executable build must run on macOS.")
    raise ValueError(f"Unsupported target: {target}")


def _default_output(target: str) -> Path:
    return DEFAULT_BUILD_ROOT / target


def _default_workpath(target: str) -> Path:
    return DEFAULT_BUILD_ROOT / "pyinstaller-work" / target


def _default_specpath(target: str) -> Path:
    return DEFAULT_BUILD_ROOT / "pyinstaller-spec" / target


def _executable_path(target: str, output: Path) -> Path:
    name = "WeisileLink.exe" if target == "windows" else "WeisileLink"
    return output / name


def _pyinstaller_command(args: argparse.Namespace) -> list[str]:
    command = [
        PYTHON,
        "-m",
        "PyInstaller",
        "--onefile",
        "--console",
    ]
    if args.clean:
        command.append("--clean")
    command.extend(
        [
            "--name",
            "WeisileLink",
            "--distpath",
            str(args.output),
            "--workpath",
            str(args.workpath),
            "--specpath",
            str(args.specpath),
            str(ENTRYPOINT),
        ]
    )
    return command


def build_executable(
    args: argparse.Namespace,
    runner=None,
) -> dict[str, object]:
    if runner is None:
        runner = subprocess.run
    _require_host(args.target)
    args.output.mkdir(parents=True, exist_ok=True)
    args.workpath.mkdir(parents=True, exist_ok=True)
    args.specpath.mkdir(parents=True, exist_ok=True)

    command = _pyinstaller_command(args)
    runner(command, cwd=ROOT, check=True)

    executable = _executable_path(args.target, args.output)
    if not executable.is_file():
        raise ValueError(f"PyInstaller did not write executable: {executable}")

    return {
        "command": command,
        "executable": str(executable),
        "host": platform.system(),
        "target": args.target,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build a self-contained WeisileLink executable."
    )
    parser.add_argument("--target", choices=sorted(TARGET_HOSTS), required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--workpath", type=Path)
    parser.add_argument("--specpath", type=Path)
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Pass --clean to PyInstaller before building.",
    )
    args = parser.parse_args(argv)
    args.output = args.output or _default_output(args.target)
    args.workpath = args.workpath or _default_workpath(args.target)
    args.specpath = args.specpath or _default_specpath(args.target)

    try:
        result = build_executable(args)
    except subprocess.CalledProcessError as exc:
        print(f"PyInstaller command failed: {exc}", file=sys.stderr)
        return 1
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
