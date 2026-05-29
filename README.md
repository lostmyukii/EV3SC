# EV3SC VSLE Scratch-EV3 Platform

This repository contains the standalone EV3SC implementation for the VSLE
Scratch-EV3 classroom platform.

Detailed project rules live in `AGENTS.md`. The full platform specification and
progress log live in `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`.

## EV3 ev3dev SD Card Install Teaching Guide

This section is written as a step-by-step teaching script. Each confirmed step
will be added here as the install flow is walked through.

The Full VSLE Bluetooth path requires an EV3 running ev3dev and the EV3SC
`vsle_ev3_server.py`. Official LEGO firmware Bluetooth remains a separate,
limited compatibility mode and does not provide full VSLE module coverage.

Reference docs:

- `docs/EV3DEV_SETUP.md`
- `ev3-firmware/README.md`
- `docs/classroom/REAL_EV3_SMOKE_HANDOFF.md`

### Phase 0: Prepare The Materials

Prepare these before flashing anything:

1. One LEGO MINDSTORMS EV3 brick.
2. One microSD or microSDHC card.
   - Recommended: 8GB or 16GB.
   - Do not use microSDXC cards.
   - Avoid cards larger than 32GB for EV3.
3. A card reader for the teacher computer.
4. A teacher computer with internet access.
5. A USB cable for the first EV3 bring-up, or a known-working EV3 WiFi dongle.
6. A charged EV3 battery.

Stop here if the SD card is missing. Get a known-good 8GB or 16GB microSDHC
card first.

### Phase 1: Download The Flashing Tool And ev3dev Image

On the teacher computer:

1. Use the local download cache in this repository folder first:
   `/Users/yukii/Desktop/EV3SC/downloads/`
2. For this EV3 classroom flow, use Balena Etcher `v1.17.0`. The ev3dev
   Getting Started guide links this Etcher version for the current EV3 image,
   so do not switch teachers to the newest Etcher release unless it has been
   tested with this exact image.
3. Mac teachers use:
   `/Users/yukii/Desktop/EV3SC/downloads/tools/balenaEtcher-1.17.0.dmg`
4. Windows teachers use:
   `/Users/yukii/Desktop/EV3SC/downloads/tools/balenaEtcher-Setup-1.17.0.exe`
5. The EV3 image is already downloaded at:
   `/Users/yukii/Desktop/EV3SC/downloads/ev3dev/ev3dev-stretch-ev3-generic-2020-04-10.zip`
6. Do not choose images for Raspberry Pi, BeagleBone, BrickPi, or other boards.
   The filename must include `ev3`, as the file above does.
7. If a teacher computer does not have internet access, copy the matching
   Etcher installer and the EV3 image from this `downloads/` folder to a USB
   drive.

Official source links used for this cache:

- Balena Etcher v1.17.0:
  `https://github.com/balena-io/etcher/releases/tag/v1.17.0`
- ev3dev stretch R3 EV3 image:
  `https://github.com/ev3dev/ev3dev/releases/tag/ev3dev-stretch-2020-04-10`
- ev3dev Getting Started guide:
  `https://www.ev3dev.org/docs/getting-started/`

Local cache verification recorded on 2026-05-28:

```text
f7f1e8c28b57a5b6af098f23868cb7c2210e90bf803ebfa23d8fb99c2c717e62  downloads/ev3dev/ev3dev-stretch-ev3-generic-2020-04-10.zip
0c0abe8c552f98a70943ae7842e6aa2d22fb727fb2a44b260470763604d8889b  downloads/tools/balenaEtcher-1.17.0.dmg
63cff656853143d33128e66d9d2bd824d1f87c74256ed1c5e7927556bcf2b684  downloads/tools/balenaEtcher-Setup-1.17.0.exe
```

The EV3 image zip passed `unzip -tq`, the Mac DMG passed `hdiutil verify`, and
the Windows installer was identified as a Windows NSIS executable.

Before moving to Phase 2, record:

- SD card capacity and type, for example `16GB microSDHC`.
- Teacher computer OS, for example `macOS`.
- Downloaded ev3dev image filename:
  `ev3dev-stretch-ev3-generic-2020-04-10.zip`.

### Phase 2: Flash The SD Card

For normal classroom teaching, use Etcher:

1. Insert the microSD card into the teacher computer.
2. Open Balena Etcher.
3. Choose `Flash from file`.
4. Select:
   `/Users/yukii/Desktop/EV3SC/downloads/ev3dev/ev3dev-stretch-ev3-generic-2020-04-10.zip`
5. Choose the SD card as the target.
6. Check the target carefully. It should be the external microSD card, not the
   internal computer disk.
7. Click `Flash`.
8. Wait until Etcher finishes writing and validating.
9. Eject the SD card cleanly.

Confirmed Mac-assisted flash on 2026-05-28:

1. The inserted SD card was identified as `/dev/disk4`.
2. It was an external removable USB device, size `15.8 GB`.
3. The image written was:
   `/Users/yukii/Desktop/EV3SC/downloads/ev3dev/ev3dev-stretch-ev3-generic-2020-04-10/ev3dev-stretch-ev3-generic-2020-04-10.img`
4. The write completed with `450+0 records in`, `450+0 records out`, and
   `1887436800 bytes transferred`.
5. After writing, macOS showed the expected partition layout:
   `EV3DEV_BOOT` at `50.3 MB` and a `Linux` partition at `1.8 GB`.
6. The Linux partition read-back hash matched the image Linux partition hash:
   `55421ac90cd1d5ee7f8bb723e5b71687be33d80ded3780edb59b3b1f8b8a17ae`.
7. The SD card was ejected with `diskutil eject /dev/disk4`.

Important safety rule for command-line flashing:

- Never reuse `/dev/disk4` blindly on another computer. Always run
  `diskutil list`, identify the external removable SD card by size and
  location, and ask a second person to confirm before writing.

### Phase 3: First EV3 Boot From The SD Card

1. Remove the safely ejected microSD card from the teacher computer.
2. Insert it into the EV3 SD card slot.
3. Make sure the EV3 battery is charged.
4. Press the EV3 power button.
5. Confirm that the EV3 screen shows the ev3dev startup screen.
6. For the first boot, wait patiently. It can take several minutes longer than
   later boots because ev3dev performs first-boot initialization such as SSH
   host identity setup and filesystem housekeeping.
7. Do not remove the SD card or disconnect power while the EV3 is loading.
8. If the same screen shows no change for more than 15 minutes, record the
   screen text/photo, power the EV3 off, re-seat the SD card, and try one more
   boot. If it still stalls, reflash the SD card before continuing.

Confirmed first boot on 2026-05-28:

- The EV3 screen showed the ev3dev startup screen after booting from the
  flashed SD card.
- First-boot loading was treated as normal while the EV3 continued startup.

Troubleshooting record from 2026-05-28:

- Symptom: after a long first boot, the EV3 was power-cycled and then stopped at
  the EV3 `Starting` screen. Removing the SD card allowed the EV3 to boot into
  the original LEGO firmware normally.
- Evidence: when the SD card was returned to the Mac, `EV3DEV_BOOT` was present
  and readable, and the Linux partition had expanded from the original `1.8 GB`
  image partition to the full `15.8 GB` card size.
- Interpretation: the EV3 had started booting ev3dev and reached first-boot
  partition expansion, but first-boot initialization was likely interrupted.
- Classroom action: reflash the SD card and boot again. During the next first
  boot, wait for the ev3dev/Brickman main interface and do not power-cycle the
  EV3 while it is still on `Starting` unless there has been no screen change for
  more than 15 minutes.
- Reflash result: `/dev/disk4` was reflashed, the partition layout returned to
  `EV3DEV_BOOT` at `50.3 MB` plus `Linux` at `1.8 GB`, the Linux partition
  read-back hash again matched
  `55421ac90cd1d5ee7f8bb723e5b71687be33d80ded3780edb59b3b1f8b8a17ae`, and
  the SD card was ejected cleanly.
- Final result on 2026-05-29: after rebooting the EV3 again, loading finished
  and the EV3 entered the ev3dev page. Treat this as the confirmed successful
  end state for Phase 3 before moving to network setup.

References:

- ev3dev Getting Started:
  `https://www.ev3dev.org/docs/getting-started/`
- ev3dev legacy first-boot note:
  `https://github.com/dlech/ev3dev/wiki/Getting-started-v2`

### Phase 4: First Login And Network Setup

Start with Wi-Fi if a compatible EV3 Wi-Fi dongle is available:

1. On the EV3, open `Wireless and Networks`.
2. Open `Wi-Fi`.
3. If it shows `Not Available`, the EV3 has not detected a compatible Wi-Fi
   adapter. This is expected when no supported USB Wi-Fi dongle is plugged into
   the EV3 USB-A host port.
4. If Wi-Fi is available, enable `Powered`, select the classroom network, enter
   the password, and record the EV3 IP address.

If Wi-Fi is not available, use USB for first login:

1. Keep the EV3 on the ev3dev/Brickman page.
2. Connect the EV3 mini USB port to the Mac.
3. On the Mac, check that the `EV3+ev3dev` network service appears.
4. If `ev3dev.local` does not resolve, use the IPv6 link-local address shown by
   Bonjour or Brickman. Include the Mac interface suffix, for example `%en10`.
5. Log in with SSH:

```bash
ssh -6 robot@fe80::16:53ff:fe4f:4655%en10
```

Default login:

```text
username: robot
password: maker
```

Confirmed USB login on 2026-05-29:

- The EV3 appeared on macOS as network service `EV3+ev3dev`.
- The Mac interface was `en10`.
- `ev3dev.local` did not resolve to IPv4 on this Mac, but Bonjour returned
  `fe80::16:53ff:fe4f:4655%en10`.
- SSH port 22 was reachable on that IPv6 link-local address.
- SSH login with `robot` / `maker` succeeded.
- EV3 read-only checks reported:
  - hostname: `ev3dev`
  - kernel: `4.14.117-ev3dev-2.3.5-ev3`
  - USB interface: `usb0` with `fe80::16:53ff:fe4f:4655/64`
  - root filesystem: `/dev/mmcblk0p2`, `1.7G`, `59%` used

References:

- ev3dev Networking:
  `https://www.ev3dev.org/docs/networking/`
- ev3dev SSH:
  `https://www.ev3dev.org/docs/tutorials/connecting-to-ev3dev-with-ssh`

### Phase 5: Install The EV3-Side VSLE Server

Keep the EV3 on stable power before installing services. During this confirmed
install, the EV3 warned `Low battery. Power off or connect a charger soon.`, so
the safe classroom rule is: stop, connect a charger or replace batteries, and
only continue after the power is stable.

On the teacher Mac, confirm the USB SSH path is still available:

```bash
networksetup -listallhardwareports
nc -6 -G 5 -vz 'fe80::16:53ff:fe4f:4655%en10' 22
```

Copy the EV3 firmware package and the Python 3.5-compatible `websockets`
offline package to the brick:

```bash
ssh -6 robot@fe80::16:53ff:fe4f:4655%en10
# password: maker
rm -rf ~/vsle-ev3-firmware
mkdir -p ~/vsle-ev3-firmware
exit

scp -6 -r \
  ev3-firmware/README.md \
  ev3-firmware/vsle_ev3_server.py \
  ev3-firmware/scripts \
  ev3-firmware/systemd \
  downloads/python-packages/websockets-7.0.tar.gz \
  'robot@[fe80::16:53ff:fe4f:4655%en10]:~/vsle-ev3-firmware/'
```

On the EV3, check the built-in dependency state:

```bash
ssh -6 robot@fe80::16:53ff:fe4f:4655%en10
cd ~/vsle-ev3-firmware
python3 --version
python3 -m pip --version || true
python3 - <<'PY'
import sys, site
print('python=' + sys.version.split()[0])
print('user_site=' + site.USER_SITE)
for name in ('ev3dev2', 'websockets'):
    try:
        mod = __import__(name)
        print('%s ok version=%s file=%s' % (
            name,
            getattr(mod, '__version__', 'unknown'),
            getattr(mod, '__file__', 'unknown'),
        ))
    except Exception as exc:
        print('%s missing %s: %s' % (name, type(exc).__name__, exc))
PY
```

Confirmed dependency state on 2026-05-29:

- `python3 --version`: `Python 3.5.3`
- `python3 -m pip --version`: no `pip` module
- `ev3dev2`: installed, version `2.1.0`
- `websockets`: initially missing

Because the stock ev3dev Stretch image has no pip module, install
`websockets==7.0` from the local offline cache:

```bash
SITE="$(python3 -c 'import site; print(site.USER_SITE)')"
mkdir -p "$SITE"
rm -rf /tmp/websockets-7.0
tar -xzf websockets-7.0.tar.gz -C /tmp
rm -rf "$SITE/websockets"
cp -r /tmp/websockets-7.0/src/websockets "$SITE/websockets"
python3 -c 'import websockets; print(websockets.__version__)'
```

Confirmed result:

```text
websockets=7.0
```

Before enabling autostart, compile the server and recheck imports:

```bash
python3 -m py_compile vsle_ev3_server.py
python3 - <<'PY'
import ev3dev2, websockets
print('ev3dev2=' + ev3dev2.__version__)
print('websockets=' + websockets.__version__)
PY
```

Confirmed result:

```text
ev3dev2=2.1.0
websockets=7.0
```

Install the VSLE server as a systemd service, skipping pip because dependencies
were checked manually:

```bash
SKIP_PIP_INSTALL=1 ./scripts/install.sh
```

Confirmed install result on 2026-05-29:

- service: `vsle-ev3-server.service`
- server file: `/home/robot/vsle_ev3_server.py`
- backup directory: `/home/robot/vsle-backups/20200410T190052Z`
- `systemctl is-enabled vsle-ev3-server.service`: `enabled`
- `systemctl is-active vsle-ev3-server.service`: `active`
- listener: `0.0.0.0:8765`
- env file: `/home/robot/.config/vsle/ev3.env`
- `WEISILE_PAIRING_TOKEN` exists but must remain redacted and uncommitted
- `EV3_ENABLE_BLUETOOTH=0` by default

Run a local EV3-side WebSocket smoke check without printing the pairing token:

```bash
python3 - <<'PY'
import asyncio
import json
import websockets

env = {}
with open('/home/robot/.config/vsle/ev3.env') as fh:
    for line in fh:
        line = line.strip()
        if not line or '=' not in line:
            continue
        key, value = line.split('=', 1)
        env[key] = value

async def main():
    ws = await websockets.connect('ws://127.0.0.1:8765')
    try:
        await ws.send(json.dumps({
            'id': 1,
            'method': 'auth.pair',
            'params': {'token': env.get('WEISILE_PAIRING_TOKEN', '')},
        }))
        ack = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
        print('auth_ack_ok={0} id={1}'.format(ack.get('ok'), ack.get('id')))
        for _ in range(10):
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            if msg.get('type') == 'sensor_update':
                print('sensor_update_ok=True')
                print('sensor_keys=' + ','.join(sorted(msg.get('sensors', {}).keys())))
                print('motor_keys=' + ','.join(sorted(msg.get('motors', {}).keys())))
                print('battery_pct=' + str(msg.get('system', {}).get('battery_pct')))
                return
        print('sensor_update_ok=False')
    finally:
        await ws.close()

asyncio.get_event_loop().run_until_complete(main())
PY
```

Confirmed smoke result:

```text
auth_ack_ok=True id=1
sensor_update_ok=True
sensor_keys=
motor_keys=
battery_pct=0
```

The empty sensor and motor key lists are acceptable for this bring-up because no
external EV3 sensors or motors were confirmed as attached during the install.

### Phase 6: Enable EV3-Side Full VSLE Bluetooth

Keep USB SSH connected while enabling Bluetooth. USB remains the recovery path
if Bluetooth pairing fails.

On the EV3, read the Bluetooth controller address:

```bash
hciconfig -a | grep "BD Address"
```

Confirmed EV3 controller address on 2026-05-29:

```text
A0:E6:F8:19:58:3C
```

On this real EV3, an RFCOMM precheck with an empty bind address failed:

```text
rfcomm_channel_1_prebind_error=bad bluetooth address
```

Use the controller address when enabling full VSLE Bluetooth:

```bash
cd ~/vsle-ev3-firmware
VSLE_EV3_ENABLE_BLUETOOTH=1 \
  VSLE_EV3_BT_ADDRESS=A0:E6:F8:19:58:3C \
  VSLE_EV3_BT_RFCOMM_CHANNEL=1 \
  SKIP_PIP_INSTALL=1 \
  ./scripts/install.sh
sudo systemctl restart vsle-ev3-server.service
```

Confirmed service environment after restart, with the token redacted:

```text
EV3_WS_PORT=8765
MAX_COLLECTED_POINTS=10000
LOG_LEVEL=INFO
EV3_ENABLE_BLUETOOTH=1
EV3_BT_ADDRESS=A0:E6:F8:19:58:3C
EV3_BT_RFCOMM_CHANNEL=1
WEISILE_PAIRING_TOKEN=<redacted>
```

The VSLE server stayed active and kept the Wi-Fi/USB WebSocket endpoint
available:

```text
systemctl is-active vsle-ev3-server.service -> active
127.0.0.1:8765 auth.pair -> websocket_auth_ack_ok=True
```

Confirm the service process owns an RFCOMM socket:

```bash
PID="$(systemctl show vsle-ev3-server.service -p MainPID --value)"
sudo ls -l /proc/$PID/fd | grep socket
sudo cat /proc/net/rfcomm
```

Confirmed RFCOMM evidence:

```text
PID=1060
/proc/net/rfcomm inode=7675
/proc/1060/fd/9 -> socket:[7675]
```

If Bluetooth still shows `Powered: no`, unblock the controller and make it
visible for pairing:

```bash
for f in /sys/class/rfkill/rfkill*/soft; do
  [ -e "$f" ] && echo 0 | sudo tee "$f"
done
sudo hciconfig hci0 up
sudo hciconfig hci0 piscan
printf 'show\nquit\n' | bluetoothctl
```

Confirmed Bluetooth controller evidence:

```text
hci0: UP RUNNING PSCAN ISCAN
Powered: yes
Discoverable: yes
Pairable: yes
```

An EV3 self-connection to its own RFCOMM address may still report
`No route to host`; do not use that as the final classroom proof. The next proof
must come from the teacher computer pairing to the EV3 and connecting through
WeisileLink `vsle-bluetooth`.

### Phase 7: Pair The Mac And Run A Non-Invasive Bluetooth Smoke

Before running the full classroom smoke, confirm the paired Mac can reach the
EV3 over the macOS native adapter without moving motors.

Confirmed on 2026-05-29:

- macOS Bluetooth showed the ev3dev EV3 as connected.
- `desktop/macos/native/build.sh` rebuilt the adapter as:
  `desktop/build/macos/native/WeisileEV3BluetoothAdapter.app/Contents/MacOS/WeisileEV3BluetoothAdapter`
- The EV3 pairing token was read over the existing USB SSH recovery path and
  was not written to committed logs.
- A non-invasive `vsle-bluetooth` smoke through `VSLEBluetoothTransport` and
  `NativeAdapterProcess` returned:

```text
connect_ok=True
sensor_update_ok=True
sensor_roots=motors,sensors,system
disconnect_ok=True
```

This confirms the Mac adapter bundle, LaunchServices socket bridge, EV3
pairing token, and EV3-side RFCOMM listener can complete the basic full VSLE
Bluetooth handshake. It does not replace the full classroom smoke because it
does not exercise all command groups or release-artifact install evidence.

Confirmed safe command-group preflight on 2026-05-29:

```text
connect_ok=True
sensor_updates=118
sensor_roots=motors,sensors,system
sensor_freshness_ms_max=2369.593
sensor_freshness_ms_avg=80.561
command_groups_passed=data_collection,display,motor,sensor,sound,system
disconnect_ok=True
```

This preflight used only safe commands such as `motor.stopAll`,
`system.stopAll`, display text/clear, sound beep/stop, and data collection
start/add/stop/clear. It produced
`docs/classroom/vsle_bluetooth_full_module_smoke.json` and refreshed
`docs/classroom/vsle_bluetooth_full_module_smoke.md`, but the report correctly
still says `Classroom ready: no` because release-artifact install evidence,
ScratchAI browser evidence, AI Quest evidence, and 25ms sensor freshness remain
unmet.

### Next Phase

Investigate and fix the Bluetooth sensor freshness gap, then rerun the full
`vsle-bluetooth` classroom smoke until `sensor_freshness_ms_max <= 25` while
also collecting release-artifact, ScratchAI browser, and AI Quest evidence.
