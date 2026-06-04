# Windows Setup Phase F Manual Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add teacher confirmation checkboxes that drive manual-step progress and gate Continue until required confirmations are complete.

**Architecture:** Extend the existing PowerShell step model with `ManualConfirmations`. Render those confirmations as WPF checkboxes in `setup-wizard.xaml`, wire checkbox events in `setup-wizard.ps1`, and keep checkbox runtime state in memory while the wizard is open. Automatic validation steps keep using existing validation progress.

**Tech Stack:** Windows PowerShell 5.1, WPF/XAML, Python pytest static/runtime tests, existing install verification scripts.

---

### Task 1: Add Failing Tests

**Files:**
- Create: `tests/test_windows_setup_wizard_phase_f_manual_confirmations.py`

- [ ] Add tests that assert `ManualConfirmations` exists in the step model.
- [ ] Add tests that assert welcome, SD-card, first-boot, Bluetooth, and ScratchAI steps include labels starting with `我已确认`.
- [ ] Add tests that assert XAML contains `ManualConfirmationsList`.
- [ ] Add tests that assert the script contains `Update-VsleManualConfirmationProgress`, `Get-VsleManualConfirmationProgress`, and `Add_Checked` / `Add_Unchecked` handlers.
- [ ] Run `pytest tests/test_windows_setup_wizard_phase_f_manual_confirmations.py -q` and verify failure before implementation.

### Task 2: Extend Step Model

**Files:**
- Modify: `install/windows/lib/SetupWizard.psm1`

- [ ] Add `ManualConfirmations = @()` to automatic steps.
- [ ] Add required manual confirmation items to welcome, prepare SD card, EV3 first boot, Bluetooth Full VSLE, and Open ScratchAI.
- [ ] Keep IDs stable and ASCII, for example `sd-card-in-computer`.

### Task 3: Render and Wire Manual Confirmations

**Files:**
- Modify: `install/windows/setup-wizard.xaml`
- Modify: `install/windows/setup-wizard.ps1`

- [ ] Add `ManualConfirmationsList` with checkbox rows.
- [ ] Add runtime state helpers for checked IDs.
- [ ] On checkbox checked/unchecked, update step progress.
- [ ] Disable Continue on manual steps until all required confirmations are checked.
- [ ] Leave automatic steps governed by existing status/progress behavior.

### Task 4: Verify and Release Folder

**Files:**
- Modify: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- Generated: `/Users/yukii/Desktop/VSLE-Install`

- [ ] Run the full Windows setup wizard test suite.
- [ ] Run `install/check_install_files.sh`.
- [ ] Commit implementation.
- [ ] Append spec progress log and commit it.
- [ ] Push to `origin`.
- [ ] Regenerate `/Users/yukii/Desktop/VSLE-Install` and verify generated files contain Phase F controls.
