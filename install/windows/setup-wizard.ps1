#requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ModulePath = Join-Path $ScriptRoot "lib/SetupWizard.psm1"
$InstallChecksModulePath = Join-Path $ScriptRoot "lib/InstallFileChecks.psm1"
$XamlPath = Join-Path $ScriptRoot "setup-wizard.xaml"

Import-Module $ModulePath -Force
Import-Module $InstallChecksModulePath -Force

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
            Set-CurrentStep -Window $window -Step $stepList.SelectedItem
        }
    })

    $window.FindName("RetryButton").Add_Click({
        if ($null -ne $stepList.SelectedItem -and $stepList.SelectedItem.Id -eq "validate-files") {
            Run-VsleValidateFilesStep -Window $window
        }
    })

    Set-CurrentStep -Window $window -Step $steps[0]
    [void]$window.ShowDialog()
}

Open-VsleSetupWizard
