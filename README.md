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

References:

- ev3dev Getting Started:
  `https://www.ev3dev.org/docs/getting-started/`
- ev3dev legacy first-boot note:
  `https://github.com/dlech/ev3dev/wiki/Getting-started-v2`

### Next Phase

Phase 4 will connect to the booted EV3 for first-login and network setup.
