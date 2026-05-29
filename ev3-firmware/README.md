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
./scripts/install.sh
```

## Rollback

```bash
ssh robot@ev3dev.local
cd ~/vsle-ev3-firmware
./scripts/rollback_ev3_autostart.sh
```

Full SD card and network preparation steps are in `docs/EV3DEV_SETUP.md`.

## Full VSLE Bluetooth

Full VSLE Bluetooth requires ev3dev and `vsle_ev3_server.py`; it is not official firmware compatibility mode. Enable it only after the EV3 is paired and classroom safety is checked.

WiFi remains the classroom default. The systemd unit and installer keep
Bluetooth disabled unless explicitly enabled:

```bash
EV3_ENABLE_BLUETOOTH=0
EV3_BT_ADDRESS=
EV3_BT_RFCOMM_CHANNEL=1
```

From a repo checkout, enable the EV3-side full VSLE Bluetooth RFCOMM listener
with the EV3 controller address:

```bash
hciconfig -a | grep "BD Address"
VSLE_EV3_ENABLE_BLUETOOTH=1 \
  VSLE_EV3_BT_ADDRESS=<EV3_BLUETOOTH_ADDRESS> \
  VSLE_EV3_BT_RFCOMM_CHANNEL=1 \
  SKIP_PIP_INSTALL=1 \
  ./ev3-firmware/scripts/install.sh
```

On the EV3 after copying the firmware directory, use the same environment
variables with `./scripts/install.sh`, then restart the service so the new env
file is loaded:

```bash
sudo systemctl restart vsle-ev3-server.service
```

If the controller is RF-killed, unblock it and make it visible before pairing:

```bash
for f in /sys/class/rfkill/rfkill*/soft; do
  [ -e "$f" ] && echo 0 | sudo tee "$f"
done
sudo hciconfig hci0 up
sudo hciconfig hci0 piscan
printf 'show\nquit\n' | bluetoothctl
```

The ScratchAI website must select `vsle-bluetooth` for full module coverage.
Official firmware compatibility remains `official-bluetooth` and does not
cover AI Quest, PID, 50Hz raw streaming, or full display behavior. Full VSLE
Bluetooth uses Python stdlib `socket.AF_BLUETOOTH` with RFCOMM and keeps the
same pairing token, JSON command envelopes, ack envelopes, sensor payloads, and
motor-stop-on-disconnect safety behavior as WiFi.
