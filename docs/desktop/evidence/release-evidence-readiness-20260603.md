# Desktop Release Evidence Readiness

Recorded at: 2026-06-03T09:04:01Z

Release-artifact evidence ready: no

This report records the current macOS and Windows release-evidence blockers
after running the guarded preflight and release-flow commands. No signing,
notarization, packaging, or install-smoke command ran because both release
flows stopped at preflight.

## macOS

- Preflight ready: no
- Release flow status: blocked-preflight
- Commands executed: 0
- Blocking checks:
  - app_sign_identity
  - installer_sign_identity
  - notary_keychain_profile
- Reports:
  - `docs/desktop/evidence/macos-release-preflight.json`
  - `docs/desktop/evidence/macos-release-preflight.md`
  - `docs/desktop/evidence/macos-release-flow.json`
  - `docs/desktop/evidence/macos-release-flow.md`

The local self-contained WeisileLink executable and macOS native Bluetooth
adapter are present, but the Developer ID Application identity, Developer ID
Installer identity, and Apple notarytool keychain profile are not configured.

## Windows

- Preflight ready: no
- Release flow status: blocked-preflight
- Commands executed: 0
- Blocking checks:
  - tool:signtool
  - host_os_windows
  - executable_path
  - windows_sign_identity
  - timestamp_url
- Reports:
  - `docs/desktop/evidence/windows-release-preflight.json`
  - `docs/desktop/evidence/windows-release-preflight.md`
  - `docs/desktop/evidence/windows-release-flow.json`
  - `docs/desktop/evidence/windows-release-flow.md`

Windows release evidence must be collected on a Windows build host with
SignTool, `desktop/build/windows/WeisileLink.exe`, a Windows signing identity,
and a timestamp URL.

## Next Step

Provide macOS Developer ID Application and Installer identities plus a
notarytool profile, or move to a Windows build host with SignTool, a
self-contained `WeisileLink.exe`, a signing identity, and a timestamp URL.
Then rerun the guarded release flow before collecting clean-machine EV3
Bluetooth install smoke evidence.
