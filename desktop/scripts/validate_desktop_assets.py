#!/usr/bin/env python3
from pathlib import Path
import plistlib
import sys


ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    required = [
        "docs/desktop/WEISILELINK_DESKTOP.md",
        "docs/desktop/MACOS_INSTALL.md",
        "docs/desktop/WINDOWS_INSTALL.md",
        "docs/desktop/OFFICIAL_EV3_BLUETOOTH_COMPATIBILITY.md",
        "docs/desktop/DIAGNOSTICS.md",
        "desktop/macos/weisile-link.launchd.plist",
        "desktop/macos/install.sh",
        "desktop/macos/uninstall.sh",
        "desktop/windows/weisile-link-service.xml",
        "desktop/windows/install.ps1",
        "desktop/windows/uninstall.ps1",
    ]
    missing = [path for path in required if not (ROOT / path).is_file()]
    if missing:
        print("Missing desktop assets: " + ", ".join(missing), file=sys.stderr)
        return 1

    with (ROOT / "desktop/macos/weisile-link.launchd.plist").open("rb") as handle:
        plist = plistlib.load(handle)
    env = plist.get("EnvironmentVariables", {})
    if env.get("WEISILE_LINK_HOST") != "127.0.0.1":
        print("macOS LaunchAgent must bind localhost by default", file=sys.stderr)
        return 1
    for key in ("StandardOutPath", "StandardErrorPath"):
        value = plist.get(key, "")
        if "~" in value or not value.startswith("__WEISILE_LOG_DIR__/"):
            print(
                "macOS LaunchAgent log paths must use install-time absolute "
                f"path placeholders: {key}",
                file=sys.stderr,
            )
            return 1

    windows_text = (ROOT / "desktop/windows/install.ps1").read_text(encoding="utf-8")
    if "0.0.0.0" in windows_text:
        print("Windows default install must not bind LAN", file=sys.stderr)
        return 1

    print("desktop assets ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
