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
$Script:VlseManualConfirmationChecked = @{}

Import-Module $ModulePath -Force -DisableNameChecking
Import-Module $InstallChecksModulePath -Force -DisableNameChecking
Import-Module $WindowsInstallActionsModulePath -Force -DisableNameChecking
Import-Module $Ev3ConnectionChecksModulePath -Force -DisableNameChecking

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

function Get-VsleObjectPropertyValue {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Object,
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [object]$DefaultValue = $null
    )

    if ($null -ne $Object -and $Object.PSObject.Properties.Name -contains $Name) {
        return $Object.PSObject.Properties[$Name].Value
    }

    return $DefaultValue
}

function Convert-VsleStatusToChineseLabel {
    param(
        [string]$Status
    )

    switch ($Status) {
        "pending" { "待检查" }
        "running" { "检查中" }
        "needs_manual_action" { "需要手动确认" }
        "needs_input" { "需要填写信息" }
        "passed" { "已通过" }
        "warning" { "需要确认" }
        "blocked" { "失败" }
        "skipped" { "已跳过" }
        default { $Status }
    }
}

function Convert-VsleCheckItemsForDisplay {
    param(
        [object[]]$CheckItems
    )

    return @($CheckItems | ForEach-Object {
        [PSCustomObject]@{
            Name = [string](Get-VsleObjectPropertyValue -Object $_ -Name "Name" -DefaultValue "检查项")
            Status = Convert-VsleStatusToChineseLabel -Status ([string](Get-VsleObjectPropertyValue -Object $_ -Name "Status" -DefaultValue "pending"))
            Detail = [string](Get-VsleObjectPropertyValue -Object $_ -Name "Detail" -DefaultValue "")
        }
    })
}

function Convert-VsleManualConfirmationsForDisplay {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Step
    )

    $confirmations = @(Get-VsleObjectPropertyValue -Object $Step -Name "ManualConfirmations" -DefaultValue @())
    return @($confirmations | ForEach-Object {
        $id = [string](Get-VsleObjectPropertyValue -Object $_ -Name "Id" -DefaultValue "")
        $key = "$($Step.Id)|$id"
        [PSCustomObject]@{
            Key = $key
            Id = $id
            Label = [string](Get-VsleObjectPropertyValue -Object $_ -Name "Label" -DefaultValue "我已确认此项已完成。")
            Required = [bool](Get-VsleObjectPropertyValue -Object $_ -Name "Required" -DefaultValue $true)
            Checked = $Script:VlseManualConfirmationChecked.ContainsKey($key) -and [bool]$Script:VlseManualConfirmationChecked[$key]
        }
    })
}

function Get-VsleManualConfirmationProgress {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Step
    )

    $confirmations = @(Get-VsleObjectPropertyValue -Object $Step -Name "ManualConfirmations" -DefaultValue @())
    $requiredConfirmations = @($confirmations | Where-Object {
        [bool](Get-VsleObjectPropertyValue -Object $_ -Name "Required" -DefaultValue $true)
    })
    $requiredTotalCount = $requiredConfirmations.Count
    $requiredCheckedCount = 0
    foreach ($confirmation in $requiredConfirmations) {
        $id = [string](Get-VsleObjectPropertyValue -Object $confirmation -Name "Id" -DefaultValue "")
        $key = "$($Step.Id)|$id"
        if ($Script:VlseManualConfirmationChecked.ContainsKey($key) -and [bool]$Script:VlseManualConfirmationChecked[$key]) {
            $requiredCheckedCount += 1
        }
    }

    $percent = if ($requiredTotalCount -eq 0) {
        [int](Get-VsleObjectPropertyValue -Object $Step -Name "StepProgressPercent" -DefaultValue 0)
    } else {
        [int][Math]::Round(($requiredCheckedCount / $requiredTotalCount) * 100)
    }

    return [PSCustomObject]@{
        HasRequiredItems = $requiredTotalCount -gt 0
        requiredCheckedCount = $requiredCheckedCount
        requiredTotalCount = $requiredTotalCount
        Percent = $percent
        Complete = ($requiredTotalCount -gt 0 -and $requiredCheckedCount -eq $requiredTotalCount)
    }
}

function Set-VsleManualConfirmationStateFromKey {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Key,
        [Parameter(Mandatory = $true)]
        [bool]$Checked
    )

    $Script:VlseManualConfirmationChecked[$Key] = $Checked
}

function Get-VsleVisualChildren {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Parent
    )

    $children = @()
    $count = [System.Windows.Media.VisualTreeHelper]::GetChildrenCount($Parent)
    for ($index = 0; $index -lt $count; $index += 1) {
        $child = [System.Windows.Media.VisualTreeHelper]::GetChild($Parent, $index)
        $children += $child
        $children += Get-VsleVisualChildren -Parent $child
    }
    return $children
}

function Register-VsleManualConfirmationCheckboxHandlers {
    param(
        [Parameter(Mandatory = $true)]
        [object]$ListBox,
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window,
        [Parameter(Mandatory = $true)]
        [object]$StepList
    )

    [void]$ListBox.UpdateLayout()
    $checkboxes = @(Get-VsleVisualChildren -Parent $ListBox | Where-Object { $_ -is [System.Windows.Controls.CheckBox] })
    foreach ($checkbox in $checkboxes) {
        if ($checkbox.Tag -and -not $checkbox.Tag.ToString().EndsWith("|")) {
            $checkbox.Add_Checked({
                param($sender, $eventArgs)
                Set-VsleManualConfirmationStateFromKey -Key ([string]$sender.Tag) -Checked $true
                Update-VsleManualConfirmationProgress -Window $Window -StepList $StepList
            })
            $checkbox.Add_Unchecked({
                param($sender, $eventArgs)
                Set-VsleManualConfirmationStateFromKey -Key ([string]$sender.Tag) -Checked $false
                Update-VsleManualConfirmationProgress -Window $Window -StepList $StepList
            })
        }
    }
}

function Update-VsleManualConfirmationProgress {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window,
        [Parameter(Mandatory = $true)]
        [object]$StepList
    )

    if ($null -eq $StepList.SelectedItem) {
        return
    }

    $step = $StepList.SelectedItem
    $manualProgress = Get-VsleManualConfirmationProgress -Step $step
    if (-not $manualProgress.HasRequiredItems) {
        return
    }

    $status = if ($manualProgress.Complete) { "passed" } else { "needs_manual_action" }
    $blocking = -not $manualProgress.Complete
    $updatedStep = Set-VsleSetupWizardStepResult `
        -Id $step.Id `
        -Status $status `
        -Summary $step.Summary `
        -Evidence "人工确认进度：$($manualProgress.requiredCheckedCount) / $($manualProgress.requiredTotalCount)。" `
        -Blocking $blocking `
        -StepProgressPercent $manualProgress.Percent

    $StepList.Items.Refresh()
    Set-CurrentStep -Window $Window -Step $updatedStep
}

function New-VsleValidateFileCheckItemsForRunning {
    return @(
        @{ Name = "必需路径"; Status = "running"; Detail = "正在检查 EV3 server、安装脚本和 Windows helper 文件。" }
        @{ Name = "Etcher 与 ev3dev"; Status = "running"; Detail = "正在检查 Etcher 安装包和 ev3dev 镜像。" }
        @{ Name = "Windows release evidence"; Status = "running"; Detail = "正在检查 Windows 内测 release evidence。" }
        @{ Name = "JSON 证据模板"; Status = "running"; Detail = "正在解析 JSON 模板。" }
        @{ Name = "XAML 向导文件"; Status = "running"; Detail = "正在解析 WPF XAML。" }
        @{ Name = "Desktop release 内容"; Status = "running"; Detail = "正在检查 WeisileLink.exe 和 release zip 内容。" }
        @{ Name = "最终结果"; Status = "running"; Detail = "等待汇总所有安装文件检查结果。" }
    )
}

function New-VsleFileCheckItemFromResults {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [object[]]$Results
    )

    if ($Results.Count -eq 0) {
        return @{ Name = $Name; Status = "pending"; Detail = "没有可用的检查结果。" }
    }

    $blocked = @($Results | Where-Object { $_.Required -and -not $_.Passed })
    $warnings = @($Results | Where-Object { -not $_.Required -and -not $_.Passed })
    if ($blocked.Count -gt 0) {
        return @{
            Name = $Name
            Status = "blocked"
            Detail = ($blocked | ForEach-Object { "$($_.Name)：$($_.Message)" }) -join "；"
        }
    }
    if ($warnings.Count -gt 0) {
        return @{
            Name = $Name
            Status = "warning"
            Detail = ($warnings | ForEach-Object { "$($_.Name)：$($_.Message)" }) -join "；"
        }
    }

    return @{
        Name = $Name
        Status = "passed"
        Detail = "已通过：$($Results.Count) 项检查。"
    }
}

function New-VsleValidateFileCheckItemsFromResult {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Result
    )

    $results = @()
    if ($Result.PSObject.Properties.Name -contains "Results") {
        $results = @($Result.Results)
    }

    $items = @(
        New-VsleFileCheckItemFromResults -Name "必需路径" -Results @($results | Where-Object { $_.Category -eq "exists" })
        New-VsleFileCheckItemFromResults -Name "Etcher 与 ev3dev" -Results @($results | Where-Object { $_.Name -in @("Windows Etcher installer hash", "ev3dev EV3 image hash") })
        New-VsleFileCheckItemFromResults -Name "Windows release evidence" -Results @($results | Where-Object { $_.Name -in @("Windows internal release evidence hash", "Windows internal release receipt hash") })
        New-VsleFileCheckItemFromResults -Name "JSON 证据模板" -Results @($results | Where-Object { $_.Category -eq "json" })
        New-VsleFileCheckItemFromResults -Name "XAML 向导文件" -Results @($results | Where-Object { $_.Category -eq "xml" })
        New-VsleFileCheckItemFromResults -Name "Desktop release 内容" -Results @($results | Where-Object { $_.Category -eq "zip" })
    )

    $items += @{
        Name = "最终结果"
        Status = [string]$Result.Status
        Detail = [string]$Result.Summary
    }

    return $items
}

function Get-VsleSetupStepById {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Id
    )

    return Get-VsleSetupWizardSteps | Where-Object { $_.Id -eq $Id } | Select-Object -First 1
}

function Set-VsleStepProgress {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Id,
        [Parameter(Mandatory = $true)]
        [int]$ProgressPercent
    )

    $step = Get-VsleSetupStepById -Id $Id
    if ($null -eq $step) {
        throw "Unknown setup wizard step id: $Id"
    }

    return Set-VsleSetupWizardStepResult `
        -Id $Id `
        -Status $step.Status `
        -Summary $step.Summary `
        -Evidence $step.Evidence `
        -Blocking $step.Blocking `
        -StepProgressPercent ([Math]::Max(0, [Math]::Min(100, $ProgressPercent)))
}

function Set-VsleStepCheckItems {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Id,
        [Parameter(Mandatory = $true)]
        [object[]]$CheckItems
    )

    $step = Get-VsleSetupStepById -Id $Id
    if ($null -eq $step) {
        throw "Unknown setup wizard step id: $Id"
    }

    return Set-VsleSetupWizardStepResult `
        -Id $Id `
        -Status $step.Status `
        -Summary $step.Summary `
        -Evidence $step.Evidence `
        -Blocking $step.Blocking `
        -CheckItems $CheckItems
}

function Set-CurrentStep {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window,
        [Parameter(Mandatory = $true)]
        [object]$Step
    )

    $progress = Get-VsleSetupWizardProgress
    $Window.FindName("StepTitle").Text = $Step.Title
    $Window.FindName("StepSummary").Text = $Step.Summary
    $Window.FindName("AutoActionsText").Text = ConvertTo-BulletText -Items $Step.AutomaticActions
    $Window.FindName("ManualActionsText").Text = ConvertTo-BulletText -Items $Step.ManualActions
    $statusLabel = $Step.Status
    if ($Step.PSObject.Properties.Name -contains "StatusLabel") {
        $statusLabel = $Step.StatusLabel
    }
    $Window.FindName("StatusText").Text = "状态：$statusLabel；阻塞：$($Step.Blocking)；下一步：$($Step.NextEnabledWhen)"
    $Window.FindName("EvidenceText").Text = $Step.Evidence
    $Window.FindName("ProgressText").Text = "第 $([int]$Step.Number + 1) / $($progress.TotalSteps) 步"

    $manualProgress = Get-VsleManualConfirmationProgress -Step $Step
    $progressPercent = [int](Get-VsleObjectPropertyValue -Object $Step -Name "StepProgressPercent" -DefaultValue 0)
    if ($manualProgress.HasRequiredItems -and $Step.Status -ne "skipped") {
        $progressPercent = $manualProgress.Percent
    }
    $progressPercent = [Math]::Max(0, [Math]::Min(100, $progressPercent))
    $currentStepProgressBar = $Window.FindName("CurrentStepProgressBar")
    if ($null -ne $currentStepProgressBar) {
        $currentStepProgressBar.Value = $progressPercent
    }
    $currentStepProgressText = $Window.FindName("CurrentStepProgressText")
    if ($null -ne $currentStepProgressText) {
        $currentStepProgressText.Text = "$progressPercent%"
    }

    $completionConditionText = $Window.FindName("CompletionConditionText")
    if ($null -ne $completionConditionText) {
        $completionConditionText.Text = [string](Get-VsleObjectPropertyValue -Object $Step -Name "CompletionCondition" -DefaultValue $Step.NextEnabledWhen)
    }

    $hardwareLocationText = $Window.FindName("HardwareLocationText")
    if ($null -ne $hardwareLocationText) {
        $hardwareLocationText.Text = [string](Get-VsleObjectPropertyValue -Object $Step -Name "HardwareLocation" -DefaultValue "当前设备位置无特殊要求。")
    }

    $checkItemsList = $Window.FindName("CheckItemsList")
    if ($null -ne $checkItemsList) {
        $checkItems = @(Get-VsleObjectPropertyValue -Object $Step -Name "CheckItems" -DefaultValue @())
        $checkItemsList.ItemsSource = @(Convert-VsleCheckItemsForDisplay -CheckItems $checkItems)
        $checkItemsList.Items.Refresh()
    }

    $manualConfirmationsList = $Window.FindName("ManualConfirmationsList")
    $manualConfirmations = @(Convert-VsleManualConfirmationsForDisplay -Step $Step)
    if ($null -ne $manualConfirmationsList) {
        $manualConfirmationsList.ItemsSource = $manualConfirmations
        $manualConfirmationsList.Items.Refresh()
    }

    $manualConfirmationPinnedPanel = $Window.FindName("ManualConfirmationPinnedPanel")
    if ($null -ne $manualConfirmationPinnedPanel) {
        if ($manualConfirmations.Count -gt 0) {
            $manualConfirmationPinnedPanel.Visibility = "Visible"
        } else {
            $manualConfirmationPinnedPanel.Visibility = "Collapsed"
        }
    }

    $manualConfirmationProgressText = $Window.FindName("ManualConfirmationProgressText")
    if ($null -ne $manualConfirmationProgressText) {
        if ($manualProgress.HasRequiredItems) {
            $manualConfirmationProgressText.Text = "已确认 $($manualProgress.requiredCheckedCount) / $($manualProgress.requiredTotalCount) 项"
        } else {
            $manualConfirmationProgressText.Text = "本步无需勾选"
        }
    }

    $backButton = $Window.FindName("BackButton")
    if ($null -ne $backButton) {
        $backButton.IsEnabled = [int]$Step.Number -gt 0
    }

    $continueButton = $Window.FindName("ContinueButton")
    if ($null -ne $continueButton) {
        if ($manualProgress.HasRequiredItems -and $Step.Status -ne "skipped") {
            $continueButton.IsEnabled = $manualProgress.Complete
        } else {
            $continueButton.IsEnabled = (
                -not ($Step.Status -eq "blocked") -and
                [int]$Step.Number -lt ($progress.TotalSteps - 1)
            )
        }
    }

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

function Set-VsleWizardButtonError {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window,
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    $evidence = "按钮操作失败：$Message"
    $stepList = $Window.FindName("StepList")
    if ($null -ne $stepList -and $null -ne $stepList.SelectedItem) {
        $updatedStep = Set-VsleSetupWizardStepResult `
            -Id ([string]$stepList.SelectedItem.Id) `
            -Status "blocked" `
            -Summary "按钮操作失败。" `
            -Evidence $evidence `
            -Blocking $true
        $stepList.Items.Refresh()
        Set-CurrentStep -Window $Window -Step $updatedStep
        return
    }

    $Window.FindName("StatusText").Text = "状态：按钮操作失败；阻塞：True；下一步：请导出诊断或重试。"
    $Window.FindName("EvidenceText").Text = $evidence
}

function Invoke-VsleWizardUiAction {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Action
    )

    try {
        & $Action
    } catch {
        Set-VsleWizardButtonError -Window $Window -Message $_.Exception.Message
    }
}

function Move-VsleSetupWizardStep {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window,
        [Parameter(Mandatory = $true)]
        [object]$StepList,
        [Parameter(Mandatory = $true)]
        [int]$Direction
    )

    if ($null -eq $StepList -or $StepList.Items.Count -eq 0) {
        return
    }

    $currentIndex = $StepList.SelectedIndex
    if ($currentIndex -lt 0) {
        $currentIndex = 0
    }

    $targetIndex = $currentIndex + $Direction
    $targetIndex = [Math]::Max(0, [Math]::Min($targetIndex, $StepList.Items.Count - 1))
    if ($targetIndex -ne $StepList.SelectedIndex) {
        $StepList.SelectedIndex = $targetIndex
        return
    }

    if ($null -ne $StepList.SelectedItem) {
        Set-CurrentStep -Window $Window -Step $StepList.SelectedItem
    }
}

function Export-VsleSetupWizardDiagnostics {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window,
        [Parameter(Mandatory = $true)]
        [object]$StepList
    )

    $desktop = [Environment]::GetFolderPath("Desktop")
    if ([string]::IsNullOrWhiteSpace($desktop) -or -not (Test-Path -LiteralPath $desktop)) {
        $desktop = [System.IO.Path]::GetTempPath()
    }

    $selectedStepId = ""
    if ($null -ne $StepList.SelectedItem) {
        $selectedStepId = [string]$StepList.SelectedItem.Id
    }

    $steps = @()
    foreach ($item in Get-VsleSetupWizardSteps) {
        if ($null -ne $item) {
            $steps += [ordered]@{
                id = [string]$item.Id
                title = [string]$item.Title
                status = [string]$item.Status
                blocking = [bool]$item.Blocking
                evidence = [string]$item.Evidence
            }
        }
    }

    $progress = Get-VsleSetupWizardProgress
    $payload = [ordered]@{
        schema_version = 1
        generated_at = (Get-Date).ToString("o")
        selected_step_id = $selectedStepId
        production_release_ready = $false
        progress = [ordered]@{
            total_steps = [int]$progress.TotalSteps
            completed_steps = [int]$progress.CompletedSteps
            blocked_steps = [int]$progress.BlockedSteps
        }
        steps = $steps
        current_display = [ordered]@{
            selected_step_id = $selectedStepId
            status_text = [string]$Window.FindName("StatusText").Text
            evidence_text = [string]$Window.FindName("EvidenceText").Text
        }
        host = [ordered]@{
            os = [System.Environment]::OSVersion.VersionString
            ps_version = $PSVersionTable.PSVersion.ToString()
            ps_edition = if ($PSVersionTable.ContainsKey("PSEdition")) { $PSVersionTable.PSEdition } else { "" }
        }
    }

    $fileName = "vsle-setup-wizard-diagnostics-{0}.json" -f (Get-Date -Format "yyyyMMdd-HHmmss")
    $outputPath = Join-Path $desktop $fileName
    $payload | ConvertTo-Json -Depth 8 | Set-Content -Path $outputPath -Encoding UTF8

    $Window.FindName("StatusText").Text = "状态：诊断已导出；阻塞：False；下一步：继续安装向导。"
    $Window.FindName("EvidenceText").Text = "诊断已导出：$outputPath"
}

function Update-VsleValidateFilesStep {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window,
        [Parameter(Mandatory = $true)]
        [object]$Result
    )

    $checkItems = @(New-VsleValidateFileCheckItemsFromResult -Result $Result)
    if ($Result.Status -eq "passed") {
        $progressPercent = 100
        [void](Set-VsleStepProgress -Id "validate-files" -ProgressPercent 100)
    } elseif ($Result.Status -eq "warning") {
        $progressPercent = 100
        [void](Set-VsleStepProgress -Id "validate-files" -ProgressPercent 100)
    } else {
        $progressPercent = 70
        [void](Set-VsleStepProgress -Id "validate-files" -ProgressPercent 70)
    }
    [void](Set-VsleStepCheckItems -Id "validate-files" -CheckItems $checkItems)

    $step = Set-VsleSetupWizardStepResult `
        -Id "validate-files" `
        -Status $Result.Status `
        -Summary $Result.Summary `
        -Evidence $Result.Evidence `
        -Blocking $Result.Blocking `
        -StepProgressPercent $progressPercent `
        -CheckItems $checkItems

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
        -Summary "正在检查哈希、JSON、XML 和 Windows release zip 内容。" `
        -Evidence "文件检查正在运行。" `
        -Blocking $true `
        -StepProgressPercent 5 `
        -CheckItems (New-VsleValidateFileCheckItemsForRunning)
    Set-VsleStepProgress -Id "validate-files" -ProgressPercent 5
    Set-VsleStepCheckItems -Id "validate-files" -CheckItems (New-VsleValidateFileCheckItemsForRunning)
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
            Summary = "安装文件检查未完成。"
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
        -Summary "正在准备 Windows Desktop 安装文件。" `
        -Evidence "正在把 Windows evidence bundle 展开到临时 staging 目录。" `
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
        $result.Summary = "Windows Desktop 安装文件准备失败。"
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
        -Summary "老师确认后，正在安装 WeisileLink Desktop。" `
        -Evidence "正在复制 staged package、运行 Windows helper，并检查启动命令。" `
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
            Summary = "确认后安装 Windows Desktop 失败。"
            Evidence = $_.Exception.Message
            Plan = $plan
        }
    }

    Update-VsleDesktopInstallStep -Window $Window -Result $result
}

function Update-VsleLocalBridgeStep {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window,
        [Parameter(Mandatory = $true)]
        [object]$Result
    )

    $step = Set-VsleSetupWizardStepResult `
        -Id "verify-local-bridge" `
        -Status $Result.Status `
        -Summary $Result.Summary `
        -Evidence $Result.Evidence `
        -Blocking $Result.Blocking

    $StepList = $Window.FindName("StepList")
    $StepList.Items.Refresh()
    Set-CurrentStep -Window $Window -Step $step
}

function Run-VsleVerifyLocalBridgeStep {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Window]$Window
    )

    $runningStep = Set-VsleSetupWizardStepResult `
        -Id "verify-local-bridge" `
        -Status "running" `
        -Summary "正在启动并检查本地桥接。" `
        -Evidence "正在启动或检测 WeisileLink Desktop supervisor，并检查 127.0.0.1:20111 和 127.0.0.1:8766。" `
        -Blocking $true
    $StepList = $Window.FindName("StepList")
    $StepList.Items.Refresh()
    Set-CurrentStep -Window $Window -Step $runningStep

    try {
        $plan = Get-VsleWindowsDesktopBridgePlan
        $result = Invoke-VsleWindowsDesktopBridgeVerification -Plan $plan
    } catch {
        $result = [PSCustomObject]@{
            Status = "blocked"
            Blocking = $true
            ManualConfirmationRequired = $false
            Summary = "本地桥接启动检查失败。"
            Evidence = $_.Exception.Message
        }
    }

    Update-VsleLocalBridgeStep -Window $Window -Result $result
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

    $evidence = Get-VsleEv3ResultEvidenceText -Result $Result
    $step = Set-VsleSetupWizardStepResult `
        -Id $StepId `
        -Status $Result.Status `
        -Summary $Result.Summary `
        -Evidence $evidence `
        -Blocking $Result.Blocking

    $StepList = $Window.FindName("StepList")
    $StepList.Items.Refresh()
    Set-CurrentStep -Window $Window -Step $step
}

function Get-VsleEv3ResultEvidenceText {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Result
    )

    $evidence = ""
    if ($Result.PSObject.Properties.Name -contains "Evidence") {
        $evidence = [string]$Result.Evidence
    }
    if ([string]::IsNullOrWhiteSpace($evidence)) {
        $summary = ""
        if ($Result.PSObject.Properties.Name -contains "Summary") {
            $summary = [string]$Result.Summary
        }
        if ([string]::IsNullOrWhiteSpace($summary)) {
            $summary = "EV3 安装步骤没有返回诊断内容。"
        }
        $evidence = "EV3 安装步骤没有返回诊断内容。Summary: $summary"
    }

    return $evidence
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
        $result = Test-VsleEv3SetupInput -SetupInput $input
        Update-VsleEv3SetupStep -Window $Window -StepId $StepId -Result $result
        return
    }

    if ($StepId -eq "enable-bluetooth-full-vsle") {
        $result = New-VsleBluetoothFullVslePairingGuide -SetupInput $input
        Update-VsleEv3SetupStep -Window $Window -StepId $StepId -Result $result
        return
    }

    $installRoot = (Resolve-Path (Join-Path $ScriptRoot "..")).Path
    $result = New-VsleEv3ServerInstallPlan -SetupInput $input -InstallRoot $installRoot
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
        -Summary "老师确认后，正在安装 EV3 server。" `
        -Evidence "正在运行受保护的 SSH/SCP 安装命令序列。" `
        -Blocking $true
    $StepList = $Window.FindName("StepList")
    $StepList.Items.Refresh()
    Set-CurrentStep -Window $Window -Step $runningStep

    try {
        if ($null -eq $Script:VlseLastEv3InstallPlan) {
            $installRoot = (Resolve-Path (Join-Path $ScriptRoot "..")).Path
            $input = Get-VsleEv3SetupInputFromWindow -Window $Window
            $Script:VlseLastEv3InstallPlan = New-VsleEv3ServerInstallPlan -SetupInput $input -InstallRoot $installRoot
        }

        $result = Invoke-VsleEv3ServerInstall `
            -Plan $Script:VlseLastEv3InstallPlan `
            -ConfirmEv3Install `
            -RunSshCommands
    } catch {
        $errorMessage = [string]$_.Exception.Message
        if ([string]::IsNullOrWhiteSpace($errorMessage)) {
            $errorMessage = [string]$_
        }
        if ([string]::IsNullOrWhiteSpace($errorMessage)) {
            $errorMessage = "EV3 安装命令异常结束，但 Windows PowerShell 没有返回错误详情。"
        }
        $result = [PSCustomObject]@{
            Status = "blocked"
            Blocking = $true
            ManualConfirmationRequired = $true
            Summary = "确认后安装 EV3 server 失败。"
            Evidence = $errorMessage
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
    $window.FindName("ProgressText").Text = "已加载 $($progress.TotalSteps) 个步骤；欢迎页不会自动执行安装。"

    $stepList.Add_SelectionChanged({
        Invoke-VsleWizardUiAction -Window $window -Action {
            if ($null -eq $stepList.SelectedItem) {
                return
            }
            if ($stepList.SelectedItem.Id -eq "validate-files" -and $stepList.SelectedItem.Status -in @("pending", "blocked", "warning")) {
                Run-VsleValidateFilesStep -Window $window
                return
            }
            if ($stepList.SelectedItem.Id -eq "install-weisilelink-desktop" -and $stepList.SelectedItem.Status -in @("pending", "blocked", "warning")) {
                Run-VslePrepareDesktopInstallStep -Window $window
                return
            }
            if ($stepList.SelectedItem.Id -eq "verify-local-bridge" -and $stepList.SelectedItem.Status -in @("pending", "blocked", "warning")) {
                Run-VsleVerifyLocalBridgeStep -Window $window
                return
            }
            if ($stepList.SelectedItem.Id -in @("choose-transport", "install-ev3-server", "enable-bluetooth-full-vsle")) {
                Run-VslePrepareEv3SetupStep -Window $window -StepId $stepList.SelectedItem.Id
                return
            }
            Set-CurrentStep -Window $window -Step $stepList.SelectedItem
        }
    })

    $manualConfirmationsList = $window.FindName("ManualConfirmationsList")
    if ($null -ne $manualConfirmationsList) {
        $manualConfirmationsList.AddHandler(
            [System.Windows.Controls.Primitives.ToggleButton]::CheckedEvent,
            [System.Windows.RoutedEventHandler]{
                param($sender, $eventArgs)
                Invoke-VsleWizardUiAction -Window $window -Action {
                    $source = $eventArgs.OriginalSource
                    if ($source -is [System.Windows.Controls.CheckBox] -and $source.Tag) {
                        Set-VsleManualConfirmationStateFromKey -Key ([string]$source.Tag) -Checked $true
                        Update-VsleManualConfirmationProgress -Window $window -StepList $stepList
                    }
                }
            }.GetNewClosure()
        )
        $manualConfirmationsList.AddHandler(
            [System.Windows.Controls.Primitives.ToggleButton]::UncheckedEvent,
            [System.Windows.RoutedEventHandler]{
                param($sender, $eventArgs)
                Invoke-VsleWizardUiAction -Window $window -Action {
                    $source = $eventArgs.OriginalSource
                    if ($source -is [System.Windows.Controls.CheckBox] -and $source.Tag) {
                        Set-VsleManualConfirmationStateFromKey -Key ([string]$source.Tag) -Checked $false
                        Update-VsleManualConfirmationProgress -Window $window -StepList $stepList
                    }
                }
            }.GetNewClosure()
        )
    }

    $window.FindName("BackButton").Add_Click({
        Invoke-VsleWizardUiAction -Window $window -Action {
            Move-VsleSetupWizardStep -Window $window -StepList $stepList -Direction (-1)
        }
    })

    $window.FindName("ContinueButton").Add_Click({
        Invoke-VsleWizardUiAction -Window $window -Action {
            Move-VsleSetupWizardStep -Window $window -StepList $stepList -Direction 1
        }
    })

    $window.FindName("RetryButton").Add_Click({
        Invoke-VsleWizardUiAction -Window $window -Action {
            if ($null -ne $stepList.SelectedItem -and $stepList.SelectedItem.Id -eq "validate-files") {
                Run-VsleValidateFilesStep -Window $window
            }
            if ($null -ne $stepList.SelectedItem -and $stepList.SelectedItem.Id -eq "install-weisilelink-desktop") {
                Run-VslePrepareDesktopInstallStep -Window $window
            }
            if ($null -ne $stepList.SelectedItem -and $stepList.SelectedItem.Id -eq "verify-local-bridge") {
                Run-VsleVerifyLocalBridgeStep -Window $window
            }
            if ($null -ne $stepList.SelectedItem -and $stepList.SelectedItem.Id -in @("choose-transport", "install-ev3-server", "enable-bluetooth-full-vsle")) {
                Run-VslePrepareEv3SetupStep -Window $window -StepId $stepList.SelectedItem.Id
            }
        }
    })

    $window.FindName("ExportButton").Add_Click({
        Invoke-VsleWizardUiAction -Window $window -Action {
            Export-VsleSetupWizardDiagnostics -Window $window -StepList $stepList
        }
    })

    $window.FindName("ConfirmInstallButton").Add_Click({
        Invoke-VsleWizardUiAction -Window $window -Action {
            if ($null -ne $stepList.SelectedItem -and $stepList.SelectedItem.Id -eq "install-weisilelink-desktop") {
                Run-VsleConfirmDesktopInstallStep -Window $window
            }
        }
    })

    $window.FindName("ConfirmEv3InstallButton").Add_Click({
        Invoke-VsleWizardUiAction -Window $window -Action {
            if ($null -ne $stepList.SelectedItem -and $stepList.SelectedItem.Id -eq "install-ev3-server") {
                Run-VsleConfirmEv3ServerInstallStep -Window $window
            }
        }
    })

    Set-CurrentStep -Window $window -Step $steps[0]
    [void]$window.ShowDialog()
}

Open-VsleSetupWizard
