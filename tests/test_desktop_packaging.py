from pathlib import Path
import plistlib
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]


def test_desktop_docs_exist_and_name_both_modes():
    required = [
        ROOT / "docs/desktop/WEISILELINK_DESKTOP.md",
        ROOT / "docs/desktop/MACOS_INSTALL.md",
        ROOT / "docs/desktop/WINDOWS_INSTALL.md",
        ROOT / "docs/desktop/OFFICIAL_EV3_BLUETOOTH_COMPATIBILITY.md",
        ROOT / "docs/desktop/DIAGNOSTICS.md",
    ]
    for path in required:
        assert path.is_file(), path
        text = path.read_text(encoding="utf-8")
        assert "Full VSLE mode" in text
        assert "Official firmware Bluetooth compatibility mode" in text


def test_macos_launch_agent_uses_localhost_and_bundled_binary():
    plist_path = ROOT / "desktop/macos/weisile-link.launchd.plist"
    with plist_path.open("rb") as handle:
        data = plistlib.load(handle)
    assert data["Label"] == "cn.vsle.weisile-link"
    args = data["ProgramArguments"]
    assert any("WeisileLink" in item for item in args)
    env = data["EnvironmentVariables"]
    assert env["WEISILE_LINK_HOST"] == "127.0.0.1"
    assert env["WEISILE_LINK_PORT"] == "20111"
    assert data["RunAtLoad"] is True
    assert data["KeepAlive"] is True


def test_macos_install_script_writes_absolute_log_paths():
    plist_path = ROOT / "desktop/macos/weisile-link.launchd.plist"
    with plist_path.open("rb") as handle:
        data = plistlib.load(handle)
    assert data["StandardOutPath"].startswith("__WEISILE_LOG_DIR__/")
    assert data["StandardErrorPath"].startswith("__WEISILE_LOG_DIR__/")
    assert "~" not in data["StandardOutPath"]
    assert "~" not in data["StandardErrorPath"]

    install_text = (ROOT / "desktop/macos/install.sh").read_text(encoding="utf-8")
    assert "__WEISILE_LOG_DIR__" in install_text
    assert "LOG_DIR" in install_text
    assert ">" in install_text


def test_windows_install_scripts_keep_localhost_defaults():
    install_text = (ROOT / "desktop/windows/install.ps1").read_text(encoding="utf-8")
    service_text = (ROOT / "desktop/windows/weisile-link-service.xml").read_text(
        encoding="utf-8"
    )
    assert "127.0.0.1" in install_text
    assert "20111" in install_text
    assert "8766" in install_text
    assert "WeisileLink" in service_text
    assert "WEISILE_LINK_HOST=127.0.0.1" in service_text


def test_desktop_asset_validator_passes():
    result = subprocess.run(
        [sys.executable, "desktop/scripts/validate_desktop_assets.py"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr + result.stdout
