# VSLE Scratch-EV3 安装向导包

这个文件夹把 VSLE Scratch-EV3 课堂安装需要的本地材料集中到一个入口中。

请从这里开始：

- `安装向导.md`：面向老师和助教的逐步安装说明。
- `INSTALL_FILES_MANIFEST.md`：本向导包引用的安装文件、校验值和适用状态。
- `check_install_files.sh`：在当前 EV3SC 仓库内校验安装文件是否存在且哈希匹配。
- `files/`：按安装顺序组织的本地安装资产入口。

重要状态：

- macOS WeisileLink 当前包是 unsigned Internal Test Release，可用于内部自测。
- Windows 当前只放入安装/卸载/构建脚本，未包含 Windows release zip。
- 外部课堂发布仍需要签名、macOS notarization、Windows code signing 和 clean-machine 安装证据。

运行本地文件校验：

```bash
cd /Users/yukii/Desktop/EV3SC
install-wizard/check_install_files.sh
```

如果要把这个向导包复制到 U 盘，并让相对链接指向的实际文件一起复制，请在 macOS 终端使用：

```bash
cp -RL install-wizard /Volumes/<USB_NAME>/VSLE-Install-Wizard
```

不要把 EV3 pairing token、学生数据、API key 或诊断原始日志放进这个向导包。
