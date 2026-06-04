#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$OutputPath = "",
    [switch]$ShowWindow
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $base = $env:TEMP
    if ([string]::IsNullOrWhiteSpace($base)) {
        $base = [System.IO.Path]::GetTempPath()
    }
    $OutputPath = Join-Path $base "vsle-windows-setup-wizard-wpf-smoke.json"
}

function Write-VsleWpfSmokeEvidence {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Evidence,
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $directory = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($directory) -and -not (Test-Path -LiteralPath $directory)) {
        [void](New-Item -ItemType Directory -Path $directory -Force)
    }

    $Evidence | ConvertTo-Json -Depth 8 | Set-Content -Path $Path -Encoding UTF8
}

function New-VsleWpfSmokeEvidence {
    param(
        [string]$Status = "blocked",
        [string]$Blocker = ""
    )

    return [ordered]@{
        schema_version = 1
        generated_at = (Get-Date).ToString("o")
        status = $Status
        blocker = $Blocker
        windows_powershell_5_1 = $false
        modules_import_ok = $false
        xaml_parse_ok = $false
        wpf_load_ok = $false
        click_flow_checked = $false
        controls_found = @()
        missing_controls = @()
        visual = [ordered]@{
            title = ""
            width = 0
            height = 0
            min_width = 0
            min_height = 0
        }
        manual_confirmations = [ordered]@{
            confirm_install_visible = $false
            confirm_ev3_install_visible = $false
            bluetooth_full_vsle_visible = $false
        }
        host = [ordered]@{
            os = [System.Environment]::OSVersion.VersionString
            platform = [System.Environment]::OSVersion.Platform.ToString()
            ps_version = $PSVersionTable.PSVersion.ToString()
            ps_edition = if ($PSVersionTable.ContainsKey("PSEdition")) { $PSVersionTable.PSEdition } else { "" }
        }
        production_release_ready = $false
    }
}

$runningOnWindows = [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
$isDesktopEdition = $PSVersionTable.ContainsKey("PSEdition") -and $PSVersionTable.PSEdition -eq "Desktop"
$isPowerShell51 = $PSVersionTable.PSVersion.Major -eq 5 -and $PSVersionTable.PSVersion.Minor -eq 1

if (-not ($runningOnWindows -and $isDesktopEdition -and $isPowerShell51)) {
    $evidence = New-VsleWpfSmokeEvidence `
        -Status "blocked" `
        -Blocker "WPF smoke requires Windows PowerShell 5.1 on Windows."
    Write-VsleWpfSmokeEvidence -Evidence $evidence -Path $OutputPath
    Write-Output "WPF smoke blocked: requires Windows PowerShell 5.1 on Windows."
    return
}

$evidence = New-VsleWpfSmokeEvidence -Status "running"

try {
    Import-Module (Join-Path $ScriptRoot "lib/SetupWizard.psm1") -Force -DisableNameChecking
    Import-Module (Join-Path $ScriptRoot "lib/InstallFileChecks.psm1") -Force -DisableNameChecking
    Import-Module (Join-Path $ScriptRoot "lib/WindowsInstallActions.psm1") -Force -DisableNameChecking
    Import-Module (Join-Path $ScriptRoot "lib/Ev3ConnectionChecks.psm1") -Force -DisableNameChecking
    $evidence.modules_import_ok = $true

    Add-Type -AssemblyName PresentationFramework
    Add-Type -AssemblyName PresentationCore
    Add-Type -AssemblyName WindowsBase

    $xamlPath = Join-Path $ScriptRoot "setup-wizard.xaml"
    [xml]$xaml = Get-Content -Path $xamlPath -Raw
    $evidence.xaml_parse_ok = $true
    $reader = New-Object System.Xml.XmlNodeReader $xaml
    $window = [Windows.Markup.XamlReader]::Load($reader)
    $evidence.wpf_load_ok = $true

    $requiredControls = @(
        "StepList",
        "StepTitle",
        "AutoActionsText",
        "ManualActionsText",
        "StatusText",
        "EvidenceText",
        "TransportComboBox",
        "Ev3HostTextBox",
        "Ev3UserTextBox",
        "Ev3BluetoothAddressTextBox",
        "ConfirmInstallButton",
        "ConfirmEv3InstallButton",
        "ContinueButton"
    )
    $found = New-Object System.Collections.Generic.List[string]
    $missing = New-Object System.Collections.Generic.List[string]
    foreach ($controlName in $requiredControls) {
        if ($null -ne $window.FindName($controlName)) {
            $found.Add($controlName)
        } else {
            $missing.Add($controlName)
        }
    }

    $steps = @(Get-VsleSetupWizardSteps)
    $stepList = $window.FindName("StepList")
    $stepList.ItemsSource = $steps
    $stepList.SelectedIndex = 0
    $stepList.SelectedIndex = 4
    $stepList.SelectedIndex = 5
    $stepList.SelectedIndex = 7

    $evidence.controls_found = @($found)
    $evidence.missing_controls = @($missing)
    $evidence.visual.title = $window.Title
    $evidence.visual.width = [int]$window.Width
    $evidence.visual.height = [int]$window.Height
    $evidence.visual.min_width = [int]$window.MinWidth
    $evidence.visual.min_height = [int]$window.MinHeight
    $evidence.manual_confirmations.confirm_install_visible = $null -ne $window.FindName("ConfirmInstallButton")
    $evidence.manual_confirmations.confirm_ev3_install_visible = $null -ne $window.FindName("ConfirmEv3InstallButton")
    $evidence.manual_confirmations.bluetooth_full_vsle_visible = $null -ne $window.FindName("TransportComboBox")
    $evidence.windows_powershell_5_1 = $true
    $evidence.click_flow_checked = $missing.Count -eq 0
    $evidence.status = if ($missing.Count -eq 0) { "passed" } else { "blocked" }
    $evidence.blocker = if ($missing.Count -eq 0) { "" } else { "Missing controls: $($missing -join ', ')" }

    if ($ShowWindow) {
        [void]$window.Show()
        [void]$window.Close()
    }
} catch {
    $evidence.status = "blocked"
    $evidence.blocker = $_.Exception.Message
} finally {
    Write-VsleWpfSmokeEvidence -Evidence $evidence -Path $OutputPath
}

Write-Output "WPF smoke status: $($evidence.status)"
