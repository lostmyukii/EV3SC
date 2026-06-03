# Install Files Manifest

All paths are relative to `/Users/yukii/Desktop/EV3SC/install/`.

## Shared EV3 Files

| Install path | Source path | Purpose | SHA-256 |
|---|---|---|---|
| `shared/01-ev3-sd-card/ev3dev-stretch-ev3-generic-2020-04-10.zip` | `downloads/ev3dev/ev3dev-stretch-ev3-generic-2020-04-10.zip` | ev3dev EV3 SD card image | `f7f1e8c28b57a5b6af098f23868cb7c2210e90bf803ebfa23d8fb99c2c717e62` |
| `shared/02-ev3-server/websockets-7.0.tar.gz` | `downloads/python-packages/websockets-7.0.tar.gz` | offline Python dependency for ev3dev Stretch | `08e3c3e0535befa4f0c4443824496c03ecc25062debbcf895874f8a0b4c97c9f` |
| `shared/02-ev3-server/ev3-firmware` | `ev3-firmware/` | EV3 server, install scripts, systemd units, rollback scripts | Directory |

## macOS Files

| Install path | Source path | Purpose | SHA-256 |
|---|---|---|---|
| `mac/01-sd-card/balenaEtcher-1.17.0.dmg` | `downloads/tools/balenaEtcher-1.17.0.dmg` | macOS SD card flashing tool | `0c0abe8c552f98a70943ae7842e6aa2d22fb727fb2a44b260470763604d8889b` |
| `mac/02-weisilelink-desktop/WeisileLink-macos-0.1.0-internal-unsigned.zip` | `desktop/release/internal/macos/WeisileLink-macos-0.1.0-internal-unsigned.zip` | macOS internal test app bundle zip | `4b57e11860ba04c676ad2d7b345bae7abb20f4f43789fba7752896b4beb14a9a` |
| `mac/02-weisilelink-desktop/WeisileLink-macos-0.1.0-internal-manifest.json` | `desktop/release/internal/macos/WeisileLink-macos-0.1.0-internal-manifest.json` | macOS internal release manifest | `e055e4cf3fcebc3eac784d0e441e54bd39eff8af745a6a4d84998ee6d196faac` |
| `mac/02-weisilelink-desktop/install-macos.sh` | `desktop/macos/install.sh` | macOS helper install script | Script |
| `mac/02-weisilelink-desktop/uninstall-macos.sh` | `desktop/macos/uninstall.sh` | macOS helper uninstall script | Script |
| `mac/02-weisilelink-desktop/weisile-link.launchd.plist` | `desktop/macos/weisile-link.launchd.plist` | macOS LaunchAgent template | Template |
| `mac/02-weisilelink-desktop/build-native-adapter-macos.sh` | `desktop/macos/native/build.sh` | macOS native Bluetooth adapter build helper | Script |

## Windows Files

| Install path | Source path | Purpose | SHA-256 |
|---|---|---|---|
| `windows/01-sd-card/balenaEtcher-Setup-1.17.0.exe` | `downloads/tools/balenaEtcher-Setup-1.17.0.exe` | Windows SD card flashing tool | `63cff656853143d33128e66d9d2bd824d1f87c74256ed1c5e7927556bcf2b684` |
| `windows/02-weisilelink-desktop/windows-internal-release-evidence.zip` | `docs/desktop/evidence/windows-internal-release-evidence/windows-internal-release-evidence.zip` | Windows internal test release and evidence bundle | `1853a7de52b37c683247440afa8cf66d112fe19993bc5876f4a20f1528c75fb0` |
| `windows/02-weisilelink-desktop/windows-internal-release-download-receipt.json` | `docs/desktop/evidence/windows-internal-release-evidence/download-receipt.json` | Windows GitHub Actions artifact receipt | `79ef79d72578c9adcf6a6ed4377313fdf37482fbd83896465c3e485c88e91e22` |
| `windows/02-weisilelink-desktop/install-windows.ps1` | `desktop/windows/install.ps1` | Windows helper install script | Script |
| `windows/02-weisilelink-desktop/uninstall-windows.ps1` | `desktop/windows/uninstall.ps1` | Windows helper uninstall script | Script |
| `windows/02-weisilelink-desktop/build-release-windows.ps1` | `desktop/windows/build_release.ps1` | Windows build-host release handoff script | Script |
| `windows/02-weisilelink-desktop/weisile-link-service.xml` | `desktop/windows/weisile-link-service.xml` | Windows service metadata | Template |

## Evidence And Samples

| Install path | Source path | Purpose |
|---|---|---|
| `shared/03-evidence-templates/vsle_bluetooth_full_module_smoke.template.json` | `docs/classroom/vsle_bluetooth_full_module_smoke.template.json` | Full VSLE Bluetooth smoke template |
| `shared/03-evidence-templates/vsle_bluetooth_sensor_port_matrix.template.json` | `docs/classroom/vsle_bluetooth_sensor_port_matrix.template.json` | Sensor/motor port matrix template |
| `shared/03-evidence-templates/scratchai_teacher_block_rehearsal.template.json` | `docs/classroom/scratchai_teacher_block_rehearsal.template.json` | Browser block rehearsal template |
| `shared/03-evidence-templates/real_ev3_rehearsal_evidence.template.json` | `docs/classroom/real_ev3_rehearsal_evidence.template.json` | Real EV3 rehearsal template |
| `mac/03-evidence-templates/macos-vsle-bluetooth-install-smoke.template.json` | `docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.template.json` | macOS release-artifact smoke template |
| `windows/03-evidence-templates/windows-vsle-bluetooth-install-smoke.template.json` | `docs/desktop/evidence/windows-vsle-bluetooth-install-smoke.template.json` | Windows release-artifact smoke template |
| `shared/04-ai-quest-samples/ai-quest-samples` | `ai-quest-samples/` | AI Quest sample projects |

## Production Release Warning

The macOS and Windows desktop files here are valid for internal testing only.
They are not sufficient for external classroom distribution until the signed
release artifact, macOS notarization, Windows code signing, and clean-machine
smoke evidence gates pass.
