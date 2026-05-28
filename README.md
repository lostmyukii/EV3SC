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

1. Download and install Balena Etcher:
   `https://etcher.balena.io/`
2. Open the ev3dev downloads page:
   `https://www.ev3dev.org/downloads/`
3. Download the EV3 image. The image name should clearly say EV3, such as an
   `ev3dev-stretch-ev3-...` image.
4. Do not choose images for Raspberry Pi, BeagleBone, BrickPi, or other boards.
5. Keep the downloaded image in a location you can find from Etcher.

Before moving to Phase 2, record:

- SD card capacity and type, for example `16GB microSDHC`.
- Teacher computer OS, for example `macOS`.
- Downloaded ev3dev image filename.

### Next Phase

Phase 2 will flash the ev3dev image to the SD card with Etcher, eject the card
cleanly, and boot the EV3 from the card.
