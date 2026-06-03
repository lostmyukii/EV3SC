# Windows Installation Files

Use this folder on a Windows teacher computer or Windows build host.

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

## SD Card

`01-sd-card/` contains the Windows Etcher installer:

```text
balenaEtcher-Setup-1.17.0.exe
```

The EV3 image is shared with macOS:

```text
../shared/01-ev3-sd-card/ev3dev-stretch-ev3-generic-2020-04-10.zip
```

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
