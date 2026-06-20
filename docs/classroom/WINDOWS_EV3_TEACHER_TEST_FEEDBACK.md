# Windows EV3 Teacher Test Feedback Form

用途：请老师按本表测试 Windows 版 VSLE Scratch-EV3 安装向导，并把填写结果、诊断 JSON、截图一起反馈。默认测试路径是 `Bluetooth Full VSLE`，不是 WiFi 连接。

安全提醒：

- 不要把 EV3 密码、配对码、学生数据写进反馈。
- 不要在输入可见密码时截图。
- 电机测试前必须让机器人离开桌边，轮子悬空或固定住车体。
- 看到 `ProductionReleaseReady: false` 不算失败；当前是内部未签名测试包。

## 1. 基本信息

请老师填写：

| 项目 | 填写 |
|------|------|
| 测试老师 |  |
| 测试日期和时间 |  |
| Windows 版本 |  |
| 电脑是否有蓝牙或 USB 蓝牙适配器 | 有 / 没有 |
| EV3 系统 | ev3dev / 不确定 |
| EV3 SSH 地址 | `ev3dev.local` / IP： |
| EV3 SSH 用户 | `robot` |
| EV3 蓝牙地址 |  |
| EV3 密码是否为默认 `maker` | 是 / 否，不要写密码 |
| 使用的安装文件夹 | `VSLE-Install` 复制时间： |
| 最后是否导出诊断 JSON | 是 / 否，文件名： |

蓝牙地址获取方法：

1. 在 EV3 的 ev3dev Brickman 菜单里进入 Bluetooth 信息页，查找形如 `00:16:53:XX:XX:XX` 的地址。
2. 如果老师能 SSH 到 EV3，也可以运行：

```bash
hciconfig -a | grep "BD Address"
```

只记录 `BD Address` 后面的地址，不记录密码。

## 2. 测试步骤

请每一步填写 `通过 / 失败 / 卡住 / 未测试`，并写一句现象。失败或卡住时请截图。

| 步骤 | 老师操作 | 期望结果 | 结果和备注 |
|------|----------|----------|------------|
| 1. 打开向导 | 在 Windows 上打开 `VSLE-Install`，双击 `Start-VSLE-Setup-Wizard.cmd`。 | 出现 `VSLE Scratch-EV3 安装向导` 窗口。 |  |
| 2. 检查安装文件 | 进入 `检查安装文件`，点击下一步或重试。 | 安装文件检查通过。 |  |
| 3. 刷写 SD 卡 | 如果已经刷好 ev3dev SD 卡，选择确认继续；如果没有刷，请按向导完成刷写。 | EV3 能启动 ev3dev。 |  |
| 4. 选择连接方式 | 选择 `Bluetooth Full VSLE`。填写 EV3 SSH 地址、SSH 用户 `robot`、EV3 蓝牙地址。不要选择 WiFi 或 Official Firmware Bluetooth。 | 向导接受输入并进入 `安装 EV3 Server`。 |  |
| 5. 安装 EV3 Server | 点击确认安装。外部 PowerShell 出现后按提示操作：如果问 `Are you sure you want to continue connecting`，输入 `yes` 回车；如果出现隐藏的 `Password:`，输入 EV3 SSH 密码回车；如果出现可见的 `EV3 robot password (press Enter to use maker)`，默认密码就直接回车。 | 外部窗口最后显示 `VSLE EV3 install status: passed`；回到向导点 `重试` 后，向导显示 `EV3 service check command completed: systemctl is-active vsle-ev3-server.service`。 |  |
| 6. 不要重复重装 | 如果第 5 步已经通过，不要再反复点击确认安装 EV3 Server；直接点下一步。 | 向导进入 `启用 Bluetooth Full VSLE` 或后续步骤。 |  |
| 7. 启用 Bluetooth Full VSLE | 按向导提示确认 EV3 已配对，必要时打开 Windows 设置里的蓝牙页面完成配对。 | 此步骤通过，左侧显示已跳过或已通过均可接受，取决于当前向导版本。 |  |
| 8. 安装 WeisileLink Desktop | 进入 `安装 WeisileLink Desktop`，点击确认。若 Windows 提示未知发布者，确认这是内部测试包后继续。 | 向导显示安装通过；如果证据里有 `ProductionReleaseReady: false`，仍然算通过。 |  |
| 9. 启动并检查本地桥接 | 进入 `启动并检查本地桥接`，点击重试或下一步。 | `scratch_link_endpoint_ok: True`，`trainer_endpoint_ok: True`；端口为 `127.0.0.1:20111` 和 `127.0.0.1:8766`。 |  |
| 10. 打开 ScratchAI | 进入 `打开 ScratchAI`，按向导打开浏览器。 | ScratchAI 打开，能看到 EV3 扩展或 EV3 积木。 |  |
| 11. ScratchAI 连接 EV3 | 在 ScratchAI 里选择 EV3 连接，确认选择 `Bluetooth Full VSLE`。 | EV3 连接状态正常，不使用浏览器直接蓝牙。 |  |
| 12. 安全功能测试 | 先测试蜂鸣、显示文字、读取电池或传感器；最后才做低速电机测试。 | EV3 有蜂鸣/显示/传感器读数；电机测试后能停止。 |  |
| 13. 导出诊断 | 回到向导点击 `导出诊断`。 | 桌面生成 `vsle-setup-wizard-diagnostics-*.json`。 |  |

## 3. ScratchAI EV3 功能小测试

请老师只填写实际看到的结果：

| 功能 | 操作 | 期望 | 实际结果 |
|------|------|------|----------|
| EV3 扩展 | 打开 ScratchAI 后查看扩展或积木区。 | 能看到 EV3 积木。 |  |
| 蜂鸣 | 运行 EV3 蜂鸣或播放音调积木。 | EV3 发声。 |  |
| 显示 | 运行清屏和显示文字积木。 | EV3 屏幕显示文字。 |  |
| 传感器 | 读取电池、电压或已连接传感器数值。 | 数值会显示，且不是一直空白。 |  |
| 电机 A | 车体固定后，让 A 口电机低速运行 1 秒。 | 电机转动。 |  |
| 停止 | 运行停止所有电机或点击 Scratch 停止按钮。 | 电机停止。 |  |

## 4. 如果失败，请优先记录这些信息

请老师把第一个失败点写清楚：

| 问题 | 填写 |
|------|------|
| 第一个失败步骤编号 |  |
| 屏幕上的原始英文或中文错误 |  |
| 外部 PowerShell 最后一屏截图文件名 |  |
| 向导截图文件名 |  |
| 诊断 JSON 文件名 |  |
| 如果出现 `VSLE_REMOTE_STEP_FAILED`，失败的 step 名称 |  |
| 如果是本地桥接失败，`scratch_link_endpoint_ok` 是 True 还是 False |  |
| 如果是本地桥接失败，`trainer_endpoint_ok` 是 True 还是 False |  |
| 是否能听到 EV3 蜂鸣 | 是 / 否 |
| 是否能看到 EV3 屏幕文字 | 是 / 否 |
| 是否能看到电机动作 | 是 / 否 / 未测试 |

## 5. 直接发回的微信模板

老师可以直接复制下面内容填写：

```text
EV3 测试反馈：
1. 测试时间：
2. Windows 版本：
3. 连接方式：Bluetooth Full VSLE
4. EV3 SSH 地址：
5. EV3 蓝牙地址：
6. EV3 Server：通过 / 失败 / 卡住
7. WeisileLink Desktop：通过 / 失败 / 卡住
8. 本地桥接：通过 / 失败 / 卡住
   - scratch_link_endpoint_ok:
   - trainer_endpoint_ok:
9. ScratchAI EV3 扩展：可见 / 不可见
10. 功能测试：
   - 蜂鸣：
   - 显示文字：
   - 传感器读数：
   - 电机 A：
   - 停止电机：
11. 第一个失败点：
12. 已附文件：
   - 诊断 JSON：
   - 向导截图：
   - 外部 PowerShell 截图：
```

## 6. 反馈文件清单

请老师至少发回：

- `vsle-setup-wizard-diagnostics-*.json`
- 向导当前页面截图
- 外部 PowerShell 窗口截图
- 如果 ScratchAI 已打开，再附 ScratchAI EV3 积木或连接状态截图

