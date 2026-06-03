# macOS Installation Files

Use this folder on a Mac teacher computer.

## SD Card

`01-sd-card/` contains the macOS Etcher installer:

```text
balenaEtcher-1.17.0.dmg
```

The EV3 image is shared with Windows:

```text
../shared/01-ev3-sd-card/ev3dev-stretch-ev3-generic-2020-04-10.zip
```

## WeisileLink Desktop

`02-weisilelink-desktop/` contains:

```text
WeisileLink-macos-0.1.0-internal-unsigned.zip
WeisileLink-macos-0.1.0-internal-manifest.json
install-macos.sh
uninstall-macos.sh
weisile-link.launchd.plist
build-native-adapter-macos.sh
```

The app zip is an unsigned internal testing artifact. It is valid for internal
testing only. It is not a production classroom release until it is signed,
notarized, installed on a clean Mac, and accepted by the desktop install smoke
gate.

## Evidence Template

`03-evidence-templates/macos-vsle-bluetooth-install-smoke.template.json` is the
macOS release-artifact smoke template for Full VSLE Bluetooth.
