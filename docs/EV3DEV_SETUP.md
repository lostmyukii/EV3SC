# EV3 ev3dev setup and VSLE autostart

This guide prepares one LEGO MINDSTORMS EV3 brick for the VSLE Scratch-EV3
platform. It is based on the official ev3dev setup flow and the Debian systemd
service model:

- ev3dev Getting Started: https://www.ev3dev.org/docs/getting-started/
- ev3dev Downloads: https://www.ev3dev.org/downloads/
- Debian systemd service manual: https://manpages.debian.org/man/systemd.service

## 1. Prepare the SD card

Use a microSD or microSDHC card that works with EV3. The ev3dev guide requires
2GB or larger and warns that EV3 does not support microSDXC; cards larger than
32GB should not be used.

1. Download the EV3 image from https://www.ev3dev.org/downloads/.
2. Flash the image by following https://www.ev3dev.org/docs/getting-started/.
3. After flashing, open the `EV3DEV_BOOT` partition if you need to inspect the
   boot files, then eject the card cleanly.
4. Insert the card into the EV3. Attach the WiFi USB dongle before classroom
   testing.
5. Boot the EV3 and wait for Brickman to finish first-boot setup.

## 2. Connect to the EV3

Set up networking from Brickman following the ev3dev networking instructions.
For the classroom baseline, use WiFi.

```bash
ssh robot@ev3dev.local
# default password: maker
```

If mDNS does not resolve, find the brick IP in Brickman and use:

```bash
ssh robot@<EV3_IP_ADDRESS>
```

## 3. Copy the VSLE firmware package

Run this from the teacher/developer computer after `vsle_ev3_server.py` exists
inside `ev3-firmware/`.

```bash
scp -r ev3-firmware robot@ev3dev.local:~/vsle-ev3-firmware
ssh robot@ev3dev.local
cd ~/vsle-ev3-firmware
```

The installer intentionally fails if `vsle_ev3_server.py` is missing. That keeps
autostart from pointing at an absent server.

## 4. Install autostart

Run:

```bash
./scripts/install_ev3_autostart.sh
```

The installer does all of the following:

- backs up any existing `/home/robot/vsle_ev3_server.py`;
- backs up any existing `/etc/systemd/system/vsle-ev3-server.service`;
- creates `/home/robot/.config/vsle/ev3.env` with `chmod 600`;
- generates `WEISILE_PAIRING_TOKEN` locally on the EV3 if no env file exists;
- installs Python dependencies with `python3 -m pip install --user --upgrade websockets ev3dev2`;
- installs the systemd unit;
- runs `systemctl daemon-reload`;
- runs `systemctl enable --now vsle-ev3-server.service`.

For offline classroom imaging where dependencies are already present:

```bash
SKIP_PIP_INSTALL=1 ./scripts/install_ev3_autostart.sh
```

For USB-only bring-up on the official ev3dev Stretch EV3 image, the brick may
have Python 3.5.3 and no `pip` module. In that case, install a Python-3.5
compatible `websockets` package from the teacher computer before running the
installer with pip disabled. `websockets==7.0` supports Python 3.5 and is
compatible with the EV3 server fallback path:

```bash
# On the teacher computer
python -m pip download --no-binary=:all: --no-deps \
  -d downloads/python-packages websockets==7.0
scp downloads/python-packages/websockets-7.0.tar.gz \
  robot@ev3dev.local:~/vsle-ev3-firmware/

# On the EV3
cd ~/vsle-ev3-firmware
SITE="$(python3 -c 'import site; print(site.USER_SITE)')"
mkdir -p "$SITE"
tar -xzf websockets-7.0.tar.gz -C /tmp
cp -r /tmp/websockets-7.0/src/websockets "$SITE/websockets"
python3 -c 'import websockets; print(websockets.__version__)'
SKIP_PIP_INSTALL=1 ./scripts/install_ev3_autostart.sh
```

Do not commit the generated `WEISILE_PAIRING_TOKEN` or any copied `ev3.env`
file. Pairing tokens are per brick.

## 5. Verify

On the EV3:

```bash
systemctl status vsle-ev3-server
journalctl -u vsle-ev3-server -n 80 --no-pager
```

The systemd unit runs:

```bash
/usr/bin/python3 /home/robot/vsle_ev3_server.py
```

with default EV3 server port `8765`. The expected local env file is:

```bash
/home/robot/.config/vsle/ev3.env
```

## Full VSLE Bluetooth

Full VSLE Bluetooth requires ev3dev and `vsle_ev3_server.py`; it is not official firmware compatibility mode. Enable it only after the EV3 is paired and classroom safety is checked.

The systemd unit and installer keep Bluetooth disabled by default:

```bash
EV3_ENABLE_BLUETOOTH=0
EV3_BT_ADDRESS=
EV3_BT_RFCOMM_CHANNEL=1
```

To enable the EV3-side full VSLE Bluetooth RFCOMM listener during install, run
the installer with explicit environment variables. On real EV3 hardware, first
read the controller address and pass it as `VSLE_EV3_BT_ADDRESS`; binding to an
empty Bluetooth address can fail with `bad bluetooth address` on the stock
ev3dev Stretch image.

```bash
hciconfig -a | grep "BD Address"
VSLE_EV3_ENABLE_BLUETOOTH=1 \
  VSLE_EV3_BT_ADDRESS=<EV3_BLUETOOTH_ADDRESS> \
  VSLE_EV3_BT_RFCOMM_CHANNEL=1 \
  SKIP_PIP_INSTALL=1 \
  ./ev3-firmware/scripts/install.sh
```

If you are already inside the copied `~/vsle-ev3-firmware` directory on the
EV3, use the same variables with `./scripts/install.sh`, then explicitly
restart the service so the new env file is loaded by the running unit:

```bash
sudo systemctl restart vsle-ev3-server.service
systemctl status --no-pager vsle-ev3-server.service
```

If `bluetoothctl show` reports `Powered: no` and `hciconfig hci0 up` reports
`Operation not possible due to RF-kill`, unblock Bluetooth through sysfs and
then make the controller page-scan/inquiry-scan visible for pairing:

```bash
for f in /sys/class/rfkill/rfkill*/soft; do
  [ -e "$f" ] && echo 0 | sudo tee "$f"
done
sudo hciconfig hci0 up
sudo hciconfig hci0 piscan
printf 'show\nquit\n' | bluetoothctl
```

Expected controller evidence before pairing:

```text
UP RUNNING PSCAN ISCAN
Powered: yes
Discoverable: yes
Pairable: yes
```

The ScratchAI website must select `vsle-bluetooth` for full module coverage.
Official firmware compatibility remains `official-bluetooth` and does not
cover AI Quest, PID, 50Hz raw streaming, or full display behavior. The full
VSLE Bluetooth RFCOMM path uses Python stdlib Bluetooth sockets, not pybluez,
and reuses the same pairing token plus command/sensor JSON envelopes as WiFi.

## 6. Roll back

If a new install fails or a class needs to recover quickly:

```bash
cd ~/vsle-ev3-firmware
./scripts/rollback_ev3_autostart.sh
systemctl status vsle-ev3-server
```

The rollback script restores the newest backup from
`/home/robot/vsle-backups/`. If no previous service existed, it disables and
removes the service unit.

## 7. Shutdown

Use Brickman Power Off, or from SSH:

```bash
sudo poweroff
```

Avoid pulling power during SD card writes.
