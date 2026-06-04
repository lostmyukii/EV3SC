# VSLE Scratch-EV3 Install Folder

This folder is the consolidated installation entry point for the VSLE
Scratch-EV3 platform.

Start with:

- `Start-VSLE-Setup-Wizard.cmd` on Windows when users want a double-click
  graphical setup entry instead of manual `.ps1` commands.
- `START_HERE_WINDOWS.txt` for the short Windows handoff note.
- `VSLE_Scratch-EV3_完整安装向导.md` for the full Chinese step-by-step guide.
- `mac/README.md` for macOS teacher-computer installation.
- `windows/README.md` for Windows teacher-computer installation.
- `shared/` for EV3-side materials used by both macOS and Windows.
- `check_install_files.sh` for repeated validation of all local install assets.
- `make_usb_copy.sh` for creating a portable copy with symlinks expanded.

Run the verification from the repository root:

```bash
cd /Users/yukii/Desktop/EV3SC
install/check_install_files.sh
```

This folder intentionally keeps large local downloads as relative links to
EV3SC-owned assets. To create a USB-ready copy that contains real files:

```bash
cd /Users/yukii/Desktop/EV3SC
install/make_usb_copy.sh /Volumes/<USB_NAME>/VSLE-Install
```

Do not store EV3 pairing tokens, API keys, student data, or raw diagnostics in
this folder.
