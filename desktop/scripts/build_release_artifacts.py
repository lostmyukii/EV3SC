#!/usr/bin/env python3
"""Build WeisileLink desktop release artifact folders and zip files.

This script packages an already-built, self-contained WeisileLink executable.
It intentionally refuses unsigned artifacts by default because classroom
releases must be signed before distribution.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import platform
import plistlib
import shutil
import stat
import subprocess
import sys
import zipfile


ROOT = Path(__file__).resolve().parents[2]
DESKTOP_ROOT = ROOT / "desktop"
MACOS_ASSET_ROOT = DESKTOP_ROOT / "macos"
WINDOWS_ASSET_ROOT = DESKTOP_ROOT / "windows"
DEFAULT_VERSION = "0.1.0"


def _default_version() -> str:
    pyproject = ROOT / "weisile-link/pyproject.toml"
    if not pyproject.is_file():
        return DEFAULT_VERSION
    for line in pyproject.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith("version"):
            _, value = stripped.split("=", 1)
            return value.strip().strip('"')
    return DEFAULT_VERSION


def _require_existing_executable(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise ValueError(f"Executable does not exist: {resolved}")
    return resolved


def _find_app_bundle(path: Path) -> Path | None:
    for candidate in (path, *path.parents):
        if candidate.suffix == ".app":
            return candidate
    return None


def _require_macos_native_adapter_bundle(path: Path) -> tuple[Path, Path]:
    resolved = path.expanduser().resolve()
    app_bundle = _find_app_bundle(resolved)
    if app_bundle is None:
        raise ValueError(
            "--native-adapter must point to the built "
            "WeisileEV3BluetoothAdapter.app bundle or to the executable "
            "inside that app bundle."
        )
    executable = app_bundle / "Contents" / "MacOS" / "WeisileEV3BluetoothAdapter"
    if not executable.is_file():
        raise ValueError(
            "macOS native adapter app is missing executable: " f"{executable}"
        )
    info_plist = app_bundle / "Contents" / "Info.plist"
    if not info_plist.is_file():
        raise ValueError(
            "macOS native adapter app is missing Info.plist: " f"{info_plist}"
        )
    info = plistlib.loads(info_plist.read_bytes())
    if "NSBluetoothAlwaysUsageDescription" not in info:
        raise ValueError(
            "macOS native adapter app must include "
            "NSBluetoothAlwaysUsageDescription."
        )
    return app_bundle, executable


def _prepare_output(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def _copy_executable(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    mode = target.stat().st_mode
    target.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _copy_app_bundle(source: Path, target: Path, executable: Path) -> Path:
    if target.exists():
        shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, target)
    target_executable = target / executable.relative_to(source)
    mode = target_executable.stat().st_mode
    target_executable.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return target_executable


def _copy_asset(source: Path, target: Path, executable: bool = False) -> None:
    if not source.is_file():
        raise ValueError(f"Missing desktop packaging asset: {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    if executable:
        mode = target.stat().st_mode
        target.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_json(path: Path, payload: dict[str, object]) -> None:
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _zip_directory(root: Path, zip_path: Path, arc_root: str) -> None:
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(root.rglob("*")):
            if path.is_dir():
                continue
            arcname = Path(arc_root) / path.relative_to(root)
            archive.write(path, arcname.as_posix())


def _unsigned_suffix(signed: bool) -> str:
    return "signed" if signed else "unsigned"


def _host_can_run_target(target: str) -> bool:
    system = platform.system().lower()
    return (target == "macos" and system == "darwin") or (
        target == "windows" and system == "windows"
    )


def _assert_unsigned_allowed(
    args: argparse.Namespace, parser: argparse.ArgumentParser
) -> None:
    if args.sign_identity or args.allow_unsigned:
        return
    parser.error(
        "Unsigned release artifacts are blocked by default. "
        "Pass --sign-identity for a signed package, or pass "
        "--allow-unsigned only for internal smoke artifacts."
    )


def _macos_info_plist(version: str) -> dict[str, object]:
    return {
        "CFBundleDevelopmentRegion": "en",
        "CFBundleDisplayName": "WeisileLink",
        "CFBundleExecutable": "WeisileLink",
        "CFBundleIdentifier": "cn.vsle.weisile-link",
        "CFBundleInfoDictionaryVersion": "6.0",
        "CFBundleName": "WeisileLink",
        "CFBundlePackageType": "APPL",
        "CFBundleShortVersionString": version,
        "CFBundleVersion": version,
        "LSBackgroundOnly": True,
        "LSMinimumSystemVersion": "11.0",
        "NSBluetoothAlwaysUsageDescription": (
            "WeisileLink uses the official-firmware EV3 Bluetooth "
            "connection for classroom robot control."
        ),
        "NSHumanReadableCopyright": "Copyright VSLE",
    }


def _codesign_macos_app(app: Path, identity: str | None) -> bool:
    if not identity:
        return False
    command = [
        "codesign",
        "--force",
        "--deep",
        "--options",
        "runtime",
        "--sign",
        identity,
        str(app),
    ]
    subprocess.run(command, check=True)
    subprocess.run(["codesign", "--verify", "--deep", "--strict", str(app)], check=True)
    return True


def build_macos(args: argparse.Namespace) -> dict[str, object]:
    executable = _require_existing_executable(args.executable)
    if args.native_adapter is None:
        raise ValueError(
            "macOS release artifacts require --native-adapter pointing to "
            "the built WeisileEV3BluetoothAdapter.app bundle or executable "
            "inside that app bundle."
        )
    native_adapter_app, native_adapter_executable = (
        _require_macos_native_adapter_bundle(args.native_adapter)
    )
    output = _prepare_output(args.output)
    app = output / "WeisileLink.app"
    if app.exists():
        shutil.rmtree(app)

    contents = app / "Contents"
    macos_dir = contents / "MacOS"
    resources = contents / "Resources"
    _copy_executable(executable, macos_dir / "WeisileLink")
    bundled_native_adapter = _copy_app_bundle(
        native_adapter_app,
        resources / "native" / "WeisileEV3BluetoothAdapter.app",
        native_adapter_executable,
    )
    _copy_asset(MACOS_ASSET_ROOT / "install.sh", resources / "install.sh", True)
    _copy_asset(MACOS_ASSET_ROOT / "uninstall.sh", resources / "uninstall.sh", True)
    _copy_asset(
        MACOS_ASSET_ROOT / "weisile-link.launchd.plist",
        resources / "weisile-link.launchd.plist",
    )
    with (contents / "Info.plist").open("wb") as handle:
        plistlib.dump(_macos_info_plist(args.version), handle)

    signed = _codesign_macos_app(app, args.sign_identity)
    suffix = _unsigned_suffix(signed)
    zip_path = output / f"WeisileLink-macos-{args.version}-{suffix}.zip"
    _zip_directory(app, zip_path, "WeisileLink.app")

    manifest_path = output / f"WeisileLink-macos-{args.version}-manifest.json"
    manifest: dict[str, object] = {
        "target": "macos",
        "version": args.version,
        "artifact_zip": zip_path.name,
        "artifact_sha256": _sha256(zip_path),
        "app_bundle": app.name,
        "signed": signed,
        "notarized": False,
        "classroom_ready": False,
        "contains_self_contained_executable": True,
        "contains_macos_native_bluetooth_adapter": True,
        "macos_native_bluetooth_adapter": str(bundled_native_adapter.relative_to(app)),
        "official_firmware_bt_classroom_ready": False,
        "build_host_can_run_target": _host_can_run_target("macos"),
        "localhost_defaults": {
            "WEISILE_LINK_HOST": "127.0.0.1",
            "WEISILE_LINK_PORT": "20111",
            "TRAINER_WS_PORT": "8766",
        },
        "requires_clean_machine_evidence": True,
        "release_note": (
            "Unsigned artifacts are for internal smoke only. Classroom "
            "distribution also requires notarization and clean-machine "
            "install evidence."
        ),
    }
    _write_json(manifest_path, manifest)
    return {"manifest": str(manifest_path), "zip": str(zip_path)}


def _windows_signed(args: argparse.Namespace) -> bool:
    if not args.sign_identity:
        return False
    if platform.system().lower() != "windows":
        raise ValueError("Windows signing must run on Windows with SignTool.")
    raise ValueError("Windows SignTool signing is not wired in this packager yet.")


def build_windows(args: argparse.Namespace) -> dict[str, object]:
    executable = _require_existing_executable(args.executable)
    output = _prepare_output(args.output)
    package_root = output / "WeisileLink"
    if package_root.exists():
        shutil.rmtree(package_root)

    _copy_executable(executable, package_root / "WeisileLink.exe")
    _copy_asset(WINDOWS_ASSET_ROOT / "install.ps1", package_root / "install.ps1")
    _copy_asset(WINDOWS_ASSET_ROOT / "uninstall.ps1", package_root / "uninstall.ps1")
    _copy_asset(
        WINDOWS_ASSET_ROOT / "weisile-link-service.xml",
        package_root / "weisile-link-service.xml",
    )
    (package_root / "README.txt").write_text(
        "\n".join(
            [
                "WeisileLink Windows release artifact",
                "",
                "Run install.ps1 from an unsigned internal smoke artifact only",
                "when testing inside VSLE-controlled machines.",
                "Classroom distribution requires signed installer artifacts",
                "and clean-machine install evidence.",
                "",
            ]
        ),
        encoding="utf-8",
    )

    signed = _windows_signed(args)
    suffix = _unsigned_suffix(signed)
    zip_path = output / f"WeisileLink-windows-{args.version}-{suffix}.zip"
    _zip_directory(package_root, zip_path, "WeisileLink")

    manifest_path = output / f"WeisileLink-windows-{args.version}-manifest.json"
    manifest: dict[str, object] = {
        "target": "windows",
        "version": args.version,
        "artifact_zip": zip_path.name,
        "artifact_sha256": _sha256(zip_path),
        "package_root": package_root.name,
        "signed": signed,
        "classroom_ready": False,
        "contains_self_contained_executable": True,
        "build_host_can_run_target": _host_can_run_target("windows"),
        "localhost_defaults": {
            "WEISILE_LINK_HOST": "127.0.0.1",
            "WEISILE_LINK_PORT": "20111",
            "TRAINER_WS_PORT": "8766",
        },
        "requires_clean_machine_evidence": True,
        "release_note": (
            "Unsigned artifacts are for internal smoke only. Classroom "
            "distribution also requires signing and clean-machine install "
            "evidence."
        ),
    }
    _write_json(manifest_path, manifest)
    return {"manifest": str(manifest_path), "zip": str(zip_path)}


def _add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--executable",
        type=Path,
        required=True,
        help="Path to the self-contained WeisileLink executable to package.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DESKTOP_ROOT / "release",
        help="Directory where release folders, zips, and manifests are written.",
    )
    parser.add_argument(
        "--version",
        default=_default_version(),
        help="Artifact version. Defaults to weisile-link/pyproject.toml.",
    )
    parser.add_argument(
        "--sign-identity",
        help="Signing identity. macOS uses codesign; Windows signing is gated.",
    )
    parser.add_argument(
        "--allow-unsigned",
        action="store_true",
        help="Allow unsigned internal smoke artifacts. Not for classrooms.",
    )


def parse_args(argv: list[str]) -> tuple[argparse.ArgumentParser, argparse.Namespace]:
    parser = argparse.ArgumentParser(
        description="Build WeisileLink desktop release artifacts."
    )
    subparsers = parser.add_subparsers(dest="target", required=True)

    macos = subparsers.add_parser("macos", help="Build a macOS app zip.")
    _add_common_args(macos)
    macos.add_argument(
        "--native-adapter",
        type=Path,
        help=(
            "Path to the built WeisileEV3BluetoothAdapter.app bundle, or "
            "to its Contents/MacOS/WeisileEV3BluetoothAdapter executable."
        ),
    )
    macos.set_defaults(builder=build_macos, command_parser=macos)

    windows = subparsers.add_parser("windows", help="Build a Windows zip.")
    _add_common_args(windows)
    windows.set_defaults(builder=build_windows, command_parser=windows)

    args = parser.parse_args(argv)
    return parser, args


def main(argv: list[str] | None = None) -> int:
    _, args = parse_args(argv or sys.argv[1:])
    try:
        _assert_unsigned_allowed(args, args.command_parser)
        result = args.builder(args)
    except subprocess.CalledProcessError as exc:
        print(f"Release artifact command failed: {exc}", file=sys.stderr)
        return 1
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
