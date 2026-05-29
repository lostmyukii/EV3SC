# macOS Release Preflight

Ready: no

## Checks

- tool:codesign: pass - /usr/bin/codesign
- tool:security: pass - /usr/bin/security
- tool:xcrun: pass - /usr/bin/xcrun
- tool:pkgbuild: pass - /usr/bin/pkgbuild
- tool:productbuild: pass - /usr/bin/productbuild
- executable_path: pass - /Users/yukii/Desktop/EV3SC/desktop/build/macos/WeisileLink
- native_adapter_path: pass - /Users/yukii/Desktop/EV3SC/desktop/build/macos/native/WeisileEV3BluetoothAdapter.app/Contents/MacOS/WeisileEV3BluetoothAdapter
- app_sign_identity: fail - app_sign_identity was not provided
- installer_sign_identity: fail - installer_sign_identity was not provided
- notary_keychain_profile: fail - notary_keychain_profile was not provided

## Release Commands

```bash
./.venv/bin/python desktop/scripts/build_release_artifacts.py macos --executable /Users/yukii/Desktop/EV3SC/desktop/build/macos/WeisileLink --native-adapter /Users/yukii/Desktop/EV3SC/desktop/build/macos/native/WeisileEV3BluetoothAdapter.app/Contents/MacOS/WeisileEV3BluetoothAdapter --output desktop/release/macos --version 0.1.0 --sign-identity "Developer ID Application: WeisileEDU"
```

```bash
./.venv/bin/python desktop/scripts/notarize_macos_release.py --manifest desktop/release/macos/WeisileLink-macos-0.1.0-manifest.json --keychain-profile VSLE_NOTARY
```

```bash
./.venv/bin/python desktop/scripts/build_macos_pkg.py --manifest desktop/release/macos/WeisileLink-macos-0.1.0-manifest.json --sign-identity "Developer ID Installer: WeisileEDU"
```
