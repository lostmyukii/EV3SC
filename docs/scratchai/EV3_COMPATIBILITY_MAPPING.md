# ScratchAI EV3 Compatibility Mapping

Date: 2026-05-23

This document records how old Scratch official EV3 projects are handled inside
the EV3SC-owned ScratchAI editor.

## Scope

Old `.sb3` projects can contain the official Scratch EV3 extension id `ev3` and
official opcodes prefixed with `ev3_`. ScratchAI still recognizes those projects,
but it does not reactivate the original Scratch EV3 Bluetooth implementation.
Instead, the VM loads a VSLE-backed compatibility extension under id `ev3`.

New projects created from the ScratchAI extension library continue to load the
complete Unsandboxed VSLE-EV3 category under id `vsleev3`.

## Source Basis

The official opcode names, menu values, timing bounds, and note-frequency formula
come from the EV3SC-owned port of Scratch VM's official EV3 extension:

`scratch-ai-platform/scratch-editor/packages/scratch-vm/src/extensions/scratch3_ev3/index.js`

The compatibility runtime follows the same project-owned VSLE-EV3 command and
cache contracts:

`vsle-ev3-extension/index.js`

It intentionally keeps a small VM-safe JSON-RPC and `SensorCache` adapter in
`scratch3_vsle_ev3_compat` so Scratch VM builds do not statically bundle the
Unsandboxed extension file.

## Mapping Table

| Official opcode | VSLE-backed behavior |
|---|---|
| `ev3_motorTurnClockwise` | Sends `motor.runTimed` with official motor port `0..3` mapped to `A..D`, stored official power, and positive speed |
| `ev3_motorTurnCounterClockwise` | Sends `motor.runTimed` with official motor port `0..3` mapped to `A..D`, stored official power, and negative speed |
| `ev3_motorSetPower` | Stores official per-port motor power `0..100` for later timed motor commands |
| `ev3_getMotorPosition` | Reads `motors.<A-D>.position` from `SensorCache` and wraps degrees to `0..359` |
| `ev3_whenButtonPressed` | Reads `sensors.<S1-S4>.pressed` from `SensorCache` |
| `ev3_whenDistanceLessThan` | Reads the first cached ultrasonic `distance_cm`, clamps to `0..100`, and compares with the official threshold |
| `ev3_whenBrightnessLessThan` | Reads the first cached color `ambient` value, falling back to `reflected`, then compares with the official threshold |
| `ev3_buttonPressed` | Reads `sensors.<S1-S4>.pressed` from `SensorCache` |
| `ev3_getDistance` | Reads the first cached ultrasonic `distance_cm`, clamps to `0..100`, and rounds to two decimals |
| `ev3_getBrightness` | Reads the first cached color `ambient` value, falling back to `reflected`, and clamps to `0..100` |
| `ev3_beep` | Sends `sound.playToneWait` using Scratch official EV3 MIDI-note conversion and duration bounds |

## Acceptance Checks

- `npm --workspace @scratch/scratch-vm exec -- tap test/unit/extension_vsle_ev3_compat.js`
- `SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED=1 npm --workspace @scratch/scratch-vm exec -- tap test/integration/load-extensions.js`

The integration command enables Text to Speech because the ScratchAI classroom
external-service policy disables service-backed extensions by default. EV3
compatibility is validated in that full fixture loop without changing the
project's default policy.
