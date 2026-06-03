#requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ModulePath = Join-Path $ScriptRoot "lib/SetupWizard.psm1"
$XamlPath = Join-Path $ScriptRoot "setup-wizard.xaml"

Import-Module $ModulePath -Force

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
            Set-CurrentStep -Window $window -Step $stepList.SelectedItem
        }
    })

    Set-CurrentStep -Window $window -Step $steps[0]
    [void]$window.ShowDialog()
}

Open-VsleSetupWizard
