# Install Asset Audit

Audit date: 2026-06-03

Scope audited:

- `downloads/`
- `desktop/`
- `docs/desktop/`
- `docs/classroom/`
- `ev3-firmware/`
- `ai-quest-samples/`
- previous `install-wizard/`

Ignored as non-install or transient material:

- `.git/`, `.venv/`, `.tmp/`, `.runtime/`, `.preview-run/`, `.repair/`
- `scratch-ai-platform/**/node_modules/`
- PyInstaller work caches under `desktop/build/pyinstaller-work/`
- Chrome/browser cache folders

## Accepted Install Assets

### Shared EV3 Assets

| Asset | Source | Install location | Audit result |
|---|---|---|---|
| ev3dev EV3 SD image zip | `downloads/ev3dev/ev3dev-stretch-ev3-generic-2020-04-10.zip` | `install/shared/01-ev3-sd-card/` | SHA-256 matched and `unzip -tq` passed |
| EV3 firmware package | `ev3-firmware/` | `install/shared/02-ev3-server/` | Required server, scripts, and systemd units present |
| offline `websockets==7.0` tarball | `downloads/python-packages/websockets-7.0.tar.gz` | `install/shared/02-ev3-server/` | SHA-256 matched and `tar -tzf` passed |
| evidence templates | `docs/classroom/*.template.json` | `install/shared/03-evidence-templates/` | JSON files present |
| AI Quest samples | `ai-quest-samples/` | `install/shared/04-ai-quest-samples/` | Sample project JSON present |

### macOS Assets

| Asset | Source | Install location | Audit result |
|---|---|---|---|
| Balena Etcher macOS DMG | `downloads/tools/balenaEtcher-1.17.0.dmg` | `install/mac/01-sd-card/` | SHA-256 matched and `hdiutil verify` passed on macOS |
| WeisileLink macOS internal unsigned zip | `desktop/release/internal/macos/WeisileLink-macos-0.1.0-internal-unsigned.zip` | `install/mac/02-weisilelink-desktop/` | SHA-256 matched and `unzip -tq` passed |
| WeisileLink macOS internal manifest | `desktop/release/internal/macos/WeisileLink-macos-0.1.0-internal-manifest.json` | `install/mac/02-weisilelink-desktop/` | SHA-256 matched and JSON parse passed |
| macOS install/uninstall scripts | `desktop/macos/*.sh` | `install/mac/02-weisilelink-desktop/` | Present |
| macOS LaunchAgent template | `desktop/macos/weisile-link.launchd.plist` | `install/mac/02-weisilelink-desktop/` | Present |
| macOS native adapter build script | `desktop/macos/native/build.sh` | `install/mac/02-weisilelink-desktop/` | Present |
| macOS install evidence template | `docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.template.json` | `install/mac/03-evidence-templates/` | Present |

### Windows Assets

| Asset | Source | Install location | Audit result |
|---|---|---|---|
| Balena Etcher Windows installer | `downloads/tools/balenaEtcher-Setup-1.17.0.exe` | `install/windows/01-sd-card/` | SHA-256 matched and `file` identifies NSIS Windows executable |
| Windows internal release evidence zip | `docs/desktop/evidence/windows-internal-release-evidence/windows-internal-release-evidence.zip` | `install/windows/02-weisilelink-desktop/` | SHA-256 matched and `unzip -tq` passed |
| Windows internal release receipt | `docs/desktop/evidence/windows-internal-release-evidence/download-receipt.json` | `install/windows/02-weisilelink-desktop/` | SHA-256 matched and JSON parse passed |
| Windows install/uninstall scripts | `desktop/windows/*.ps1` | `install/windows/02-weisilelink-desktop/` | Present |
| Windows release build handoff | `desktop/windows/build_release.ps1` | `install/windows/02-weisilelink-desktop/` | Present |
| Windows service metadata | `desktop/windows/weisile-link-service.xml` | `install/windows/02-weisilelink-desktop/` | Present |
| Windows install evidence template | `docs/desktop/evidence/windows-vsle-bluetooth-install-smoke.template.json` | `install/windows/03-evidence-templates/` | Present |
| Windows setup wizard Phase A shell | `install/windows/setup-wizard.ps1`, `install/windows/setup-wizard.xaml`, `install/windows/lib/SetupWizard.psm1` | `install/windows/` | Static tests pass; no install actions |
| Windows setup wizard Phase B validator | `install/windows/lib/InstallFileChecks.psm1` | `install/windows/lib/` | Hash, zip-entry, JSON, XML, and required-path tests pass; no install actions |

The Windows internal evidence zip contains `WeisileLink.exe`,
`WeisileLink-windows-0.1.0-internal-unsigned.zip`, a manifest, install helpers,
and evidence reports. It is unsigned internal test evidence only.

## Large File Handling

The following local install assets are too large or risky to duplicate into git
history as normal tracked files:

| File | Size | Handling |
|---|---:|---|
| `downloads/ev3dev/ev3dev-stretch-ev3-generic-2020-04-10.zip` | 372,632,918 bytes | Linked from `install/shared/01-ev3-sd-card/` |
| `downloads/tools/balenaEtcher-Setup-1.17.0.exe` | 154,092,584 bytes | Linked from `install/windows/01-sd-card/` |
| `downloads/tools/balenaEtcher-1.17.0.dmg` | 98,738,449 bytes | Linked from `install/mac/01-sd-card/` |

Use `install/make_usb_copy.sh` to expand the links into a portable USB folder
when distributing the local installation materials.

## Release Readiness Verdict

- macOS: internal testing package is locally valid, but unsigned. It is not a
  production classroom release artifact.
- Windows: internal testing evidence zip is locally valid and contains an
  unsigned internal Windows release bundle. It is not a production classroom
  release artifact.
- Full VSLE Bluetooth: remains the primary no-WiFi classroom path, but release
  artifact evidence, signing, notarization, Windows signing, and clean-machine
  smoke gates remain separate requirements before external distribution.
