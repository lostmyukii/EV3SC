# Windows Desktop Locked Executable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Windows setup wizard replace an installed WeisileLink Desktop even when its previous executable is still running.

**Architecture:** Add a focused pre-upgrade process-stop function to `WindowsInstallActions.psm1`. The confirmed install path calls it before forced target removal, returns blocked evidence if matching processes remain, and otherwise continues the existing copy and helper workflow.

**Tech Stack:** Windows PowerShell 5.1, PowerShell Core runtime tests, Python pytest.

---

### Task 1: Lock the upgrade behavior in tests

**Files:**
- Modify: `tests/test_windows_setup_wizard_phase_c_execution.py`
- Modify: `tests/test_windows_setup_wizard_pwsh_runtime.py`

- [ ] Add assertions for the pre-upgrade stop function, target-path filtering, timeout evidence, and its invocation before `Remove-Item`.
- [ ] Add a PowerShell runtime probe with injected fake process objects and a stop callback.
- [ ] Run the focused tests and confirm they fail because the stop function does not exist.

### Task 2: Stop target WeisileLink processes before replacement

**Files:**
- Modify: `install/windows/lib/WindowsInstallActions.psm1`
- Modify: `install/windows/setup-wizard.ps1`
- Modify: `install/windows/README.md`
- Modify: `install/windows/WINDOWS_SETUP_WIZARD_DEVELOPMENT.md`

- [ ] Implement exact target-root process matching, forced stop, bounded wait, and structured evidence.
- [ ] Call the stop function only for confirmed forced replacement of an existing target.
- [ ] Expand wizard exception evidence with the target path and locked-process guidance.
- [ ] Document upgrade behavior and retry guidance.
- [ ] Run focused tests until they pass.

### Task 3: Verify, publish, and regenerate the handoff

**Files:**
- Modify: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- Generate: `/Users/yukii/Desktop/VSLE-Install`

- [ ] Run all `tests/test_windows_setup_wizard*.py`.
- [ ] Parse the modified PowerShell files with the PowerShell AST parser.
- [ ] Run `install/check_install_files.sh`.
- [ ] Commit and push the implementation.
- [ ] Record the completed commit in the development progress log, commit, and push it.
- [ ] Regenerate and verify `/Users/yukii/Desktop/VSLE-Install`.
