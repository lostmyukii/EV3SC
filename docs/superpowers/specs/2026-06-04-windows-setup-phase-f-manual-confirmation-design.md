# Windows Setup Phase F Manual Confirmation Design

## Goal

Make manual Windows setup steps feel active and trustworthy by letting teacher
confirmation checkboxes drive the current-step progress bar. A manual step
should not remain at 0% after the teacher starts completing physical actions.

## Product Principle

Manual progress means **teacher-confirmed progress**, not automatic hardware
detection. The wizard must never claim that SD-card flashing, EV3 boot, or
Bluetooth pairing succeeded unless the check came from an actual automated
probe. For Phase F, checkbox completion is labeled as teacher confirmation.

## UX Requirements

- Manual steps show a checklist using checkboxes.
- Each checkbox label starts with "我已确认".
- Current-step progress equals checked required items divided by total required
  manual confirmation items.
- The step reaches 100% only when all required confirmation items are checked.
- Continue is disabled for manual steps until the required checklist reaches
  100%.
- Automatic steps still use system validation progress and do not require
  teacher checkboxes.

## Initial Manual Steps

Phase F covers the highest-confusion teacher-facing steps:

- Welcome:
  - Confirm this is an internal test package and required materials are ready.
- Prepare SD Card:
  - Confirm the SD card is inserted in the Windows computer, not the EV3.
  - Confirm Etcher selected the ev3dev image and correct microSD target.
  - Confirm Etcher displayed Flash Complete and the SD card was safely ejected.
- EV3 First Boot:
  - Confirm the SD card is inserted in the EV3.
  - Confirm the EV3 is powered on and booting.
  - Confirm ev3dev / Brickman appears on the EV3 screen.
- Bluetooth Full VSLE:
  - Confirm the Windows computer has Bluetooth or a USB Bluetooth adapter.
  - Confirm the EV3 is paired in Windows Bluetooth settings.
  - Confirm this is Bluetooth Full VSLE with ev3dev, not official-firmware
    compatibility mode.
- Open ScratchAI:
  - Confirm ScratchAI is open.
  - Confirm the VSLE-EV3 extension is selected.
  - Confirm the EV3 blocks or sensor values appear.

## Data Model

Each step may define `ManualConfirmations`, a list of hashtables:

```powershell
@{ Id = "sd-card-in-computer"; Label = "我已确认 SD 卡插在 Windows 电脑上，不在 EV3 上"; Required = $true }
```

Runtime state is kept in memory only while the wizard is open. Diagnostics may
record checkbox IDs and checked states, but must not record passwords, pairing
tokens, API keys, or student raw data.

## Acceptance Criteria

- Manual confirmation checkboxes render on manual steps.
- Checking one item increases current-step progress.
- Unchecking one item decreases current-step progress.
- Continue remains disabled until all required confirmation checkboxes are
  checked.
- Automatic file validation still reaches 100% from the system result.
- The generated `/Users/yukii/Desktop/VSLE-Install` package contains the updated
  wizard and passes install-file verification.
