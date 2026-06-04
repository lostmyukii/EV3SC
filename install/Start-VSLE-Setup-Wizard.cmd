@echo off
setlocal

set "INSTALL_ROOT=%~dp0"
set "WIZARD_SCRIPT=%INSTALL_ROOT%windows\setup-wizard.ps1"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if not exist "%POWERSHELL_EXE%" (
    echo 未找到 Windows PowerShell 5.1。
    echo 请使用已启用 Windows PowerShell 的 Windows 10 或 Windows 11。
    pause
    exit /b 1
)

if not exist "%WIZARD_SCRIPT%" (
    echo 缺少 VSLE 安装向导文件：
    echo %WIZARD_SCRIPT%
    echo.
    echo 请重新复制完整的 VSLE-Install 文件夹。
    pause
    exit /b 1
)

echo 正在打开 VSLE Scratch-EV3 安装向导...
cd /d "%INSTALL_ROOT%windows"
"%POWERSHELL_EXE%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%WIZARD_SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo VSLE 安装向导退出，代码：%EXIT_CODE%。
    echo 请把这个窗口截图发送给 VSLE 支持人员。
    pause
)

exit /b %EXIT_CODE%
