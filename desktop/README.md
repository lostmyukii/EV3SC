# WeisileLink Desktop Assets

This directory contains the checked-in desktop distribution assets for
WeisileLink macOS and Windows packages.

The files in this directory are release scaffolding and validation inputs. They
do not by themselves produce a signed classroom package. A classroom release is
complete only after a bundled runtime or self-contained executable is built,
signed, installed on clean machines, verified after reboot/login, and tested
through diagnostics export and uninstall.

## Modes

- Full VSLE mode: EV3 boots ev3dev and runs `vsle_ev3_server.py`.
- Official firmware Bluetooth compatibility mode: EV3 keeps official LEGO
  firmware and connects over Bluetooth Classic for the supported Basic Pack.

## Defaults

- Bind WeisileLink to `127.0.0.1`.
- Expose Scratch Link compatible JSON-RPC on port `20111`.
- Expose Trainer WebSocket routes on port `8766`.
- Use `wifi` as the default transport.
- Do not open LAN firewall rules from default installer scripts.

## Validation

Run:

```bash
./.venv/bin/python -m pytest tests/test_desktop_packaging.py -v
desktop/scripts/validate_desktop_assets.py
```
