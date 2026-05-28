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

### Next Phase

Phase 2 will flash the ev3dev image to the SD card with Etcher, eject the card
cleanly, and boot the EV3 from the card.
