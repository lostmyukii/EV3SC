#requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ModulePath = Join-Path $ScriptRoot "lib/SetupWizard.psm1"
$InstallChecksModulePath = Join-Path $ScriptRoot "lib/InstallFileChecks.psm1"
$WindowsInstallActionsModulePath = Join-Path $ScriptRoot "lib/WindowsInstallActions.psm1"
$Ev3ConnectionChecksModulePath = Join-Path $ScriptRoot "lib/Ev3ConnectionChecks.psm1"
$XamlPath = Join-Path $ScriptRoot "setup-wizard.xaml"
$Script:VlseLastDesktopInstallPlan = $null
$Script:VlseLastEv3InstallPlan = $null

Import-Module $ModulePath -Force
Import-Module $InstallChecksModulePath -Force
Import-Module $WindowsInstallActionsModulePath -Force
Import-Module $Ev3ConnectionChecksModulePath -Force

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

function ConvertTo-BulletText {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Items
    )

    return ($Items | ForEach-Object { "- $_" }) -join [Environment]::NewLine
}

function Set-CurrentStep {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window,
        [Parameter(Mandatory = $true)]
        [object]$Step
    )

    $Window.FindName("StepTitle").Text = $Step.Title
    $Window.FindName("StepSummary").Text = $Step.Summary
    $Window.FindName("AutoActionsText").Text = ConvertTo-BulletText -Items $Step.AutomaticActions
    $Window.FindName("ManualActionsText").Text = ConvertTo-BulletText -Items $Step.ManualActions
    $Window.FindName("StatusText").Text = "Status: $($Step.Status); blocking: $($Step.Blocking); next: $($Step.NextEnabledWhen)"
    $Window.FindName("EvidenceText").Text = $Step.Evidence
    $Window.FindName("ContinueButton").IsEnabled = -not ($Step.Status -eq "blocked")

    $ev3SetupPanel = $Window.FindName("Ev3SetupPanel")
    if ($null -ne $ev3SetupPanel) {
        $showEv3Setup = $Step.Id -in @(
            "choose-transport",
            "install-ev3-server",
            "enable-bluetooth-full-vsle"
        )
        if ($showEv3Setup) {
            $ev3SetupPanel.Visibility = "Visible"
        } else {
            $ev3SetupPanel.Visibility = "Collapsed"
        }
    }

    $confirmInstallButton = $Window.FindName("ConfirmInstallButton")
    if ($null -ne $confirmInstallButton) {
        $showConfirmInstall = (
            $Step.Id -eq "install-weisilelink-desktop" -and
            $Step.Status -eq "needs_manual_action"
        )
        if ($showConfirmInstall) {
            $confirmInstallButton.Visibility = "Visible"
            $confirmInstallButton.IsEnabled = $true
        } else {
            $confirmInstallButton.Visibility = "Collapsed"
            $confirmInstallButton.IsEnabled = $false
        }
    }

    $confirmEv3InstallButton = $Window.FindName("ConfirmEv3InstallButton")
    if ($null -ne $confirmEv3InstallButton) {
        $showConfirmEv3Install = (
            $Step.Id -eq "install-ev3-server" -and
            $Step.Status -eq "needs_manual_action"
        )
        if ($showConfirmEv3Install) {
            $confirmEv3InstallButton.Visibility = "Visible"
            $confirmEv3InstallButton.IsEnabled = $true
        } else {
            $confirmEv3InstallButton.Visibility = "Collapsed"
            $confirmEv3InstallButton.IsEnabled = $false
        }
    }
}

function Update-VsleValidateFilesStep {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window,
        [Parameter(Mandatory = $true)]
        [object]$Result
    )

    $step = Set-VsleSetupWizardStepResult `
        -Id "validate-files" `
        -Status $Result.Status `
        -Summary $Result.Summary `
        -Evidence $Result.Evidence `
        -Blocking $Result.Blocking

    $StepList = $Window.FindName("StepList")
    $StepList.Items.Refresh()
    Set-CurrentStep -Window $Window -Step $step
}

function Run-VsleValidateFilesStep {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window
    )

    $runningStep = Set-VsleSetupWizardStepResult `
        -Id "validate-files" `
        -Status "running" `
        -Summary "Checking hashes, JSON, XML, and Windows release zip entries." `
        -Evidence "Validation is running." `
        -Blocking $true
    $StepList = $Window.FindName("StepList")
    $StepList.Items.Refresh()
    Set-CurrentStep -Window $Window -Step $runningStep

    try {
        $installRoot = (Resolve-Path (Join-Path $ScriptRoot "..")).Path
        $result = Invoke-VsleInstallFileChecks -InstallRoot $installRoot
    } catch {
        $result = [PSCustomObject]@{
            Status = "blocked"
            Blocking = $true
            Summary = "Install file validation failed before completing."
            Evidence = $_.Exception.Message
        }
    }

    Update-VsleValidateFilesStep -Window $Window -Result $result
}

function Update-VsleDesktopInstallStep {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window,
        [Parameter(Mandatory = $true)]
        [object]$Result
    )

    $step = Set-VsleSetupWizardStepResult `
        -Id "install-weisilelink-desktop" `
        -Status $Result.Status `
        -Summary $Result.Summary `
        -Evidence $Result.Evidence `
        -Blocking $Result.Blocking

    $StepList = $Window.FindName("StepList")
    $StepList.Items.Refresh()
    Set-CurrentStep -Window $Window -Step $step
}

function Run-VslePrepareDesktopInstallStep {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window
    )

    $runningStep = Set-VsleSetupWizardStepResult `
        -Id "install-weisilelink-desktop" `
        -Status "running" `
        -Summary "Preparing Windows Desktop package staging." `
        -Evidence "Expanding Windows evidence bundle into a temporary staging directory." `
        -Blocking $true
    $StepList = $Window.FindName("StepList")
    $StepList.Items.Refresh()
    Set-CurrentStep -Window $Window -Step $runningStep

    try {
        $installRoot = (Resolve-Path (Join-Path $ScriptRoot "..")).Path
        $result = Prepare-VsleWindowsDesktopInstallStaging -InstallRoot $installRoot -Force
        $Script:VlseLastDesktopInstallPlan = $result.Plan
    } catch {
        $plan = Get-VsleWindowsDesktopInstallPlan
        $result = New-VsleWindowsDesktopInstallConfirmation -Plan $plan
        $result.Status = "blocked"
        $result.Blocking = $true
        $result.Summary = "Windows Desktop staging failed before install confirmation."
        $result.Evidence = $_.Exception.Message
        $Script:VlseLastDesktopInstallPlan = $plan
    }

    Update-VsleDesktopInstallStep -Window $Window -Result $result
}

function Run-VsleConfirmDesktopInstallStep {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window
    )

    $runningStep = Set-VsleSetupWizardStepResult `
        -Id "install-weisilelink-desktop" `
        -Status "running" `
        -Summary "Installing WeisileLink Desktop after teacher confirmation." `
        -Evidence "Copying the staged package, running the Windows helper, and verifying the startup command." `
        -Blocking $true
    $StepList = $Window.FindName("StepList")
    $StepList.Items.Refresh()
    Set-CurrentStep -Window $Window -Step $runningStep

    try {
        if ($null -eq $Script:VlseLastDesktopInstallPlan) {
            $installRoot = (Resolve-Path (Join-Path $ScriptRoot "..")).Path
            $prepareResult = Prepare-VsleWindowsDesktopInstallStaging -InstallRoot $installRoot -Force
            $Script:VlseLastDesktopInstallPlan = $prepareResult.Plan
        }

        $result = Invoke-VsleWindowsDesktopInstallExecution `
            -Plan $Script:VlseLastDesktopInstallPlan `
            -ConfirmInstall `
            -RunInstallHelper `
            -Force
    } catch {
        $plan = $Script:VlseLastDesktopInstallPlan
        if ($null -eq $plan) {
            $plan = Get-VsleWindowsDesktopInstallPlan
        }
        $result = [PSCustomObject]@{
            Status = "blocked"
            Blocking = $true
            ManualConfirmationRequired = $true
            Summary = "Windows Desktop install failed after confirmation."
            Evidence = $_.Exception.Message
            Plan = $plan
        }
    }

    Update-VsleDesktopInstallStep -Window $Window -Result $result
}

function Get-VsleSelectedTransportValue {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window
    )

    $transportComboBox = $Window.FindName("TransportComboBox")
    if ($null -eq $transportComboBox -or $null -eq $transportComboBox.SelectedItem) {
        return "wifi-full-vsle"
    }

    $selected = $transportComboBox.SelectedItem
    if ($null -ne $selected.Tag) {
        return [string]$selected.Tag
    }

    return "wifi-full-vsle"
}

function Get-VsleEv3SetupInputFromWindow {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window
    )

    return New-VsleEv3SetupInput `
        -Transport (Get-VsleSelectedTransportValue -Window $Window) `
        -Host $Window.FindName("Ev3HostTextBox").Text `
        -User $Window.FindName("Ev3UserTextBox").Text `
        -BluetoothAddress $Window.FindName("Ev3BluetoothAddressTextBox").Text
}

function Update-VsleEv3SetupStep {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window,
        [Parameter(Mandatory = $true)]
        [string]$StepId,
        [Parameter(Mandatory = $true)]
        [object]$Result
    )

    $step = Set-VsleSetupWizardStepResult `
        -Id $StepId `
        -Status $Result.Status `
        -Summary $Result.Summary `
        -Evidence $Result.Evidence `
        -Blocking $Result.Blocking

    $StepList = $Window.FindName("StepList")
    $StepList.Items.Refresh()
    Set-CurrentStep -Window $Window -Step $step
}

function Run-VslePrepareEv3SetupStep {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window,
        [Parameter(Mandatory = $true)]
        [string]$StepId
    )

    $input = Get-VsleEv3SetupInputFromWindow -Window $Window
    if ($StepId -eq "choose-transport") {
        $result = Test-VsleEv3SetupInput -Input $input
        Update-VsleEv3SetupStep -Window $Window -StepId $StepId -Result $result
        return
    }

    if ($StepId -eq "enable-bluetooth-full-vsle") {
        $result = New-VsleBluetoothFullVslePairingGuide -Input $input
        Update-VsleEv3SetupStep -Window $Window -StepId $StepId -Result $result
        return
    }

    $installRoot = (Resolve-Path (Join-Path $ScriptRoot "..")).Path
    $result = New-VsleEv3ServerInstallPlan -Input $input -InstallRoot $installRoot
    if ($result.PSObject.Properties.Name -contains "CommandSteps") {
        $Script:VlseLastEv3InstallPlan = $result
    }

    Update-VsleEv3SetupStep -Window $Window -StepId $StepId -Result $result
}

function Run-VsleConfirmEv3ServerInstallStep {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window
    )

    $runningStep = Set-VsleSetupWizardStepResult `
        -Id "install-ev3-server" `
        -Status "running" `
        -Summary "Running EV3 server install after teacher confirmation." `
        -Evidence "Running the guarded SSH/SCP install command sequence." `
        -Blocking $true
    $StepList = $Window.FindName("StepList")
    $StepList.Items.Refresh()
    Set-CurrentStep -Window $Window -Step $runningStep

    try {
        if ($null -eq $Script:VlseLastEv3InstallPlan) {
            $installRoot = (Resolve-Path (Join-Path $ScriptRoot "..")).Path
            $input = Get-VsleEv3SetupInputFromWindow -Window $Window
            $Script:VlseLastEv3InstallPlan = New-VsleEv3ServerInstallPlan -Input $input -InstallRoot $installRoot
        }

        $result = Invoke-VsleEv3ServerInstall `
            -Plan $Script:VlseLastEv3InstallPlan `
            -ConfirmEv3Install `
            -RunSshCommands
    } catch {
        $result = [PSCustomObject]@{
            Status = "blocked"
            Blocking = $true
            ManualConfirmationRequired = $true
            Summary = "EV3 server install failed after confirmation."
            Evidence = $_.Exception.Message
            Plan = $Script:VlseLastEv3InstallPlan
        }
    }

    Update-VsleEv3SetupStep -Window $Window -StepId "install-ev3-server" -Result $result
}

function Open-VsleSetupWizard {
    [CmdletBinding()]
    param()

    [xml]$xaml = Get-Content -Path $XamlPath -Raw
    $reader = New-Object System.Xml.XmlNodeReader $xaml
    $window = [Windows.Markup.XamlReader]::Load($reader)

    $steps = @(Get-VsleSetupWizardSteps)
    $stepList = $window.FindName("StepList")
    $stepList.ItemsSource = $steps
    $stepList.SelectedIndex = 0

    $progress = Get-VsleSetupWizardProgress
    $window.FindName("ProgressText").Text = "Phase A shell: $($progress.TotalSteps) steps loaded; no install actions run."

    $stepList.Add_SelectionChanged({
        if ($null -ne $stepList.SelectedItem) {
            if ($stepList.SelectedItem.Id -eq "validate-files" -and $stepList.SelectedItem.Status -in @("pending", "blocked", "warning")) {
                Run-VsleValidateFilesStep -Window $window
                return
            }
            if ($stepList.SelectedItem.Id -eq "install-weisilelink-desktop" -and $stepList.SelectedItem.Status -in @("pending", "blocked", "warning")) {
                Run-VslePrepareDesktopInstallStep -Window $window
                return
            }
            if ($stepList.SelectedItem.Id -in @("choose-transport", "install-ev3-server", "enable-bluetooth-full-vsle")) {
                Run-VslePrepareEv3SetupStep -Window $window -StepId $stepList.SelectedItem.Id
                return
            }
            Set-CurrentStep -Window $window -Step $stepList.SelectedItem
        }
    })

    $window.FindName("RetryButton").Add_Click({
        if ($null -ne $stepList.SelectedItem -and $stepList.SelectedItem.Id -eq "validate-files") {
            Run-VsleValidateFilesStep -Window $window
        }
        if ($null -ne $stepList.SelectedItem -and $stepList.SelectedItem.Id -eq "install-weisilelink-desktop") {
            Run-VslePrepareDesktopInstallStep -Window $window
        }
        if ($null -ne $stepList.SelectedItem -and $stepList.SelectedItem.Id -in @("choose-transport", "install-ev3-server", "enable-bluetooth-full-vsle")) {
            Run-VslePrepareEv3SetupStep -Window $window -StepId $stepList.SelectedItem.Id
        }
    })

    $window.FindName("ConfirmInstallButton").Add_Click({
        if ($null -ne $stepList.SelectedItem -and $stepList.SelectedItem.Id -eq "install-weisilelink-desktop") {
            Run-VsleConfirmDesktopInstallStep -Window $window
        }
    })

    $window.FindName("ConfirmEv3InstallButton").Add_Click({
        if ($null -ne $stepList.SelectedItem -and $stepList.SelectedItem.Id -eq "install-ev3-server") {
            Run-VsleConfirmEv3ServerInstallStep -Window $window
        }
    })

    Set-CurrentStep -Window $window -Step $steps[0]
    [void]$window.ShowDialog()
}

Open-VsleSetupWizard
