@echo off
setlocal

set "INSTALL_ROOT=%~dp0"
set "WIZARD_SCRIPT=%INSTALL_ROOT%windows\setup-wizard.ps1"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if not exist "%POWERSHELL_EXE%" (
    echo Windows PowerShell 5.1 was not found.
    echo Please use Windows 10 or Windows 11 with Windows PowerShell enabled.
    pause
    exit /b 1
)

if not exist "%WIZARD_SCRIPT%" (
    echo VSLE setup wizard file is missing:
    echo %WIZARD_SCRIPT%
    echo.
    echo Please copy the whole VSLE-Install folder again.
    pause
    exit /b 1
)

cd /d "%INSTALL_ROOT%windows"
"%POWERSHELL_EXE%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%WIZARD_SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo VSLE setup wizard exited with code %EXIT_CODE%.
    echo Please send this window screenshot to the VSLE support team.
    pause
)

exit /b %EXIT_CODE%
