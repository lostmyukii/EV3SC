# VSLE Scratch-EV3 完整安装向导

本向导用于从零准备 VSLE Scratch-EV3 课堂环境：刷写 EV3 的 ev3dev SD 卡，
安装 EV3 端 `vsle_ev3_server.py`，安装或启动老师电脑上的 WeisileLink
Desktop，并在 ScratchAI 中选择 Full VSLE 连接路径。

当前发布状态：

- macOS：已有 unsigned Internal Test Release，可用于内部测试。
- Windows：已有 GitHub Actions 下载的 unsigned internal release evidence
  bundle，里面包含 Windows 内测 zip 和 `WeisileLink.exe`。这仍然不是生产发布。
- 外部课堂发布：仍需要签名、macOS notarization、Windows code signing、
  timestamp、publisher reputation，以及 clean-machine smoke evidence。

## 0. 先验证安装文件

在 EV3SC 根目录运行：

```bash
cd /Users/yukii/Desktop/EV3SC
install/check_install_files.sh
```

脚本会连续做 3 轮校验，包括：

- 相对链接是否全部有效。
- 关键安装文件 SHA-256 是否匹配。
- ev3dev zip、macOS zip、Windows evidence zip 是否可解压。
- `websockets-7.0.tar.gz` 是否可列出内容。
- macOS Etcher DMG 是否通过 `hdiutil verify`。
- Windows Etcher EXE 是否识别为 Windows/PE/NSIS 可执行文件。
- JSON manifest 和 evidence template 是否可解析。

只有看到：

```text
Install file verification passed after 3 passes.
```

才继续安装。

## 1. 安装文件在哪里

```text
install/
├── Start-VSLE-Setup-Wizard.cmd
├── START_HERE_WINDOWS.txt
├── shared/
│   ├── 01-ev3-sd-card/
│   ├── 02-ev3-server/
│   ├── 03-evidence-templates/
│   └── 04-ai-quest-samples/
├── mac/
│   ├── 01-sd-card/
│   ├── 02-weisilelink-desktop/
│   └── 03-evidence-templates/
└── windows/
    ├── 01-sd-card/
    ├── 02-weisilelink-desktop/
    ├── 03-evidence-templates/
    ├── setup-wizard.ps1
    ├── setup-wizard.xaml
    └── lib/
```

`shared/` 是 EV3 端和课程共用文件。`mac/` 与 `windows/` 是老师电脑端文件。
Windows 下优先双击根目录的 `Start-VSLE-Setup-Wizard.cmd`，不要手动运行
`setup-wizard.ps1`。这个双击入口会调用 Windows 系统自带的 PowerShell 5.1
打开图形向导，启动时不会自动执行安装、解压、刷卡、SSH 或启动程序动作。
Phase B 已将文件校验模块
`windows/lib/InstallFileChecks.psm1` 接入 `Validate Files` 步骤，用于检查哈希、
zip 目录、JSON、XML 和必需路径。Phase C 已将
`windows/lib/WindowsInstallActions.psm1` 接入 `Install WeisileLink Desktop`
步骤，用于把 Windows evidence bundle 展开到临时 staging 并显示确认信息。
老师点击 `Confirm Install` 之前，它不会复制到 `%LocalAppData%`，也不会调用
安装脚本；确认后才复制 staged package、运行 Windows helper，并验证启动命令
指向 `desktop-supervise` 的 localhost 默认端口 `127.0.0.1:20111` 和
`127.0.0.1:8766`。Phase D 已将 `windows/lib/Ev3ConnectionChecks.psm1`
接入 EV3 引导步骤，用于校验 WiFi Full VSLE、Bluetooth Full VSLE 和
USB-assisted setup 输入，生成 EV3 server 的 SSH/SCP 安装计划；老师点击
`Confirm EV3 Install` 之前不会运行 SSH/SCP，也不会保存 SSH 密码或 pairing
token。

要复制到 U 盘并把相对链接展开为真实文件：

```bash
cd /Users/yukii/Desktop/EV3SC
install/make_usb_copy.sh /Volumes/<USB_NAME>/VSLE-Install
```

## 2. 准备硬件

需要：

1. LEGO MINDSTORMS EV3 主机。
2. 8GB 或 16GB microSD/microSDHC 卡。
3. microSD 读卡器。
4. Mac 或 Windows 老师电脑。
5. EV3 mini USB 线。
6. 充足电量或稳定电源。
7. 如果使用 WiFi Full VSLE，准备兼容 EV3 的 WiFi USB dongle。

连接路径：

- 有 WiFi dongle：使用 WiFi Full VSLE。
- 无 WiFi dongle：使用 `Bluetooth Full VSLE`。这仍然要求 EV3 运行 ev3dev。
- `Official Firmware Bluetooth Compatibility` 是有限模式，不能替代 Full VSLE。

## 3. 刷写 ev3dev SD 卡

### macOS

打开：

```text
install/mac/01-sd-card/balenaEtcher-1.17.0.dmg
```

### Windows

打开：

```text
install/windows/01-sd-card/balenaEtcher-Setup-1.17.0.exe
```

### 两个平台都使用同一个 EV3 镜像

```text
install/shared/01-ev3-sd-card/ev3dev-stretch-ev3-generic-2020-04-10.zip
```

Etcher 操作：

1. 插入 microSD 卡。
2. 打开 Balena Etcher。
3. 选择 `Flash from file`。
4. 选择上面的 ev3dev zip。
5. 选择外置 microSD 卡作为 target。
6. 再次确认 target 不是电脑内置磁盘。
7. 点击 `Flash`。
8. 等待写入和验证完成。
9. 安全弹出 SD 卡。

把 SD 卡插入 EV3，开机并等待 ev3dev / Brickman 界面出现。首次启动可能较慢。
不要在 `Starting` 阶段随意断电。

## 4. 第一次登录 EV3

WiFi 可用时，在 EV3 Brickman 菜单里连接网络并记录 IP。

WiFi 不可用时，用 USB 登录。Mac 示例：

```bash
ssh -6 robot@fe80::16:53ff:fe4f:4655%en10
```

默认账号：

```text
username: robot
password: maker
```

`%en10` 只是示例。每台 Mac 的接口名可能不同。

## 5. 安装 EV3 端 VSLE Server

共享安装文件：

```text
install/shared/02-ev3-server/ev3-firmware/
install/shared/02-ev3-server/websockets-7.0.tar.gz
```

在老师电脑复制到 EV3。替换当前 EV3 SSH 地址：

```bash
cd /Users/yukii/Desktop/EV3SC

ssh -6 robot@fe80::16:53ff:fe4f:4655%en10
rm -rf ~/vsle-ev3-firmware
mkdir -p ~/vsle-ev3-firmware
exit

scp -6 -r \
  install/shared/02-ev3-server/ev3-firmware/README.md \
  install/shared/02-ev3-server/ev3-firmware/vsle_ev3_server.py \
  install/shared/02-ev3-server/ev3-firmware/scripts \
  install/shared/02-ev3-server/ev3-firmware/systemd \
  install/shared/02-ev3-server/websockets-7.0.tar.gz \
  'robot@[fe80::16:53ff:fe4f:4655%en10]:~/vsle-ev3-firmware/'
```

在 EV3 上安装离线 `websockets`：

```bash
ssh -6 robot@fe80::16:53ff:fe4f:4655%en10
cd ~/vsle-ev3-firmware

SITE="$(python3 -c 'import site; print(site.USER_SITE)')"
mkdir -p "$SITE"
rm -rf /tmp/websockets-7.0
tar -xzf websockets-7.0.tar.gz -C /tmp
rm -rf "$SITE/websockets"
cp -r /tmp/websockets-7.0/src/websockets "$SITE/websockets"
python3 -c 'import websockets; print(websockets.__version__)'
```

预期：

```text
7.0
```

安装服务：

```bash
python3 -m py_compile vsle_ev3_server.py
python3 - <<'PY'
import ev3dev2, websockets
print('ev3dev2=' + ev3dev2.__version__)
print('websockets=' + websockets.__version__)
PY

SKIP_PIP_INSTALL=1 ./scripts/install.sh
systemctl is-enabled vsle-ev3-server.service
systemctl is-active vsle-ev3-server.service
```

预期：

```text
enabled
active
```

## 6. 启用连接方式

### WiFi Full VSLE

在 EV3 上：

```bash
hostname -I
```

在老师电脑：

```bash
cd /Users/yukii/Desktop/EV3SC
PYTHONPATH=weisile-link \
EV3_IP=<EV3_IP_OR_HOST> \
EV3_WS_PORT=8765 \
WEISILE_TRANSPORT=wifi \
.venv/bin/python -m weisile_link
```

检查本机端口：

```bash
nc -z -w 2 127.0.0.1 20111
```

### Bluetooth Full VSLE

EV3 必须运行 ev3dev 和 EV3SC server。

在 EV3 上读取 Bluetooth 地址：

```bash
hciconfig -a | grep "BD Address"
```

启用 RFCOMM listener：

```bash
cd ~/vsle-ev3-firmware
VSLE_EV3_ENABLE_BLUETOOTH=1 \
  VSLE_EV3_BT_ADDRESS=<EV3_BLUETOOTH_ADDRESS> \
  VSLE_EV3_BT_RFCOMM_CHANNEL=1 \
  SKIP_PIP_INSTALL=1 \
  ./scripts/install.sh
sudo systemctl restart vsle-ev3-server.service
systemctl is-active vsle-ev3-server.service
```

如果 Bluetooth 未启动：

```bash
for f in /sys/class/rfkill/rfkill*/soft; do
  [ -e "$f" ] && echo 0 | sudo tee "$f"
done
sudo hciconfig hci0 up
sudo hciconfig hci0 piscan
printf 'show\nquit\n' | bluetoothctl
```

在 Mac 上配对 EV3 后启动本地 bridge：

```bash
cd /Users/yukii/Desktop/EV3SC

PYTHONPATH=/Users/yukii/Desktop/EV3SC/weisile-link \
WEISILE_TRANSPORT=vsle-bluetooth \
EV3_BT=<EV3_BLUETOOTH_ADDRESS> \
WEISILE_VSLE_BT_ADAPTER=/Users/yukii/Desktop/EV3SC/desktop/build/macos/native/WeisileEV3BluetoothAdapter \
WEISILE_LINK_HOST=127.0.0.1 \
WEISILE_LINK_PORT=20111 \
TRAINER_WS_PORT=8766 \
WEISILE_ALLOWED_ORIGINS="http://101.42.92.6:18612,http://127.0.0.1:8611,http://localhost:8611" \
/Users/yukii/Desktop/EV3SC/.venv/bin/python -c "from weisile_link.cli import main; main()"
```

需要 pairing token 时，只在本机终端隐藏输入：

```bash
printf 'Paste EV3 pairing token, then press Enter: '
IFS= read -rs WEISILE_PAIRING_TOKEN
printf '\n'
export WEISILE_PAIRING_TOKEN
```

不要把 token 写进聊天、截图、日志、证据文件或 git。

## 7. 安装老师电脑端 WeisileLink

### macOS 内部测试

打开：

```text
install/mac/02-weisilelink-desktop/
```

解压：

```text
WeisileLink-macos-0.1.0-internal-unsigned.zip
```

得到 `WeisileLink.app`。unsigned internal build 可能触发 macOS “无法验证开发者”
提示，这是内部测试预期行为。外部课堂发布必须使用 signed + notarized 包。

### Windows 内部测试

打开：

```text
install/windows/02-weisilelink-desktop/
```

解压：

```text
windows-internal-release-evidence.zip
```

里面包含：

```text
desktop/release/internal/windows/WeisileLink/WeisileLink.exe
desktop/release/internal/windows/WeisileLink-windows-0.1.0-internal-unsigned.zip
desktop/release/internal/windows/WeisileLink-windows-0.1.0-internal-manifest.json
```

这是 unsigned internal test release evidence，不是生产发布包。外部课堂需要
Windows code signing、timestamp 和 clean-machine smoke evidence。

## 8. 打开 ScratchAI

确认 WeisileLink 监听：

```text
127.0.0.1:20111
127.0.0.1:8766
```

打开：

```text
http://101.42.92.6:18612/
```

课堂操作：

1. 等待 ScratchAI 加载。
2. 点击左下角扩展按钮。
3. 选择 VSLE-EV3 / EV3 扩展。
4. 确认出现红色 EV3 积木分类。
5. 选择 `WiFi Full VSLE` 或 `Bluetooth Full VSLE`。
6. 不要用 `Official Firmware Bluetooth Compatibility` 做 AI Quest 或完整模块课程。
7. 观察传感器 reporter 和面板是否实时更新。

## 9. 验证和证据

共享模板：

```text
install/shared/03-evidence-templates/
```

macOS release-artifact 模板：

```text
install/mac/03-evidence-templates/
```

Windows release-artifact 模板：

```text
install/windows/03-evidence-templates/
```

内部自用 Bluetooth Full VSLE 验证：

```bash
cd /Users/yukii/Desktop/EV3SC
.venv/bin/python scripts/run_vsle_bluetooth_smoke.py \
  --self-use-unsigned \
  --evidence docs/classroom/vsle_bluetooth_full_module_smoke.json \
  --report docs/classroom/vsle_bluetooth_self_use_unsigned.md
```

端口矩阵：

```bash
.venv/bin/python scripts/run_vsle_bluetooth_sensor_port_matrix.py \
  --evidence docs/classroom/vsle_bluetooth_sensor_port_matrix.json \
  --report docs/classroom/vsle_bluetooth_sensor_port_matrix.md
```

发布安装证据必须来自 release artifact 的 clean-machine 安装：

```bash
python scripts/run_desktop_install_smoke.py \
  --mode vsle-bluetooth \
  --evidence docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.json \
  --report docs/desktop/evidence/macos-vsle-bluetooth-install-smoke.md
```

## 10. 安全检查

上课前：

1. EV3 电量充足。
2. 机器人放在地面或低测试垫上。
3. 轮子和机械结构周围没有手。
4. WeisileLink 默认只绑定 `127.0.0.1`。
5. ScratchAI 加载 Unsandboxed VSLE-EV3 扩展。
6. Reporter 和 Boolean 积木读取 `SensorCache`，不在执行时发网络请求。
7. 紧急停止流程可见：
   - 先按 Scratch 红色停止按钮。
   - 再停止 WeisileLink。
   - 如仍有动作，关闭 EV3。

## 11. 完成标准

内部测试最低标准：

- `install/check_install_files.sh` 三轮通过。
- EV3 成功进入 ev3dev。
- `vsle-ev3-server.service` 为 `active`。
- WeisileLink 监听 `127.0.0.1:20111` 和 `127.0.0.1:8766`。
- ScratchAI 加载红色 EV3 分类。
- `WiFi Full VSLE` 或 `Bluetooth Full VSLE` 有真实 EV3 sensor update。

外部发布还必须满足：

- macOS signed + notarized。
- Windows signed + timestamped。
- 安装来自 release artifact。
- 重新登录或重启后自动启动。
- 诊断导出默认脱敏。
- uninstall 可验证。
- `scripts/run_desktop_install_smoke.py` 接受对应 evidence。
