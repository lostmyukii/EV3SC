# macOS Release Flow

Status: blocked-preflight
Preflight ready: no
Commands executed: 0

Blocked reason: macOS release preflight did not pass

## Preflight Blocking Checks

- app_sign_identity: app_sign_identity was not provided and no Developer ID Application: identity was found
- installer_sign_identity: installer_sign_identity was not provided and no Developer ID Installer: identity was found
- notary_keychain_profile: notary_keychain_profile was not provided

## Release Commands After Preflight Passes

```bash
./.venv/bin/python desktop/scripts/build_release_artifacts.py macos --executable /Users/yukii/Desktop/EV3SC/desktop/build/macos/WeisileLink --native-adapter /Users/yukii/Desktop/EV3SC/desktop/build/macos/native/WeisileEV3BluetoothAdapter.app/Contents/MacOS/WeisileEV3BluetoothAdapter --output desktop/release/macos --version 0.1.0 --sign-identity "Developer ID Application: WeisileEDU"
```

```bash
./.venv/bin/python desktop/scripts/notarize_macos_release.py --manifest desktop/release/macos/WeisileLink-macos-0.1.0-manifest.json --keychain-profile VSLE_NOTARY
```

```bash
./.venv/bin/python desktop/scripts/build_macos_pkg.py --manifest desktop/release/macos/WeisileLink-macos-0.1.0-manifest.json --sign-identity "Developer ID Installer: WeisileEDU"
```
