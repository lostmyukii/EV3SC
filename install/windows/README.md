# Windows Installation Files

Use this folder on a Windows teacher computer or Windows build host.

## Double-Click Launcher

For teacher-facing Windows setup, use the root launcher:

```text
..\Start-VSLE-Setup-Wizard.cmd
```

Copy the whole `VSLE-Install` folder to Windows, open the folder, and double
click `Start-VSLE-Setup-Wizard.cmd`. Users should not manually run
`setup-wizard.ps1`; the launcher calls Windows PowerShell 5.1 internally and
opens the same WPF setup wizard.

## Development Design

The proposed Windows graphical setup wizard design is documented in:

```text
WINDOWS_SETUP_WIZARD_DEVELOPMENT.md
```

It defines the feasibility boundaries, iOS/Apple-inspired wizard UX, page flow,
automation modules, manual confirmation steps, security rules, and staged
implementation plan.

## Phase A Wizard Shell

The first Windows GUI skeleton is:

```text
setup-wizard.ps1
setup-wizard.xaml
lib/SetupWizard.psm1
```

Run it on Windows PowerShell 5.1+ from this folder:

```powershell
.\setup-wizard.ps1
```

Phase A only opens the WPF stepper window and loads the full setup step model.
It has no install actions, file copying, archive extraction, SD-card flashing,
SSH commands, or process launch behavior.

## Phase B File Validation

The Validate Files step now uses:

```text
lib/InstallFileChecks.psm1
```

It checks the Windows Etcher installer, shared ev3dev image, Windows internal
release evidence zip, receipt JSON, expected zip entries, setup XAML, Windows
service XML, and required EV3 server files. This step does not install files,
copy files, extract archives, flash SD cards, run SSH, or start WeisileLink.

On macOS, the repository can verify the validation plan with static tests,
hash checks, zip entry checks, JSON parsing, and XAML/XML parsing. The actual
WPF window behavior still needs a Windows PowerShell 5.1 smoke run for visual
and click-flow accuracy.

## Phase C Desktop Install Preparation

The Install WeisileLink Desktop step now uses:

```text
lib/WindowsInstallActions.psm1
```

It expands the Windows internal evidence bundle into a temporary staging folder,
locates `WeisileLink.exe`, `install.ps1`, `uninstall.ps1`, service metadata,
the manifest, and the nested unsigned release zip, then shows the intended
target root for teacher review. This preparation step requires manual
confirmation before any install action.

This phase does not copy files into `%LocalAppData%`, does not call
`install-windows.ps1`, does not start WeisileLink, and does not mark the
unsigned internal build as production ready.

On macOS, the repository can verify the evidence zip extraction and module
structure. The final click-flow and Windows staging behavior still need a
Windows PowerShell 5.1 smoke run.

## Phase C Desktop Install Confirmation

After staging passes, the wizard shows a dedicated `Confirm Install` control
for the WeisileLink Desktop step. Selecting the step prepares the package only;
clicking `Confirm Install` is the explicit teacher confirmation that copies the
staged package into the configured Windows install root and runs the Windows
helper on Windows.

The confirmed execution path verifies that the copied helper and service
metadata point to `desktop-supervise` with localhost defaults:

```text
127.0.0.1:20111
127.0.0.1:8766
```

The helper still uses the unsigned internal package only, and the wizard keeps
production release readiness set to false until signed artifacts and
clean-machine Windows evidence are collected.

On macOS, automated tests can verify the evidence bundle, copy the staged
package into a clean temporary install root, and inspect startup metadata. The
Windows WPF visual flow and actual helper execution still require a Windows
PowerShell 5.1 smoke run.

## Phase G Local Bridge Verification

The `Start and Verify Local Bridge` step starts or detects WeisileLink.exe desktop-supervise
on the Windows teacher computer. It first checks whether the localhost endpoints
are already responding:

```text
127.0.0.1:20111
127.0.0.1:8766
```

If both endpoints already respond, the wizard records the bridge as already
running. If either endpoint is not available, the wizard starts
`WeisileLink.exe desktop-supervise --host 127.0.0.1 --port 20111 --trainer-port
8766`, then polls both ports until they pass or the step blocks with evidence.

This phase is a real Windows runtime check, not a manual placeholder. On macOS,
static and PowerShell Core tests can verify the command plan and module shape,
but the actual `WeisileLink.exe` launch must be validated on Windows.

## Phase D EV3 Guided Setup

The EV3 setup steps now use:

```text
lib/Ev3ConnectionChecks.psm1
```

The wizard exposes WiFi Full VSLE, Bluetooth Full VSLE, and USB-assisted setup
inputs, plus SSH host, SSH user, and Bluetooth address fields. The default SSH
user is `robot`. The EV3 SSH password is not stored or written into wizard
evidence; Windows/OpenSSH authentication is handled outside the saved report.

Teacher-facing input guidance shown in the wizard:

1. For WiFi Full VSLE, try `ev3dev.local` as the EV3 SSH address first.
2. If `ev3dev.local` does not connect, read the IP address from the EV3
   Brickman network information screen and enter that IP as the EV3 SSH address.
3. Use `robot` as the SSH user.
4. Use the default EV3 SSH password `maker` only when Windows/OpenSSH asks for
   it; the wizard does not store it.
5. For Bluetooth Full VSLE, confirm Windows has built-in Bluetooth or a USB
   Bluetooth adapter.
6. Read the EV3 Bluetooth address from the EV3 Bluetooth settings, or SSH into
   EV3 and run `hciconfig -a | grep "BD Address"`.
7. Pair from Windows Settings > Bluetooth & devices > Add device.

The `Install EV3 server` step generates a guarded SSH/SCP command plan that
copies the EV3SC-owned server files and offline `websockets-7.0.tar.gz`, then
runs:

```text
SKIP_PIP_INSTALL=1 ./scripts/install.sh
systemctl is-active vsle-ev3-server.service
```

The command sequence runs only after the teacher clicks `Confirm EV3 Install`.
Bluetooth Full VSLE remains an ev3dev + VSLE server path, and the wizard keeps
official-firmware Bluetooth separate from Full VSLE.

On macOS, automated validation can check the input model, command plan, source
file paths, XAML structure, and redaction boundaries. Real USB/WiFi SSH install
and Windows Bluetooth pairing still require a Windows machine and real EV3
hardware smoke.

## Windows WPF Smoke

The WPF wizard smoke runner is:

```text
run-wpf-smoke.ps1
```

Run it from this folder on a Windows computer with Windows PowerShell 5.1:

```powershell
.\run-wpf-smoke.ps1 -OutputPath .\03-evidence-templates\windows-setup-wizard-wpf-smoke.local.json
```

The runner imports the setup modules, loads `setup-wizard.xaml` through WPF,
checks the key stepper controls, verifies the manual confirmation controls are
present, and writes JSON evidence. It does not call `ShowDialog`, does not run
installer actions, does not connect to EV3 hardware, and never records pairing
tokens, passwords, or API keys.

The template for the expected evidence shape is:

```text
03-evidence-templates/windows-setup-wizard-wpf-smoke.template.json
```

On macOS, PowerShell Core can run the script only as a compatibility guard. It
will write blocked evidence that says the WPF smoke requires Windows PowerShell
5.1; it cannot validate real WPF rendering or click-flow behavior on macOS.

## SD Card

This step flashes, or installs, the ev3dev system onto the EV3 microSD card.
The target disk must be selected manually in Etcher so Windows cannot
accidentally overwrite the teacher computer's system disk.

`01-sd-card/` contains the Windows Etcher installer:

```text
balenaEtcher-Setup-1.17.0.exe
```

The EV3 image is shared with macOS:

```text
../shared/01-ev3-sd-card/ev3dev-stretch-ev3-generic-2020-04-10.zip
```

Teacher-facing flow:

1. Insert the microSD card into the Windows computer; keep it out of the EV3.
2. Open Balena Etcher.
3. Choose `Flash from file`.
4. Select the shared ev3dev zip image.
5. Select the external microSD card as the target.
6. Confirm the target is not the Windows system disk or another hard drive.
7. Click `Flash`.
8. Wait for Etcher to show `Flash Complete`.
9. Safely eject the SD card before inserting it into the EV3.

## WeisileLink Desktop

`02-weisilelink-desktop/` contains:

```text
windows-internal-release-evidence.zip
windows-internal-release-download-receipt.json
install-windows.ps1
uninstall-windows.ps1
build-release-windows.ps1
weisile-link-service.xml
```

The evidence zip includes the unsigned internal Windows release bundle,
`WeisileLink.exe`, install helpers, and release evidence. It is internal testing
only. It is not a signed production classroom installer.

To inspect the bundle on Windows:

```powershell
Expand-Archive .\windows-internal-release-evidence.zip .\windows-internal-release-evidence
```

The nested internal release zip is:

```text
desktop/release/internal/windows/WeisileLink-windows-0.1.0-internal-unsigned.zip
```

## Evidence Template

`03-evidence-templates/windows-vsle-bluetooth-install-smoke.template.json` is
the Windows release-artifact smoke template for Full VSLE Bluetooth.
