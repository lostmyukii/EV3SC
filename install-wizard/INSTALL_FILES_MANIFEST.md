# Installation Files Manifest

All paths are relative to `/Users/yukii/Desktop/EV3SC/install-wizard/`.
The `files/` entries are relative symlinks to EV3SC-owned local assets.

## SD Card Materials

| Wizard path | Source path | Purpose | SHA-256 |
|---|---|---|---|
| `files/01-sd-card/balenaEtcher-1.17.0.dmg` | `downloads/tools/balenaEtcher-1.17.0.dmg` | macOS SD card flashing tool | `0c0abe8c552f98a70943ae7842e6aa2d22fb727fb2a44b260470763604d8889b` |
| `files/01-sd-card/balenaEtcher-Setup-1.17.0.exe` | `downloads/tools/balenaEtcher-Setup-1.17.0.exe` | Windows SD card flashing tool | `63cff656853143d33128e66d9d2bd824d1f87c74256ed1c5e7927556bcf2b684` |
| `files/01-sd-card/ev3dev-stretch-ev3-generic-2020-04-10.zip` | `downloads/ev3dev/ev3dev-stretch-ev3-generic-2020-04-10.zip` | ev3dev EV3 SD card image | `f7f1e8c28b57a5b6af098f23868cb7c2210e90bf803ebfa23d8fb99c2c717e62` |

## EV3-Side Server Materials

| Wizard path | Source path | Purpose | SHA-256 |
|---|---|---|---|
| `files/02-ev3-server/ev3-firmware` | `ev3-firmware/` | EV3 server, install scripts, systemd units, rollback scripts | Directory |
| `files/02-ev3-server/websockets-7.0.tar.gz` | `downloads/python-packages/websockets-7.0.tar.gz` | Python 3.5-compatible offline `websockets` dependency for ev3dev Stretch | `08e3c3e0535befa4f0c4443824496c03ecc25062debbcf895874f8a0b4c97c9f` |

## WeisileLink Desktop Materials

| Wizard path | Source path | Purpose | Status |
|---|---|---|---|
| `files/03-weisilelink-desktop/macos/WeisileLink-macos-0.1.0-internal-unsigned.zip` | `desktop/release/internal/macos/WeisileLink-macos-0.1.0-internal-unsigned.zip` | macOS internal test app bundle zip | Unsigned internal testing only |
| `files/03-weisilelink-desktop/macos/WeisileLink-macos-0.1.0-internal-manifest.json` | `desktop/release/internal/macos/WeisileLink-macos-0.1.0-internal-manifest.json` | macOS internal release manifest | Unsigned internal testing only |
| `files/03-weisilelink-desktop/macos/install-macos.sh` | `desktop/macos/install.sh` | macOS install script used inside/referenced by release package | Internal/developer support |
| `files/03-weisilelink-desktop/macos/uninstall-macos.sh` | `desktop/macos/uninstall.sh` | macOS uninstall script | Internal/developer support |
| `files/03-weisilelink-desktop/windows/install-windows.ps1` | `desktop/windows/install.ps1` | Windows install script | Script only; no Windows release zip present |
| `files/03-weisilelink-desktop/windows/uninstall-windows.ps1` | `desktop/windows/uninstall.ps1` | Windows uninstall script | Script only; no Windows release zip present |
| `files/03-weisilelink-desktop/windows/build-release-windows.ps1` | `desktop/windows/build_release.ps1` | Windows release handoff script for Windows build host | Build host required |

macOS internal zip SHA-256:

```text
4b57e11860ba04c676ad2d7b345bae7abb20f4f43789fba7752896b4beb14a9a  files/03-weisilelink-desktop/macos/WeisileLink-macos-0.1.0-internal-unsigned.zip
e055e4cf3fcebc3eac784d0e441e54bd39eff8af745a6a4d84998ee6d196faac  files/03-weisilelink-desktop/macos/WeisileLink-macos-0.1.0-internal-manifest.json
```

## Evidence Templates

| Wizard path | Source path | Purpose |
|---|---|---|
| `files/04-evidence-templates/vsle_bluetooth_full_module_smoke.template.json` | `docs/classroom/vsle_bluetooth_full_module_smoke.template.json` | Full VSLE Bluetooth command-group evidence template |
| `files/04-evidence-templates/vsle_bluetooth_sensor_port_matrix.template.json` | `docs/classroom/vsle_bluetooth_sensor_port_matrix.template.json` | Real sensor/motor port coverage evidence template |
| `files/04-evidence-templates/macos-vsle-bluetooth-install-smoke.template.json` | `docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.template.json` | macOS release-artifact install smoke template |
| `files/04-evidence-templates/windows-vsle-bluetooth-install-smoke.template.json` | `docs/desktop/evidence/windows-vsle-bluetooth-install-smoke.template.json` | Windows release-artifact install smoke template |
| `files/04-evidence-templates/scratchai_teacher_block_rehearsal.template.json` | `docs/classroom/scratchai_teacher_block_rehearsal.template.json` | Browser teacher block rehearsal template |
| `files/04-evidence-templates/real_ev3_rehearsal_evidence.template.json` | `docs/classroom/real_ev3_rehearsal_evidence.template.json` | Real EV3 rehearsal evidence template |

## AI Quest Samples

| Wizard path | Source path | Purpose |
|---|---|---|
| `files/05-ai-quest-samples/ai-quest-samples` | `ai-quest-samples/` | Example AI Quest project JSON and sample test assets |

## Release Warnings

- Do not mark the desktop installer classroom ready from this folder alone.
- The macOS zip is unsigned and is for internal testing only.
- The Windows release artifact is not present in this repository snapshot.
- Production classroom distribution still requires signed artifacts, notarization on macOS, Windows code signing, and clean-machine evidence accepted by `scripts/run_desktop_install_smoke.py`.
