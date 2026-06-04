# Windows Setup Phase E Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Windows setup wizard show clear pass state, current-step progress, and SD-card location guidance for teachers.

**Architecture:** Keep the current PowerShell/WPF wizard structure. Extend the step model in `SetupWizard.psm1` with optional teacher-facing fields, then bind those fields in `setup-wizard.xaml` and `setup-wizard.ps1`. File-check progress is deterministic and updated from the existing validation result path.

**Tech Stack:** Windows PowerShell 5.1, WPF/XAML, Python pytest static/runtime tests, existing `install/check_install_files.sh` verification.

---

### Task 1: Lock Phase E UI Contract With Tests

**Files:**
- Modify: `tests/test_windows_setup_wizard_phase_a.py`
- Create: `tests/test_windows_setup_wizard_phase_e_clarity.py`

- [ ] **Step 1: Write failing tests for progress controls**

Add assertions that `setup-wizard.xaml` contains:

```python
for required_name in (
    "CurrentStepProgressBar",
    "CurrentStepProgressText",
    "CompletionConditionText",
    "HardwareLocationText",
    "CheckItemsList",
):
    assert required_name in text
```

- [ ] **Step 2: Write failing tests for step model fields**

Create a test that reads `install/windows/lib/SetupWizard.psm1` and asserts:

```python
for required_field in (
    "CompletionCondition",
    "HardwareLocation",
    "CheckItems",
    "StepProgressPercent",
):
    assert required_field in text
```

Also assert the SD-card copy contains:

```python
assert "SD 卡位置：插在 Windows 电脑上" in text
assert "SD 卡位置：插在 EV3 里" in text
assert "不要插入 EV3" in text
assert "Etcher 显示 Flash Complete" in text
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
.venv/bin/python -m pytest tests/test_windows_setup_wizard_phase_e_clarity.py -q
```

Expected: tests fail because Phase E controls and fields are not implemented.

### Task 2: Extend the Step Model

**Files:**
- Modify: `install/windows/lib/SetupWizard.psm1`
- Test: `tests/test_windows_setup_wizard_phase_e_clarity.py`

- [ ] **Step 1: Add optional Phase E fields to each relevant step**

Add teacher-facing properties to the welcome, validate-files, prepare-sd-card,
ev3-first-boot, choose-transport, install-ev3-server, and desktop steps:

```powershell
CompletionCondition = "..."
HardwareLocation = "..."
StepProgressPercent = 0
CheckItems = @()
```

For `validate-files`, define seven check items:

```powershell
CheckItems = @(
    @{ Name = "必需路径"; Status = "pending"; Detail = "等待检查 install 文件夹结构。" },
    @{ Name = "Etcher 与 ev3dev"; Status = "pending"; Detail = "等待检查安装器和镜像。" },
    @{ Name = "Windows release evidence"; Status = "pending"; Detail = "等待检查 Windows 内测包。" },
    @{ Name = "JSON 证据模板"; Status = "pending"; Detail = "等待解析 JSON 模板。" },
    @{ Name = "XAML 向导文件"; Status = "pending"; Detail = "等待解析 WPF XAML。" },
    @{ Name = "Desktop release 内容"; Status = "pending"; Detail = "等待检查 WeisileLink.exe。" },
    @{ Name = "最终结果"; Status = "pending"; Detail = "等待汇总文件检查结果。" }
)
```

- [ ] **Step 2: Run model tests and verify GREEN for model assertions**

Run:

```bash
.venv/bin/python -m pytest tests/test_windows_setup_wizard_phase_e_clarity.py -q
```

Expected: model assertions pass; XAML/script assertions may still fail until Task 3.

### Task 3: Bind Progress and Guidance in the WPF UI

**Files:**
- Modify: `install/windows/setup-wizard.xaml`
- Modify: `install/windows/setup-wizard.ps1`
- Test: `tests/test_windows_setup_wizard_phase_e_clarity.py`

- [ ] **Step 1: Add WPF controls**

Add controls for:

```xml
<ProgressBar x:Name="CurrentStepProgressBar" Minimum="0" Maximum="100" />
<TextBlock x:Name="CurrentStepProgressText" />
<TextBlock x:Name="CompletionConditionText" />
<TextBlock x:Name="HardwareLocationText" />
<ListBox x:Name="CheckItemsList" />
```

- [ ] **Step 2: Update `Set-CurrentStep`**

Set default values when optional fields are absent:

```powershell
$progressPercent = 0
if ($Step.PSObject.Properties.Name -contains "StepProgressPercent") {
    $progressPercent = [int]$Step.StepProgressPercent
}
$Window.FindName("CurrentStepProgressBar").Value = $progressPercent
$Window.FindName("CurrentStepProgressText").Text = "$progressPercent%"
```

Bind completion, hardware location, and check items similarly.

- [ ] **Step 3: Run UI tests and verify GREEN**

Run:

```bash
.venv/bin/python -m pytest tests/test_windows_setup_wizard_phase_e_clarity.py -q
```

Expected: Phase E tests pass.

### Task 4: Update File Check Progress to 100%

**Files:**
- Modify: `install/windows/setup-wizard.ps1`
- Test: `tests/test_windows_setup_wizard_phase_e_clarity.py`

- [ ] **Step 1: Add helper functions**

Add helpers:

```powershell
function Set-VsleStepProgress { ... }
function Set-VsleStepCheckItems { ... }
function New-VsleValidateFileCheckItemsFromResult { ... }
```

`New-VsleValidateFileCheckItemsFromResult` should return seven check items and
mark them `passed` when the validation result is passed. When blocked, at least
the final result item should be `blocked` and include the result evidence.

- [ ] **Step 2: Wire helpers into validation**

Before validation starts:

```powershell
Set-VsleStepProgress -Id "validate-files" -ProgressPercent 5
```

After validation returns:

```powershell
$progressPercent = if ($Result.Status -eq "passed") { 100 } else { 70 }
Set-VsleStepProgress -Id "validate-files" -ProgressPercent $progressPercent
Set-VsleStepCheckItems -Id "validate-files" -CheckItems (New-VsleValidateFileCheckItemsFromResult -Result $Result)
```

- [ ] **Step 3: Run targeted tests**

Run:

```bash
PATH=/opt/homebrew/bin:/opt/homebrew/sbin:$PATH .venv/bin/python -m pytest tests/test_windows_setup_wizard_phase_e_clarity.py tests/test_windows_setup_wizard_pwsh_runtime.py -q
```

Expected: tests pass.

### Task 5: Verify, Commit, Push, and Regenerate Install Folder

**Files:**
- Modify: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`
- Generated outside repo: `/Users/yukii/Desktop/VSLE-Install`

- [ ] **Step 1: Run full Windows wizard test suite**

Run:

```bash
PATH=/opt/homebrew/bin:/opt/homebrew/sbin:$PATH .venv/bin/python -m pytest \
  tests/test_windows_setup_wizard_phase_a.py \
  tests/test_windows_setup_wizard_phase_b.py \
  tests/test_windows_setup_wizard_phase_c.py \
  tests/test_windows_setup_wizard_phase_c_execution.py \
  tests/test_windows_setup_wizard_phase_d_ev3_setup.py \
  tests/test_windows_setup_wizard_phase_e_clarity.py \
  tests/test_windows_setup_wizard_pwsh_runtime.py \
  tests/test_windows_setup_wizard_wpf_smoke.py \
  tests/test_windows_setup_launcher.py \
  tests/test_windows_setup_wizard_chinese_ui.py \
  tests/test_windows_setup_encoding.py -q
```

Expected: all tests pass.

- [ ] **Step 2: Run install verification**

Run:

```bash
install/check_install_files.sh
```

Expected: three verification passes complete.

- [ ] **Step 3: Commit implementation**

Run:

```bash
git add install/windows/lib/SetupWizard.psm1 install/windows/setup-wizard.ps1 install/windows/setup-wizard.xaml tests/test_windows_setup_wizard_phase_e_clarity.py tests/test_windows_setup_wizard_phase_a.py
git commit -m "feat(install): clarify windows setup wizard progress"
```

- [ ] **Step 4: Append progress log and commit docs**

Append the completed Phase E entry to `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`,
then run:

```bash
git add VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md
git commit -m "docs(spec): record windows setup phase e clarity"
```

- [ ] **Step 5: Push and regenerate**

Run:

```bash
git push origin HEAD
install/make_usb_copy.sh /Users/yukii/Desktop/VSLE-Install
```

Expected: generated install folder passes the same install-file verification.
