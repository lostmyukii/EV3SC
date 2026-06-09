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
        CompletionCondition = "确认这是内部测试安装包，并准备好 EV3、microSD 卡、USB 线和需要的网络/蓝牙硬件。"
        HardwareLocation = "当前设备：EV3 关机；SD 卡暂时放在桌面旁，下一步会插到 Windows 电脑。"
        StepProgressPercent = 0
        CheckItems = @()
        ManualConfirmations = @(
            @{ Id = "welcome-internal-test-ready"; Label = "我已确认这是内部测试安装包，并已准备好 EV3、microSD 卡、USB 线和网络/蓝牙硬件。"; Required = $true }
        )
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
        CompletionCondition = "所有自动检查项显示已通过，并且本步进度达到 100%。"
        HardwareLocation = "当前设备：不需要插 EV3 或 SD 卡；本步只检查 VSLE-Install 文件夹。"
        StepProgressPercent = 0
        CheckItems = @(
            @{ Name = "必需路径"; Status = "pending"; Detail = "等待检查 install 文件夹结构。" }
            @{ Name = "Etcher 与 ev3dev"; Status = "pending"; Detail = "等待检查安装器和镜像。" }
            @{ Name = "Windows release evidence"; Status = "pending"; Detail = "等待检查 Windows 内测包。" }
            @{ Name = "JSON 证据模板"; Status = "pending"; Detail = "等待解析 JSON 模板。" }
            @{ Name = "XAML 向导文件"; Status = "pending"; Detail = "等待解析 WPF XAML。" }
            @{ Name = "Desktop release 内容"; Status = "pending"; Detail = "等待检查 WeisileLink.exe。" }
            @{ Name = "最终结果"; Status = "pending"; Detail = "等待汇总文件检查结果。" }
        )
        ManualConfirmations = @()
    }
    @{
        Id = "prepare-sd-card"
        Number = 2
        Title = "刷写 ev3dev 系统到 EV3 SD 卡"
        Mode = "human-confirmed"
        Status = "needs_manual_action"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "这一步就是把 ev3dev 系统安装到 microSD 卡；目标磁盘必须由老师人工选择，避免误清空电脑硬盘。"
        AutomaticActions = @(
            "显示 Balena Etcher 安装器路径：windows/01-sd-card/balenaEtcher-Setup-1.17.0.exe。",
            "显示 ev3dev 镜像路径：shared/01-ev3-sd-card/ev3dev-stretch-ev3-generic-2020-04-10.zip。",
            "提示老师只能选择外置 microSD 卡作为 target。"
        )
        ManualActions = @(
            "1. 将 microSD 卡插入 Windows 电脑，EV3 保持关机，SD 卡不要插在 EV3 上。",
            "2. 打开 Balena Etcher。如果未安装，请先运行 windows/01-sd-card/balenaEtcher-Setup-1.17.0.exe。",
            "3. 选择 Flash from file。",
            "4. 选择 ev3dev 镜像文件 shared/01-ev3-sd-card/ev3dev-stretch-ev3-generic-2020-04-10.zip。",
            "5. 选择目标 microSD 卡。请反复确认这是外置 SD 卡，不是 Windows 系统盘或其它硬盘。",
            "6. 点击 Flash，开始把 ev3dev 系统写入 SD 卡。",
            "7. 等待 Etcher 显示 Flash Complete，确认写入和验证都已完成。",
            "8. 安全弹出 SD 卡；下一步才把 SD 卡插入 EV3。"
        )
        Evidence = "SD 卡刷写和验证结果由老师手动确认。"
        NextEnabledWhen = "老师确认 ev3dev 已写入 microSD 卡并安全弹出后继续。"
        ProductionReleaseReady = $false
        CompletionCondition = "Etcher 显示 Flash Complete，写入和验证完成，并且 SD 卡已从 Windows 电脑安全弹出。"
        HardwareLocation = "SD 卡位置：插在 Windows 电脑上；EV3 保持关机，不要插入 EV3。"
        StepProgressPercent = 0
        CheckItems = @(
            @{ Name = "1. SD 卡插入电脑"; Status = "needs_manual_action"; Detail = "microSD 卡插在 Windows 电脑上，不在 EV3 上。" }
            @{ Name = "2. 打开 Etcher"; Status = "needs_manual_action"; Detail = "运行 Balena Etcher，必要时先安装 Etcher。" }
            @{ Name = "3. 选择镜像"; Status = "needs_manual_action"; Detail = "在 Flash from file 中选择 ev3dev zip 镜像。" }
            @{ Name = "4. 选择目标 SD 卡"; Status = "needs_manual_action"; Detail = "人工确认 target 是外置 microSD 卡，不能选系统盘。" }
            @{ Name = "5. 点击 Flash"; Status = "needs_manual_action"; Detail = "开始把 ev3dev 系统写入 SD 卡。" }
            @{ Name = "6. 完成并弹出"; Status = "needs_manual_action"; Detail = "Etcher 显示 Flash Complete 后安全弹出 SD 卡。" }
        )
        ManualConfirmations = @(
            @{ Id = "sd-card-in-computer"; Label = "我已确认 SD 卡插在 Windows 电脑上，不在 EV3 上。"; Required = $true }
            @{ Id = "etcher-image-selected"; Label = "我已确认 Etcher 的 Flash from file 已选择 ev3dev 镜像文件。"; Required = $true }
            @{ Id = "etcher-target-selected"; Label = "我已确认 Etcher 的 target 是外置 microSD 卡，不是 Windows 系统盘或其它硬盘。"; Required = $true }
            @{ Id = "etcher-flash-complete"; Label = "我已确认已经点击 Flash，并等待 Etcher 完成写入和验证。"; Required = $true }
            @{ Id = "sd-card-ejected"; Label = "我已确认 Etcher 显示 Flash Complete，并已安全弹出 SD 卡。"; Required = $true }
        )
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
            "SD 卡位置：插在 EV3 里，不再插在 Windows 电脑上。",
            "打开 EV3 电源。",
            "确认看到 ev3dev / Brickman 页面。"
        )
        Evidence = "首次启动结果由老师手动确认。"
        NextEnabledWhen = "老师确认 EV3 首次启动完成后继续。"
        ProductionReleaseReady = $false
        CompletionCondition = "EV3 屏幕显示 ev3dev / Brickman 页面，说明 SD 卡启动成功。"
        HardwareLocation = "SD 卡位置：插在 EV3 里；Windows 电脑不再占用这张 SD 卡。"
        StepProgressPercent = 0
        CheckItems = @(
            @{ Name = "SD 卡在 EV3"; Status = "needs_manual_action"; Detail = "把刷好的 microSD 卡插入 EV3。" }
            @{ Name = "EV3 启动"; Status = "needs_manual_action"; Detail = "打开 EV3 电源并等待启动。" }
            @{ Name = "Brickman 页面"; Status = "needs_manual_action"; Detail = "确认 EV3 屏幕出现 ev3dev / Brickman。" }
        )
        ManualConfirmations = @(
            @{ Id = "sd-card-in-ev3"; Label = "我已确认 SD 卡已经插入 EV3。"; Required = $true }
            @{ Id = "ev3-powered-on"; Label = "我已确认 EV3 已开机并正在启动。"; Required = $true }
            @{ Id = "brickman-visible"; Label = "我已确认 EV3 屏幕出现 ev3dev / Brickman。"; Required = $true }
        )
    }
    @{
        Id = "choose-transport"
        Number = 4
        Title = "选择连接方式"
        Mode = "needs-input"
        Status = "needs_input"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "选择 WiFi Full VSLE、Bluetooth Full VSLE 或 USB 辅助设置，并在本页直接填写 EV3 地址信息。"
        AutomaticActions = @(
            "显示支持的连接方式和必填信息。",
            "EV3 SSH 地址输入框默认填入 ev3dev.local。",
            "显示 SSH 用户、默认密码、IP 地址和蓝牙地址的查找方式。"
        )
        ManualActions = @(
            "WiFi Full VSLE：EV3 SSH 地址先填 ev3dev.local。",
            "如果 ev3dev.local 不通，在 EV3 Brickman 的网络信息里查看 IP 地址，然后把 IP 地址填入 EV3 SSH 地址。",
            "SSH 用户填写 robot；默认密码是 maker。密码只会由 Windows/OpenSSH 提示输入，不会保存到安装报告。",
            "Bluetooth Full VSLE：先确认 Windows 有蓝牙或 USB 蓝牙适配器。",
            "EV3 蓝牙地址可在 EV3 的 Bluetooth 设置中查看。",
            '也可在 EV3 SSH 里运行 hciconfig -a | grep "BD Address" 查看蓝牙地址。',
            "Windows 设置 > 蓝牙和设备 > 添加设备，选择 EV3 完成配对。",
            "不要把官方固件蓝牙兼容模式当作 Full VSLE 完整模式。"
        )
        Evidence = "选择的连接方式会写入安装报告。"
        NextEnabledWhen = "连接方式和必填信息有效后继续。"
        ProductionReleaseReady = $false
        CompletionCondition = "连接方式已选择，WiFi 模式有 EV3 地址，蓝牙完整模式有 EV3 蓝牙地址。"
        HardwareLocation = "SD 卡位置：仍在 EV3 里；EV3 保持 ev3dev 开机状态。"
        StepProgressPercent = 0
        CheckItems = @()
        ManualConfirmations = @()
    }
    @{
        Id = "install-ev3-server"
        Number = 5
        Title = "安装 EV3 Server"
        Mode = "guided-automatic"
        Status = "pending"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "老师确认 SSH 信息后，复制并安装 EV3SC 自有 EV3 server 文件；本页列出需要复制的文件位置。"
        AutomaticActions = @(
            "检查 SSH 是否可连接。",
            "复制 EV3 firmware 文件。",
            "复制 install/shared/02-ev3-server/ev3-firmware/vsle_ev3_server.py。",
            "复制 install/shared/02-ev3-server/ev3-firmware/scripts/。",
            "复制 install/shared/02-ev3-server/ev3-firmware/systemd/。",
            "复制 install/shared/02-ev3-server/websockets-7.0.tar.gz。",
            "运行离线 websockets 和 EV3 server 安装命令。"
        )
        ManualActions = @(
            "EV3 SSH 地址：先用 ev3dev.local；不通时用 EV3 Brickman 网络信息里显示的 IP 地址。",
            "SSH 用户：robot。",
            "SSH 密码：maker。密码由 Windows/OpenSSH 单独提示，不会写入安装向导证据。",
            "确认 EV3 server 服务状态。"
        )
        Evidence = "服务状态会作为 EV3 安装证据记录。"
        NextEnabledWhen = "EV3 server 服务为 active 后继续。"
        ProductionReleaseReady = $false
        CompletionCondition = "EV3 server 安装计划生成成功，或确认安装后服务状态为 active。"
        HardwareLocation = "SD 卡位置：仍在 EV3 里；EV3 运行 ev3dev，并通过 WiFi/蓝牙完整模式连接。"
        StepProgressPercent = 0
        CheckItems = @()
        ManualConfirmations = @()
    }
    @{
        Id = "enable-bluetooth-full-vsle"
        Number = 6
        Title = "启用 Bluetooth Full VSLE"
        Mode = "human-guided"
        Status = "skipped"
        Blocking = $false
        ManualConfirmationRequired = $true
        Summary = "仅在选择 Bluetooth Full VSLE 时使用；本页直接说明如何找到 EV3 蓝牙地址并在 Windows 中配对。"
        AutomaticActions = @(
            "显示 EV3 端蓝牙完整模式启用命令。",
            "老师确认后可通过 SSH 辅助执行命令。",
            "提示 EV3 蓝牙地址和 Windows 配对入口。"
        )
        ManualActions = @(
            "确认 EV3 仍运行 ev3dev 和 VSLE server，不是官方固件兼容模式。",
            "EV3 蓝牙地址可在 EV3 的 Bluetooth 设置中查看。",
            '也可在 EV3 SSH 里运行 hciconfig -a | grep "BD Address" 查看蓝牙地址。',
            "Windows 设置 > 蓝牙和设备 > 添加设备，选择 EV3。",
            "确认 Windows 显示 EV3 已配对或已连接。"
        )
        Evidence = "蓝牙配对证据仅记录老师确认结果，并保持脱敏。"
        NextEnabledWhen = "老师确认配对完成，或改选 WiFi 模式后继续。"
        ProductionReleaseReady = $false
        CompletionCondition = "Windows 蓝牙设置里显示 EV3 已配对，且选择的是 Bluetooth Full VSLE。"
        HardwareLocation = "SD 卡位置：仍在 EV3 里；EV3 运行 ev3dev，不是官方固件蓝牙兼容模式。"
        StepProgressPercent = 0
        CheckItems = @()
        ManualConfirmations = @(
            @{ Id = "windows-bluetooth-ready"; Label = "我已确认 Windows 电脑有蓝牙或已插入 USB 蓝牙适配器。"; Required = $true }
            @{ Id = "ev3-paired-in-windows"; Label = "我已确认 EV3 已在 Windows 蓝牙设置中配对。"; Required = $true }
            @{ Id = "bluetooth-full-vsle-not-official"; Label = "我已确认这是 Bluetooth Full VSLE，EV3 运行 ev3dev，不是官方固件兼容模式。"; Required = $true }
        )
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
        CompletionCondition = "WeisileLink Desktop 文件已复制，启动入口指向 desktop-supervise，本机端口默认 localhost。"
        HardwareLocation = "当前设备：操作 Windows 电脑；EV3 可保持开机等待后续连接。"
        StepProgressPercent = 0
        CheckItems = @()
        ManualConfirmations = @()
    }
    @{
        Id = "verify-local-bridge"
        Number = 8
        Title = "启动并检查本地桥接"
        Mode = "automatic"
        Status = "pending"
        Blocking = $true
        ManualConfirmationRequired = $false
        Summary = "真实启动或检测 WeisileLink Desktop supervisor，并检查本机端口。"
        AutomaticActions = @(
            "如果端口已经响应，记录为已检测到正在运行。",
            "WiFi Full VSLE 使用当前 EV3 地址直接启动 WeisileLink runtime。",
            "Bluetooth Full VSLE 使用 EV3 蓝牙地址直接启动 WeisileLink runtime。",
            "检查 127.0.0.1:20111。",
            "检查 127.0.0.1:8766。"
        )
        ManualActions = @("如果 Bluetooth Full VSLE 端口未响应，请确认 Windows 已配对 EV3 且蓝牙地址填写正确。")
        Evidence = "本机端口检查结果会写入最终安装报告。"
        NextEnabledWhen = "两个本机端口都通过后继续。"
        ProductionReleaseReady = $false
        CompletionCondition = "127.0.0.1:20111 和 127.0.0.1:8766 都能响应。"
        HardwareLocation = "当前设备：操作 Windows 电脑；WeisileLink Desktop 在本机运行。"
        StepProgressPercent = 0
        CheckItems = @()
        ManualConfirmations = @()
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
        CompletionCondition = "ScratchAI 打开后出现 VSLE-EV3 扩展，EV3 传感器数值能更新。"
        HardwareLocation = "当前设备：Windows 浏览器连接本机 WeisileLink；EV3 保持开机连接。"
        StepProgressPercent = 0
        CheckItems = @()
        ManualConfirmations = @(
            @{ Id = "scratchai-open"; Label = "我已确认 ScratchAI 已打开。"; Required = $true }
            @{ Id = "vsle-ev3-extension-selected"; Label = "我已确认已选择 VSLE-EV3 扩展。"; Required = $true }
            @{ Id = "ev3-blocks-or-sensors-visible"; Label = "我已确认 EV3 积木或传感器数值已经出现。"; Required = $true }
        )
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
        CompletionCondition = "安装报告和诊断文件已导出，并且不包含密码、pairing token 或学生原始数据。"
        HardwareLocation = "当前设备：操作 Windows 电脑；EV3 可保持当前连接状态。"
        StepProgressPercent = 0
        CheckItems = @()
        ManualConfirmations = @()
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
        [object]$Blocking,
        [object]$StepProgressPercent,
        [object[]]$CheckItems,
        [object[]]$ManualConfirmations,
        [string]$CompletionCondition,
        [string]$HardwareLocation
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
    if ($PSBoundParameters.ContainsKey("StepProgressPercent")) {
        $step.StepProgressPercent = [int]$StepProgressPercent
    }
    if ($PSBoundParameters.ContainsKey("CheckItems")) {
        $step.CheckItems = @($CheckItems)
    }
    if ($PSBoundParameters.ContainsKey("ManualConfirmations")) {
        $step.ManualConfirmations = @($ManualConfirmations)
    }
    if ($PSBoundParameters.ContainsKey("CompletionCondition")) {
        $step.CompletionCondition = $CompletionCondition
    }
    if ($PSBoundParameters.ContainsKey("HardwareLocation")) {
        $step.HardwareLocation = $HardwareLocation
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
        CompletedSteps = $readyCount
        BlockedSteps = @($steps | Where-Object { $_.Status -eq "blocked" }).Count
        PercentComplete = if ($total -eq 0) { 0 } else { [Math]::Round(($readyCount / $total) * 100, 1) }
        ProductionReleaseReady = $false
    }
}

Export-ModuleMember -Function Get-VsleSetupWizardStatuses, Get-VsleSetupWizardSteps, Get-VsleSetupWizardProgress, Set-VsleSetupWizardStepResult
