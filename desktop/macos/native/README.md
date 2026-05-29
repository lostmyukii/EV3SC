# WeisileLink macOS Native Bluetooth Adapter

This directory owns the macOS native adapter boundary for official EV3 firmware
Bluetooth compatibility.

This adapter is the only supported path for official LEGO firmware Bluetooth on
this OS. Python stdlib RFCOMM is not supported here. Real EV3 smoke evidence is
required before this adapter can be marked classroom ready.

Implementation rules:

- Use Apple-supported Bluetooth Classic APIs or a verified Scratch Link-derived
  native adapter.
- Do not use Python stdlib `socket.AF_BLUETOOTH` on macOS.
- Do not add or depend on pybluez.
- Keep the adapter behind `NativeBluetoothAdapterProtocol` in WeisileLink core.
- Record real official-firmware EV3 evidence before enabling the mode in a
  classroom build.
- Keep pairing tokens and EV3 Bluetooth addresses out of committed evidence.

Current adapter slice:

- `WeisileEV3BluetoothAdapter.m` is packaged as a small background `.app`
  bundle using IOBluetooth. WeisileLink launches the app through
  LaunchServices and bridges newline-delimited JSON over a localhost socket so
  macOS can apply the bundle's Bluetooth usage description.
- `build.sh --check` verifies Objective-C syntax against the macOS SDK.
- `build.sh` writes:
  `desktop/build/macos/native/WeisileEV3BluetoothAdapter.app/Contents/MacOS/WeisileEV3BluetoothAdapter`.
- The adapter speaks newline-delimited JSON with Python:
  - `connect` with `address` opens RFCOMM channel `1`;
  - `send` writes a base64 EV3 Direct Command frame;
  - `recv` returns a base64 raw EV3 reply frame;
  - `close` closes the RFCOMM channel.
- The EV3 must already be paired in macOS Bluetooth settings.

Build:

```bash
desktop/macos/native/build.sh --check
desktop/macos/native/build.sh
```

Runtime selection is explicit and remains a compatibility mode:

```bash
WEISILE_TRANSPORT=official-bluetooth \
EV3_OFFICIAL_BT=00:16:53:12:34:56 \
WEISILE_OFFICIAL_BT_ADAPTER=desktop/build/macos/native/WeisileEV3BluetoothAdapter.app/Contents/MacOS/WeisileEV3BluetoothAdapter \
/Applications/WeisileLink.app/Contents/MacOS/WeisileLink
```

Required evidence before classroom readiness:

- Release artifact installed on a clean macOS machine.
- WeisileLink starts after reboot or login.
- `ws://127.0.0.1:20111/scratch/bt` accepts ScratchAI connections.
- Official-firmware EV3 Bluetooth smoke passes with a real EV3.
- `scripts/run_desktop_install_smoke.py` accepts the evidence JSON.
