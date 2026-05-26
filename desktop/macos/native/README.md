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

Required evidence before classroom readiness:

- Release artifact installed on a clean macOS machine.
- WeisileLink starts after reboot or login.
- `ws://127.0.0.1:20111/scratch/bt` accepts ScratchAI connections.
- Official-firmware EV3 Bluetooth smoke passes with a real EV3.
- `scripts/run_desktop_install_smoke.py` accepts the evidence JSON.
