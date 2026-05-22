# VSLE EV3 firmware package

This directory contains the files deployed to an EV3 brick running ev3dev.

## Files

- `systemd/vsle-ev3-server.service`: autostart unit for the EV3 WebSocket server.
- `scripts/install_ev3_autostart.sh`: installs `vsle_ev3_server.py`, creates a
  local pairing-token env file, installs Python dependencies, and enables the
  systemd service.
- `scripts/rollback_ev3_autostart.sh`: restores the newest backup created by
  the installer.
- `vsle_ev3_server.py`: WiFi WebSocket server plus optional Bluetooth Classic
  RFCOMM JSON-line fallback server.

The installer expects `ev3-firmware/vsle_ev3_server.py` to exist before it is
run on the brick. If the server file is absent, installation fails closed and
does not alter the running service.

## EV3 install

```bash
scp -r ev3-firmware robot@ev3dev.local:~/vsle-ev3-firmware
ssh robot@ev3dev.local
cd ~/vsle-ev3-firmware
./scripts/install_ev3_autostart.sh
```

## Rollback

```bash
ssh robot@ev3dev.local
cd ~/vsle-ev3-firmware
./scripts/rollback_ev3_autostart.sh
```

Full SD card and network preparation steps are in `docs/EV3DEV_SETUP.md`.

## Optional Bluetooth fallback

WiFi remains the classroom default. To enable the EV3-side Bluetooth Classic
fallback server on ev3dev, set this in `/home/robot/.config/vsle/ev3.env`:

```bash
EV3_ENABLE_BLUETOOTH=1
EV3_BT_RFCOMM_CHANNEL=1
```

Then restart:

```bash
sudo systemctl restart vsle-ev3-server
```

The fallback uses Python stdlib `socket.AF_BLUETOOTH` with RFCOMM and keeps the
same pairing token, JSON command envelopes, ack envelopes, sensor payloads, and
motor-stop-on-disconnect safety behavior as the WiFi server.
