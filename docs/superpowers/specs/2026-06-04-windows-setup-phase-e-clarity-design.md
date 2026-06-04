# Windows Setup Phase E Clarity Design

## Goal

Make the Windows VSLE Scratch-EV3 setup wizard understandable for teachers
during the first real install attempt. Phase E focuses on clearer step copy,
visible pass/fail state, a real 0-100% progress indicator for automatic file
checks, and explicit SD-card location guidance.

## Scope

Phase E changes only the internal Windows WPF setup wizard files under
`install/windows/` and their tests. It does not add production signing, MSI/EXE
packaging, real Windows Bluetooth adapter automation, or new EV3 hardware
capabilities.

## User Experience Requirements

Each wizard step should answer four questions without requiring the teacher to
read terminal output:

- What is this step for?
- What will the wizard check or do automatically?
- What must the teacher do manually?
- What exact condition means this step is complete?

The right-side page should keep the current iOS/Apple-inspired style but add:

- A current-step progress bar and percentage label.
- A short "completion condition" line.
- A clearer "current hardware location" line when relevant.
- File-check sub-item results that explicitly show pending, running, passed,
  warning, blocked, or skipped.

## File Check Progress

The "检查安装文件" step should have deterministic progress because every check
is known before execution. The wizard should update the current-step progress
as each validation phase finishes:

1. Required paths exist.
2. Etcher and ev3dev image hashes/signatures are valid.
3. Windows internal release evidence zip is valid.
4. JSON evidence templates parse.
5. XAML parses.
6. Windows release zip contains expected app files.
7. Final file-check result is applied to the step.

When the result passes, the step should visibly show 100% and a passed status.
If any check fails, progress may stop below 100% or show the completed fraction,
and the evidence area must show the blocking reason.

## SD Card Guidance

The SD-card flow must be split by physical location:

- Prepare SD Card:
  - SD card location: inserted in the Windows computer.
  - EV3 state: powered off; do not insert the SD card into EV3 yet.
  - Teacher action: use balenaEtcher to write the ev3dev image, wait for Etcher
    verification, then safely eject the SD card.
  - Completion condition: Etcher reports flash/validation complete and the SD
    card has been safely ejected.

- EV3 First Boot:
  - SD card location: inserted in the EV3 brick.
  - EV3 state: powered on with the flashed ev3dev SD card.
  - Teacher action: wait for ev3dev/Brickman to appear.
  - Completion condition: EV3 screen shows ev3dev/Brickman.

- Install EV3 Server:
  - SD card location: remains inside the EV3 brick.
  - EV3 state: ev3dev is running and reachable over the selected connection
    path.
  - Teacher action: provide EV3 address or Bluetooth information.
  - Completion condition: the guided server install plan or install result is
    accepted by the wizard.

## Step Data Model

Keep the existing step hashtable model and add small optional properties:

- `CompletionCondition`: teacher-facing pass condition.
- `HardwareLocation`: teacher-facing current device placement.
- `CheckItems`: list of named sub-checks with `Status` and `Detail`.
- `StepProgressPercent`: integer 0-100.

The WPF script should tolerate older steps that do not define these properties.

## Error Handling

Button or validation failures must update the visible status and evidence areas.
The wizard must not fail silently. Diagnostics export must remain redacted and
must not include passwords, pairing tokens, API keys, or student raw data.

## Testing Strategy

Add regression tests before implementation:

- The XAML contains progress controls and status/detail fields.
- The step model includes completion conditions, SD-card location copy, and
  check item fields.
- The PowerShell script updates current-step progress and file-check item
  statuses.
- Existing Chinese encoding tests still require UTF-8 BOM for PowerShell 5.1.
- Existing Windows setup tests still pass.

## Acceptance Criteria

- "检查安装文件" reaches 100% on a passing validation result.
- File checks show explicit sub-item pass state rather than only a summary.
- SD-card steps clearly state whether the SD card is in the computer or EV3.
- The teacher can identify the exact manual confirmation required before
  pressing Continue.
- The generated `/Users/yukii/Desktop/VSLE-Install` package contains the updated
  wizard and passes install-file verification.
