# Windows Setup Wizard Development Design

本文档设计 Windows 版 VSLE Scratch-EV3 图形化安装向导。目标是把当前
`install/windows/` 里的命令行安装、校验、解压、启动和人工确认流程，整理成
老师可见、步骤清晰、状态明确的 GUI 向导。

设计结论：Windows 安装流程可以高度自动化，但不应设计成完全无人值守。
涉及 SD 卡刷写、EV3 首次启动、蓝牙配对、真实 EV3 选择、pairing token
输入的环节必须保留人工确认。

## 1. Product Goal

构建一个 `VSLE Windows Setup Wizard`，让老师或内部测试人员在 Windows 上完成：

1. 校验安装文件。
2. 准备 ev3dev SD 卡。
3. 引导 EV3 首次启动。
4. 选择 WiFi Full VSLE 或 Bluetooth Full VSLE。
5. 安装 EV3 端 `vsle_ev3_server.py`。
6. 解压并安装 WeisileLink Desktop 内测包。
7. 创建本机启动项。
8. 检查 `127.0.0.1:20111` 和 `127.0.0.1:8766`。
9. 打开 ScratchAI。
10. 生成安装结果报告和诊断提示。

非目标：

- 不自动刷写 SD 卡目标盘。
- 不绕过 Windows 蓝牙配对 UI。
- 不把 pairing token 写入日志、命令行历史、截图或 evidence 文件。
- 不把 unsigned internal build 伪装成生产发布。
- 不替代 Windows code signing、timestamp 和 clean-machine install smoke gate。

## 2. Feasibility Summary

| Area | Automation level | Reason |
|---|---|---|
| Install file validation | Fully automatic | Hash, archive, JSON, and file-signature checks are deterministic. |
| Windows internal evidence unzip | Fully automatic | Evidence zip has known structure and hash. |
| WeisileLink file install | Fully automatic | Copy files to `%LocalAppData%\Programs\VSLE\WeisileLink`. |
| Startup entry | Fully automatic | Existing `install-windows.ps1` creates a startup CMD. |
| Local port check | Fully automatic | Probe `127.0.0.1:20111` and `127.0.0.1:8766`. |
| ScratchAI launch | Fully automatic | Open browser to configured ScratchAI URL. |
| SD card flashing | Human-confirmed | Target disk selection must be manual to avoid destructive writes. |
| EV3 first boot | Human-confirmed | Requires physical screen observation. |
| Bluetooth pairing | Human-guided | Windows Bluetooth stack and classroom hardware state vary. |
| Pairing token entry | Human-secure | Token must be hidden and never printed. |
| Production release approval | Manual gate | Requires signed artifacts and clean-machine evidence. |

## 3. Recommended Technology

### Phase 1: PowerShell + WPF

Use a WPF UI hosted by PowerShell 5.1+:

- Works on normal Windows teacher machines.
- Can directly call existing PowerShell scripts.
- Can run without Node/Electron dependencies.
- Supports progress bars, step lists, status cards, input fields, and modal warnings.
- Good enough to imitate an iOS/macOS-like visual style for the internal setup tool.

Primary files proposed for Phase A:

```text
install/windows/setup-wizard.ps1
install/windows/setup-wizard.xaml
install/windows/setup-wizard.css.md
install/windows/lib/SetupWizard.psm1
install/windows/lib/InstallFileChecks.psm1
install/windows/lib/WindowsInstallActions.psm1
install/windows/lib/Ev3ConnectionChecks.psm1
install/windows/SETUP_WIZARD_TEST_PLAN.md
```

### Phase 2: Signed Production Installer

Once the workflow is stable, wrap the same install actions in a signed MSI or
signed EXE bootstrapper. The GUI should call the same lower-level functions so
internal and production behavior stay aligned.

## 4. UX Design Principles

Visual direction: iOS / Apple-inspired, but not a clone.

Use:

- White or very light gray background.
- Large title and concise step subtitle.
- Left-side or top progress stepper.
- Rounded panels with subtle border and soft shadow.
- Clear green/yellow/red state markers.
- Blue primary action button.
- Secondary gray buttons for back, skip, or export diagnostics.
- Monospace boxes only for command previews or evidence paths.

Avoid:

- Dense terminal output as the main UI.
- Hidden background actions with no visible state.
- Forcing teachers to interpret raw PowerShell errors.
- Any dark hacker-style console aesthetic.
- Claims like "classroom ready" for unsigned internal builds.

Every page should show:

```text
Step title
What the wizard can do automatically
What the teacher must do manually
Current status
Evidence or result
Back / Continue / Retry / Export diagnostics
```

## 5. Wizard Step Model

Each step has the same data shape:

```json
{
  "id": "validate-files",
  "title": "Verify installation files",
  "mode": "automatic",
  "status": "pending",
  "blocking": true,
  "manual_confirmation_required": false,
  "summary": "",
  "evidence": {},
  "next_enabled_when": "status == 'passed'"
}
```

Valid statuses:

```text
pending
running
needs_manual_action
needs_input
passed
warning
blocked
skipped
```

Blocking rules:

- `blocked` prevents Continue.
- `warning` allows Continue only after teacher acknowledgement.
- `needs_manual_action` requires a checkbox or confirmation button.
- `needs_input` requires a validated input value.
- `passed` enables Continue.

## 6. Page Flow

### Step 0: Welcome

Purpose:

- Explain that this is an internal VSLE Windows setup wizard.
- Show release status: unsigned internal testing only.
- Ask teacher to keep EV3, SD card, USB cable, and Bluetooth available.

Automatic checks:

- Detect Windows version.
- Detect PowerShell version.
- Confirm wizard runs from the `install/windows/` folder or a USB copy.

Manual confirmation:

- Teacher confirms they understand this is internal testing unless using a signed release package.

### Step 1: Verify Files

Automatic checks:

- Validate `balenaEtcher-Setup-1.17.0.exe` hash.
- Validate shared ev3dev image hash.
- Validate `windows-internal-release-evidence.zip` hash.
- Validate receipt JSON parse.
- Validate evidence zip contains:
  - `WeisileLink.exe`
  - `WeisileLink-windows-0.1.0-internal-unsigned.zip`
  - Windows install helpers
  - Windows internal manifest
- Validate shared EV3 firmware files exist.

Implementation source:

- Mirror `install/check_install_files.sh` logic in PowerShell.
- Do not rely on Git or Unix tools on Windows.

Manual confirmation:

- None if all checks pass.

### Step 2: Prepare SD Card

Automatic actions:

- Show paths to Etcher EXE and ev3dev image.
- Open Etcher installer or Etcher app if installed.
- Copy image path to clipboard.

Manual action:

- Teacher chooses SD card target in Etcher.
- Teacher confirms Etcher completed validation.
- Teacher confirms SD card was safely ejected.

Blocking warning:

- The wizard must explicitly warn that target disk selection is destructive.

### Step 3: EV3 First Boot

Automatic actions:

- Show checklist for inserting SD card and powering EV3.
- Start optional timer and display expected wait range.

Manual action:

- Teacher confirms EV3 reached ev3dev / Brickman page.

Optional input:

- Teacher records EV3 label, for example `Table 1 EV3`.

### Step 4: Choose Transport

Options:

- WiFi Full VSLE.
- Bluetooth Full VSLE.
- USB-assisted setup.

Rules:

- Official-firmware Bluetooth compatibility must not be presented as Full VSLE.
- Bluetooth Full VSLE must say EV3 still runs ev3dev and the EV3SC server.

Inputs:

- WiFi: EV3 IP or hostname.
- Bluetooth: EV3 Bluetooth address.
- USB-assisted: host/address field plus guidance.

### Step 5: Install EV3 Server

Automatic actions where possible:

- Test EV3 SSH reachability.
- Copy EV3 firmware files and `websockets-7.0.tar.gz`.
- Run offline `websockets` install commands on EV3.
- Run `SKIP_PIP_INSTALL=1 ./scripts/install.sh`.
- Check `vsle-ev3-server.service`.

Manual inputs:

- EV3 SSH host/address.
- SSH username, default `robot`.
- Password prompt, default password described as `maker` but not stored.

Security:

- Password and pairing token inputs must use secure fields.
- Do not write secrets to transcript logs.

### Step 6: Enable Bluetooth Full VSLE

Shown only when transport is Bluetooth Full VSLE.

Automatic actions:

- Display EV3-side commands to enable RFCOMM listener.
- Optionally run them over SSH after teacher confirms EV3 Bluetooth address.

Manual actions:

- Teacher pairs EV3 in Windows Bluetooth settings.
- Teacher confirms Windows shows EV3 paired or connected.

Blocking rules:

- Continue allowed only after teacher confirms pairing or chooses WiFi fallback.

### Step 7: Install WeisileLink Desktop

Automatic actions:

- Expand `windows-internal-release-evidence.zip` to a staging directory.
- Extract `WeisileLink.exe`.
- Copy executable and helper files to:

```text
%LocalAppData%\Programs\VSLE\WeisileLink
```

- Create config/log/diagnostics directories.
- Call existing `install-windows.ps1`.
- Verify startup entry exists.

Manual confirmation:

- If Windows warns about unknown publisher, teacher confirms this is expected for unsigned internal testing.

### Step 8: Start And Verify Local Bridge

Automatic actions:

- Start `WeisileLink.exe desktop-supervise`.
- Check ports:

```text
127.0.0.1:20111
127.0.0.1:8766
```

- Check process state.
- Run a diagnostics command if available.

Manual action:

- If no saved EV3 profile exists, teacher proceeds to pairing or setup recovery.

### Step 9: Open ScratchAI

Automatic actions:

- Open configured ScratchAI URL.
- Show teacher instructions:
  - Click extension button.
  - Choose VSLE-EV3 / EV3 extension.
  - Select WiFi Full VSLE or Bluetooth Full VSLE.
  - Confirm red EV3 category and sensor updates.

Manual confirmation:

- Teacher confirms red EV3 category appeared.
- Teacher confirms live sensor values update.

### Step 10: Finish And Export Report

Automatic actions:

- Write setup report JSON.
- Write human-readable Markdown summary.
- Offer diagnostics export.

Report path:

```text
%LocalAppData%\VSLE\WeisileLink\diagnostics\setup-wizard-report.json
%LocalAppData%\VSLE\WeisileLink\diagnostics\setup-wizard-report.md
```

Report must include:

- Install source path.
- File hashes verified.
- Windows version.
- Transport selected.
- Whether desktop bridge started.
- Whether ports passed.
- Whether ScratchAI was opened.
- Manual confirmation timestamps.
- Explicit `production_release_ready: false` for unsigned internal builds.

Report must not include:

- Pairing token.
- Password.
- API keys.
- Raw student data.
- Full Bluetooth address unless teacher explicitly chooses to include device identifiers for support.

## 7. Automation Modules

### InstallFileChecks

Responsibilities:

- Compute SHA-256.
- Validate file existence.
- Validate zip entries.
- Validate JSON.
- Validate Windows EXE file header/signature enough for internal testing.

### PackageInstaller

Responsibilities:

- Expand internal evidence zip.
- Locate nested Windows internal release zip.
- Locate `WeisileLink.exe`.
- Copy files to install root.
- Call install helper script.

### Ev3Setup

Responsibilities:

- Validate SSH host.
- Copy EV3 firmware package.
- Run EV3-side commands.
- Check service active state.
- Enable Bluetooth Full VSLE only after explicit teacher confirmation.

### BridgeVerifier

Responsibilities:

- Start or detect WeisileLink.
- Check local ports.
- Run diagnostics command.
- Open ScratchAI.

### ReportWriter

Responsibilities:

- Redact sensitive fields.
- Write JSON and Markdown reports.
- Track manual confirmation events.

## 8. Error Handling

Each error should map to teacher-readable recovery.

Examples:

| Error | UI message | Recovery |
|---|---|---|
| Missing evidence zip | Windows release bundle not found. | Use the Windows internal release evidence file from `install/windows/02-weisilelink-desktop/`. |
| Hash mismatch | This install file does not match the audited copy. | Stop and replace the file from EV3SC install assets. |
| Etcher not completed | SD card is not ready yet. | Finish flashing and validation in Etcher, then confirm. |
| SSH unreachable | EV3 is not reachable. | Check USB/WiFi, EV3 screen, IP/hostname, and password. |
| Service inactive | EV3 server did not start. | Show last service status and offer retry. |
| Port 20111 busy | Scratch Link compatible port is already used. | Stop the other service or export diagnostics. |
| Needs pairing | No saved EV3 credential. | Open pairing step and collect token securely. |

## 9. Security And Privacy

Requirements:

- Never echo tokens or passwords.
- Use secure input fields for secrets.
- Avoid raw terminal transcript in final report.
- Redact Bluetooth addresses by default in exported diagnostics.
- Keep localhost binding as default.
- Do not enable LAN access from this wizard.
- Keep official-firmware Bluetooth labeled as limited compatibility if it appears at all.

## 10. Test Strategy

### Static Tests

- PowerShell parser check for all `.ps1` and `.psm1` files.
- XAML parse/load smoke.
- Hash-check module tests with known sample files.
- Redaction tests for report writer.

### Simulated Windows Install Tests

- Use a temp install root.
- Expand `windows-internal-release-evidence.zip`.
- Copy fake or real `WeisileLink.exe`.
- Verify startup file creation.
- Verify report generation.

### Hardware-Assisted Tests

- USB-connected EV3 server install.
- Bluetooth Full VSLE enable and pairing.
- Local bridge port check.
- ScratchAI manual confirmation.

### Release Evidence Tests

- Use `scripts/run_desktop_install_smoke.py` only after release artifact install evidence is collected.
- Do not mark classroom readiness from developer checkout or unsigned internal-only evidence.

## 11. Implementation Phases

### Phase A: Documentation And Skeleton

Deliver:

- This design document.
- `setup-wizard.ps1` skeleton that opens a basic WPF window.
- No install actions yet.

Success:

- Window opens on Windows PowerShell 5.1+.
- UI shows the full step list.

### Phase B: File Validation UI

Deliver:

- Install file checker module.
- Step 1 UI with pass/fail state.

Success:

- Hash, zip, JSON, and expected-entry checks pass using current install assets.

### Phase C: Desktop Install Automation

Deliver:

- Expand Windows evidence zip.
- Copy `WeisileLink.exe`.
- Call `install-windows.ps1`.
- Verify startup entry.

Success:

- Clean temp install root contains executable and helper files.
- Startup entry points to `desktop-supervise`.

### Phase D: EV3 Guided Setup

Deliver:

- SSH input screen.
- EV3 server copy/install runner.
- Bluetooth Full VSLE guided pairing page.

Success:

- USB/WiFi EV3 install path works with real EV3.
- Bluetooth manual steps are visible and confirmed.

### Phase E: Bridge Verification And Finish Report

Deliver:

- Local port checks.
- ScratchAI open button.
- Setup report JSON/Markdown.

Success:

- Report proves what passed, what was manually confirmed, and what remains gated.

### Phase F: Production Installer Integration

Deliver:

- Signed MSI or signed EXE bootstrapper integration.
- Same lower-level action modules reused.

Success:

- Clean-machine install smoke can use the production artifact evidence.

## 12. Open Decisions

1. Whether Phase 1 should use pure WPF PowerShell or a small .NET app.
2. Whether the UI should support multiple classroom EV3 profiles in the first release.
3. Whether WiFi Full VSLE or Bluetooth Full VSLE should be the default selected path.
4. Whether internal testers should receive the evidence zip directly or a pre-expanded USB folder.
5. Whether Windows official-firmware compatibility should appear in this wizard at all; if included, it must be clearly labeled as limited compatibility.

## 13. Recommended Next Step

Create the Phase A skeleton:

```text
install/windows/setup-wizard.ps1
install/windows/setup-wizard.xaml
install/windows/lib/SetupWizard.psm1
```

The first implementation should only render the window and stepper. It should
not install files until the validation module and tests exist.
