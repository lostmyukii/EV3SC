Set-StrictMode -Version Latest

function Get-VsleSetupWizardStatusLabel {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Status
    )

    switch ($Status) {
        "pending" { "待处理" }
        "running" { "正在执行" }
        "needs_manual_action" { "需要手动确认" }
        "needs_input" { "需要填写信息" }
        "passed" { "已通过" }
        "warning" { "需要确认" }
        "blocked" { "已阻塞" }
        "skipped" { "已跳过" }
        default { $Status }
    }
}

$Script:VlseSetupWizardSteps = @(
    @{
        Id = "welcome"
        Number = 0
        Title = "欢迎"
        Mode = "manual"
        Status = "needs_manual_action"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "这是 VSLE Scratch-EV3 的 Windows 内部测试安装向导。"
        AutomaticActions = @(
            "确认安装向导来自 VSLE-Install 文件夹。",
            "在开始前提示当前是未签名内部测试版本。"
        )
        ManualActions = @(
            "准备好 EV3、SD 卡、USB 线和蓝牙设置。",
            "确认当前版本仅用于内部测试，正式课堂发布需要签名版本。"
        )
        Evidence = "欢迎页不会执行安装动作。"
        NextEnabledWhen = "老师确认内部测试提示后继续。"
        ProductionReleaseReady = $false
    }
    @{
        Id = "validate-files"
        Number = 1
        Title = "检查安装文件"
        Mode = "automatic"
        Status = "pending"
        Blocking = $true
        ManualConfirmationRequired = $false
        Summary = "检查哈希、压缩包内容、收据 JSON 和 EV3 共享文件。"
        AutomaticActions = @(
            "检查 Etcher 安装器和 ev3dev 镜像哈希。",
            "检查 Windows 内部测试 release evidence zip。",
            "检查 zip 内必需文件和 EV3 server 文件。"
        )
        ManualActions = @("等待文件检查结果。")
        Evidence = "文件检查会显示通过或阻塞原因。"
        NextEnabledWhen = "所有文件检查通过后继续。"
        ProductionReleaseReady = $false
    }
    @{
        Id = "prepare-sd-card"
        Number = 2
        Title = "准备 EV3 SD 卡"
        Mode = "human-confirmed"
        Status = "needs_manual_action"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "引导使用 Etcher 刷写 ev3dev SD 卡，目标磁盘必须人工选择。"
        AutomaticActions = @(
            "显示 Etcher 和 ev3dev 镜像路径。",
            "提示老师确认 SD 卡目标盘。"
        )
        ManualActions = @(
            "在 Etcher 中选择 microSD 卡。",
            "确认 Etcher 写入和验证完成，并安全弹出 SD 卡。"
        )
        Evidence = "SD 卡刷写结果由老师手动确认。"
        NextEnabledWhen = "老师确认 SD 卡准备完成后继续。"
        ProductionReleaseReady = $false
    }
    @{
        Id = "ev3-first-boot"
        Number = 3
        Title = "EV3 首次启动"
        Mode = "human-confirmed"
        Status = "needs_manual_action"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "引导 EV3 首次启动 ev3dev，并确认 Brickman 页面出现。"
        AutomaticActions = @("显示首次启动检查清单和预计等待时间。")
        ManualActions = @(
            "插入已经刷好的 SD 卡。",
            "打开 EV3 电源。",
            "确认看到 ev3dev / Brickman 页面。"
        )
        Evidence = "首次启动结果由老师手动确认。"
        NextEnabledWhen = "老师确认 EV3 首次启动完成后继续。"
        ProductionReleaseReady = $false
    }
    @{
        Id = "choose-transport"
        Number = 4
        Title = "选择连接方式"
        Mode = "needs-input"
        Status = "needs_input"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "选择 WiFi Full VSLE、Bluetooth Full VSLE 或 USB 辅助设置。"
        AutomaticActions = @("显示支持的连接方式和必填信息。")
        ManualActions = @(
            "WiFi 模式填写 EV3 IP/主机名，蓝牙完整模式填写 EV3 蓝牙地址。",
            "不要把官方固件蓝牙兼容模式当作 Full VSLE 完整模式。"
        )
        Evidence = "选择的连接方式会写入安装报告。"
        NextEnabledWhen = "连接方式和必填信息有效后继续。"
        ProductionReleaseReady = $false
    }
    @{
        Id = "install-ev3-server"
        Number = 5
        Title = "安装 EV3 Server"
        Mode = "guided-automatic"
        Status = "pending"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "老师确认 SSH 信息后，复制并安装 EV3SC 自有 EV3 server 文件。"
        AutomaticActions = @(
            "检查 SSH 是否可连接。",
            "复制 EV3 firmware 文件。",
            "运行离线 websockets 和 EV3 server 安装命令。"
        )
        ManualActions = @(
            "填写 SSH 地址和用户名，密码由 Windows/OpenSSH 单独提示。",
            "确认 EV3 server 服务状态。"
        )
        Evidence = "服务状态会作为 EV3 安装证据记录。"
        NextEnabledWhen = "EV3 server 服务为 active 后继续。"
        ProductionReleaseReady = $false
    }
    @{
        Id = "enable-bluetooth-full-vsle"
        Number = 6
        Title = "启用 Bluetooth Full VSLE"
        Mode = "human-guided"
        Status = "skipped"
        Blocking = $false
        ManualConfirmationRequired = $true
        Summary = "仅在选择 Bluetooth Full VSLE 时使用；EV3 仍然运行 ev3dev 和 VSLE server。"
        AutomaticActions = @(
            "显示 EV3 端蓝牙完整模式启用命令。",
            "老师确认后可通过 SSH 辅助执行命令。"
        )
        ManualActions = @(
            "在 Windows 蓝牙设置中配对 EV3。",
            "确认 Windows 显示 EV3 已配对或已连接。"
        )
        Evidence = "蓝牙配对证据仅记录老师确认结果，并保持脱敏。"
        NextEnabledWhen = "老师确认配对完成，或改选 WiFi 模式后继续。"
        ProductionReleaseReady = $false
    }
    @{
        Id = "install-weisilelink-desktop"
        Number = 7
        Title = "安装 WeisileLink Desktop"
        Mode = "automatic"
        Status = "pending"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "安装未签名的 WeisileLink Desktop 内部测试包。"
        AutomaticActions = @(
            "展开 Windows 内部测试 evidence bundle。",
            "复制 WeisileLink 可执行文件和辅助文件到本机应用目录。",
            "创建配置、日志、诊断和开机启动路径。"
        )
        ManualActions = @("如 Windows 出现未知发布者提示，请确认这是内部测试包后继续。")
        Evidence = "安装路径和 manifest 哈希会写入安装证据。"
        NextEnabledWhen = "Desktop 文件和开机启动入口验证通过后继续。"
        ProductionReleaseReady = $false
    }
    @{
        Id = "verify-local-bridge"
        Number = 8
        Title = "启动并检查本地桥接"
        Mode = "automatic"
        Status = "pending"
        Blocking = $true
        ManualConfirmationRequired = $false
        Summary = "启动 WeisileLink Desktop supervisor，并检查本机端口。"
        AutomaticActions = @(
            "启动 desktop-supervise。",
            "检查 127.0.0.1:20111。",
            "检查 127.0.0.1:8766。"
        )
        ManualActions = @("如果没有已保存的 EV3 配置，请继续配对或恢复流程。")
        Evidence = "本机端口检查结果会写入最终安装报告。"
        NextEnabledWhen = "两个本机端口都通过后继续。"
        ProductionReleaseReady = $false
    }
    @{
        Id = "open-scratchai"
        Number = 9
        Title = "打开 ScratchAI"
        Mode = "human-confirmed"
        Status = "needs_manual_action"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "打开 ScratchAI，并请老师确认 EV3 扩展加载成功。"
        AutomaticActions = @("打开配置好的 ScratchAI 地址。")
        ManualActions = @(
            "选择 VSLE-EV3 扩展。",
            "确认出现红色 EV3 积木分类。",
            "确认传感器数值实时更新。"
        )
        Evidence = "老师确认结果会写入安装报告。"
        NextEnabledWhen = "老师确认 ScratchAI EV3 扩展可用后继续。"
        ProductionReleaseReady = $false
    }
    @{
        Id = "finish-report"
        Number = 10
        Title = "完成并导出报告"
        Mode = "automatic"
        Status = "blocked"
        Blocking = $true
        ManualConfirmationRequired = $false
        Summary = "写入已脱敏的 JSON 和 Markdown 安装报告。"
        AutomaticActions = @(
            "写入 setup-wizard-report.json。",
            "写入 setup-wizard-report.md。",
            "提供诊断导出。"
        )
        ManualActions = @("查看已通过项目和仍未完成的发布门槛。")
        Evidence = "未签名内部测试包会保持 production_release_ready=false。"
        NextEnabledWhen = "报告写入完成且不包含秘密信息后继续。"
        ProductionReleaseReady = $false
    }
)

foreach ($step in $Script:VlseSetupWizardSteps) {
    $step.StatusLabel = Get-VsleSetupWizardStatusLabel -Status $step.Status
}

function Get-VsleSetupWizardStatuses {
    [CmdletBinding()]
    param()

    return @(
        [PSCustomObject]@{ Status = "passed"; Meaning = "步骤已自动通过。" }
        [PSCustomObject]@{ Status = "blocked"; Meaning = "步骤已阻塞，需要修复后才能继续。" }
        [PSCustomObject]@{ Status = "warning"; Meaning = "步骤需要老师确认后继续。" }
    )
}

function Get-VsleSetupWizardSteps {
    [CmdletBinding()]
    param()

    return $Script:VlseSetupWizardSteps | ForEach-Object {
        [PSCustomObject]$_
    }
}

function Set-VsleSetupWizardStepResult {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Id,
        [Parameter(Mandatory = $true)]
        [ValidateSet("pending", "running", "needs_manual_action", "needs_input", "passed", "warning", "blocked", "skipped")]
        [string]$Status,
        [string]$Summary,
        [string]$Evidence,
        [object]$Blocking
    )

    $step = $Script:VlseSetupWizardSteps | Where-Object { $_.Id -eq $Id } | Select-Object -First 1
    if ($null -eq $step) {
        throw "Unknown setup wizard step id: $Id"
    }

    $step.Status = $Status
    $step.StatusLabel = Get-VsleSetupWizardStatusLabel -Status $Status
    if ($PSBoundParameters.ContainsKey("Summary")) {
        $step.Summary = $Summary
    }
    if ($PSBoundParameters.ContainsKey("Evidence")) {
        $step.Evidence = $Evidence
    }
    if ($PSBoundParameters.ContainsKey("Blocking")) {
        $step.Blocking = [bool]$Blocking
    }

    return [PSCustomObject]$step
}

function Get-VsleSetupWizardProgress {
    [CmdletBinding()]
    param()

    $steps = @(Get-VsleSetupWizardSteps)
    $total = $steps.Count
    $readyCount = @($steps | Where-Object {
        $_.Status -in @("passed", "skipped")
    }).Count

    [PSCustomObject]@{
        TotalSteps = $total
        ReadySteps = $readyCount
        PercentComplete = if ($total -eq 0) { 0 } else { [Math]::Round(($readyCount / $total) * 100, 1) }
        ProductionReleaseReady = $false
    }
}

Export-ModuleMember -Function Get-VsleSetupWizardStatuses, Get-VsleSetupWizardSteps, Get-VsleSetupWizardProgress, Set-VsleSetupWizardStepResult
