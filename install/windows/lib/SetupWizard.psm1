Set-StrictMode -Version Latest

$Script:VlseSetupWizardSteps = @(
    @{
        Id = "welcome"
        Number = 0
        Title = "Welcome"
        Mode = "manual"
        Status = "needs_manual_action"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "Internal VSLE Windows setup wizard for guided classroom testing."
        AutomaticActions = @(
            "Confirm this wizard is running from install/windows or a USB copy.",
            "Show the unsigned internal testing status before any setup work."
        )
        ManualActions = @(
            "Keep the EV3, SD card, USB cable, and Bluetooth settings available.",
            "Confirm this build is for internal testing unless a signed release is supplied."
        )
        Evidence = "No installation actions run in Phase A."
        NextEnabledWhen = "Teacher confirms the internal testing notice."
        ProductionReleaseReady = $false
    }
    @{
        Id = "validate-files"
        Number = 1
        Title = "Verify installation files"
        Mode = "automatic"
        Status = "pending"
        Blocking = $true
        ManualConfirmationRequired = $false
        Summary = "Verify hashes, archive contents, receipt JSON, and shared EV3 files."
        AutomaticActions = @(
            "Validate the Etcher installer and ev3dev image hashes.",
            "Validate the Windows internal release evidence zip.",
            "Check expected zip entries and shared EV3 firmware files."
        )
        ManualActions = @("Wait for the validation result.")
        Evidence = "Phase B will write detailed pass/fail evidence."
        NextEnabledWhen = "All file checks pass."
        ProductionReleaseReady = $false
    }
    @{
        Id = "prepare-sd-card"
        Number = 2
        Title = "Prepare SD card"
        Mode = "human-confirmed"
        Status = "needs_manual_action"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "Guide Etcher-based ev3dev SD card flashing without choosing the disk automatically."
        AutomaticActions = @(
            "Show the Etcher and ev3dev image paths.",
            "Copy the image path for teacher convenience."
        )
        ManualActions = @(
            "Choose the SD card target in Etcher.",
            "Confirm Etcher completed validation and the SD card was safely ejected."
        )
        Evidence = "Teacher confirmation timestamp belongs to Phase D evidence capture."
        NextEnabledWhen = "Teacher confirms the SD card is ready."
        ProductionReleaseReady = $false
    }
    @{
        Id = "ev3-first-boot"
        Number = 3
        Title = "EV3 first boot"
        Mode = "human-confirmed"
        Status = "needs_manual_action"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "Guide the first ev3dev boot and confirm the Brickman screen is visible."
        AutomaticActions = @("Show the first-boot checklist and expected wait range.")
        ManualActions = @(
            "Insert the prepared SD card.",
            "Power on the EV3.",
            "Confirm the ev3dev / Brickman page appears."
        )
        Evidence = "Optional EV3 classroom label belongs to Phase D evidence capture."
        NextEnabledWhen = "Teacher confirms the first boot completed."
        ProductionReleaseReady = $false
    }
    @{
        Id = "choose-transport"
        Number = 4
        Title = "Choose transport"
        Mode = "needs-input"
        Status = "needs_input"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "Choose WiFi Full VSLE, Bluetooth Full VSLE, or USB-assisted setup."
        AutomaticActions = @("Show the supported transport choices and required inputs.")
        ManualActions = @(
            "Enter EV3 IP/hostname for WiFi or EV3 Bluetooth address for Bluetooth Full VSLE.",
            "Keep official-firmware Bluetooth separate from Full VSLE."
        )
        Evidence = "Selected transport will be recorded in the setup report."
        NextEnabledWhen = "A valid transport path and required input are supplied."
        ProductionReleaseReady = $false
    }
    @{
        Id = "install-ev3-server"
        Number = 5
        Title = "Install EV3 server"
        Mode = "guided-automatic"
        Status = "pending"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "Copy and install EV3SC-owned server files after teacher-provided SSH details."
        AutomaticActions = @(
            "Test SSH reachability.",
            "Copy EV3 firmware files.",
            "Run the offline websockets and EV3 server install commands."
        )
        ManualActions = @(
            "Provide SSH host, username, and secure password prompt.",
            "Confirm EV3 server service status."
        )
        Evidence = "Service status evidence will be collected in Phase D."
        NextEnabledWhen = "EV3 server service is active."
        ProductionReleaseReady = $false
    }
    @{
        Id = "enable-bluetooth-full-vsle"
        Number = 6
        Title = "Enable Bluetooth Full VSLE"
        Mode = "human-guided"
        Status = "skipped"
        Blocking = $false
        ManualConfirmationRequired = $true
        Summary = "Only shown for Bluetooth Full VSLE, where EV3 still runs ev3dev and VSLE server."
        AutomaticActions = @(
            "Show EV3-side Bluetooth Full VSLE enablement commands.",
            "Offer SSH-assisted command execution after confirmation."
        )
        ManualActions = @(
            "Pair EV3 in Windows Bluetooth settings.",
            "Confirm Windows shows the EV3 paired or connected."
        )
        Evidence = "Bluetooth pairing evidence stays teacher-confirmed and redacted."
        NextEnabledWhen = "Teacher confirms pairing or chooses WiFi fallback."
        ProductionReleaseReady = $false
    }
    @{
        Id = "install-weisilelink-desktop"
        Number = 7
        Title = "Install WeisileLink Desktop"
        Mode = "automatic"
        Status = "pending"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "Install the unsigned internal WeisileLink Desktop bundle for testing."
        AutomaticActions = @(
            "Expand the Windows internal evidence bundle.",
            "Copy WeisileLink executable and helpers to the local app directory.",
            "Create config, log, diagnostics, and startup paths."
        )
        ManualActions = @("Acknowledge any unknown-publisher warning for unsigned internal testing.")
        Evidence = "Install path and manifest hash belong to Phase C evidence capture."
        NextEnabledWhen = "Desktop files and startup entry are verified."
        ProductionReleaseReady = $false
    }
    @{
        Id = "verify-local-bridge"
        Number = 8
        Title = "Start and verify local bridge"
        Mode = "automatic"
        Status = "pending"
        Blocking = $true
        ManualConfirmationRequired = $false
        Summary = "Start WeisileLink Desktop supervisor and verify localhost endpoints."
        AutomaticActions = @(
            "Start desktop-supervise.",
            "Check 127.0.0.1:20111.",
            "Check 127.0.0.1:8766."
        )
        ManualActions = @("Proceed to pairing recovery if no saved EV3 profile exists.")
        Evidence = "Local port evidence will be recorded in the final setup report."
        NextEnabledWhen = "Both localhost endpoints pass."
        ProductionReleaseReady = $false
    }
    @{
        Id = "open-scratchai"
        Number = 9
        Title = "Open ScratchAI"
        Mode = "human-confirmed"
        Status = "needs_manual_action"
        Blocking = $true
        ManualConfirmationRequired = $true
        Summary = "Open ScratchAI and ask the teacher to confirm the EV3 extension loads."
        AutomaticActions = @("Open the configured ScratchAI URL.")
        ManualActions = @(
            "Choose the VSLE-EV3 extension.",
            "Confirm the red EV3 category appears.",
            "Confirm live sensor values update."
        )
        Evidence = "Teacher confirmation will be included in the setup report."
        NextEnabledWhen = "Teacher confirms ScratchAI EV3 extension readiness."
        ProductionReleaseReady = $false
    }
    @{
        Id = "finish-report"
        Number = 10
        Title = "Finish and export report"
        Mode = "automatic"
        Status = "blocked"
        Blocking = $true
        ManualConfirmationRequired = $false
        Summary = "Write setup report JSON and Markdown with redacted diagnostics."
        AutomaticActions = @(
            "Write setup-wizard-report.json.",
            "Write setup-wizard-report.md.",
            "Offer diagnostics export."
        )
        ManualActions = @("Review what passed and what remains gated.")
        Evidence = "Unsigned internal builds keep production_release_ready false."
        NextEnabledWhen = "Report is written without secrets."
        ProductionReleaseReady = $false
    }
)

function Get-VsleSetupWizardSteps {
    [CmdletBinding()]
    param()

    return $Script:VlseSetupWizardSteps | ForEach-Object {
        [PSCustomObject]$_
    }
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

Export-ModuleMember -Function Get-VsleSetupWizardSteps, Get-VsleSetupWizardProgress
