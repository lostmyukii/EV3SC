Set-StrictMode -Version Latest

function Get-VsleDefaultInstallRoot {
    [CmdletBinding()]
    param()

    return (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
}

function New-VsleCheckResult {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$Category,
        [Parameter(Mandatory = $true)]
        [bool]$Required,
        [Parameter(Mandatory = $true)]
        [bool]$Passed,
        [Parameter(Mandatory = $true)]
        [string]$Message,
        [string]$Path = ""
    )

    [PSCustomObject]@{
        Name = $Name
        Category = $Category
        Required = $Required
        Passed = $Passed
        Status = if ($Passed) { "passed" } elseif ($Required) { "blocked" } else { "warning" }
        Path = $Path
        Message = $Message
    }
}

function Get-VsleInstallFileCheckPlan {
    [CmdletBinding()]
    param()

    [PSCustomObject]@{
        Hashes = @(
            @{
                Name = "Windows Etcher installer hash"
                Path = "windows/01-sd-card/balenaEtcher-Setup-1.17.0.exe"
                Sha256 = "63cff656853143d33128e66d9d2bd824d1f87c74256ed1c5e7927556bcf2b684"
                Required = $true
            }
            @{
                Name = "ev3dev EV3 image hash"
                Path = "shared/01-ev3-sd-card/ev3dev-stretch-ev3-generic-2020-04-10.zip"
                Sha256 = "f7f1e8c28b57a5b6af098f23868cb7c2210e90bf803ebfa23d8fb99c2c717e62"
                Required = $true
            }
            @{
                Name = "Windows internal release evidence hash"
                Path = "windows/02-weisilelink-desktop/windows-internal-release-evidence.zip"
                Sha256 = "1853a7de52b37c683247440afa8cf66d112fe19993bc5876f4a20f1528c75fb0"
                Required = $true
            }
            @{
                Name = "Windows internal release receipt hash"
                Path = "windows/02-weisilelink-desktop/windows-internal-release-download-receipt.json"
                Sha256 = "79ef79d72578c9adcf6a6ed4377313fdf37482fbd83896465c3e485c88e91e22"
                Required = $true
            }
        )
        Exists = @(
            @{
                Name = "EV3 server"
                Path = "shared/02-ev3-server/ev3-firmware/vsle_ev3_server.py"
                Required = $true
            }
            @{
                Name = "EV3 install wrapper"
                Path = "shared/02-ev3-server/ev3-firmware/scripts/install.sh"
                Required = $true
            }
            @{
                Name = "EV3 autostart installer"
                Path = "shared/02-ev3-server/ev3-firmware/scripts/install_ev3_autostart.sh"
                Required = $true
            }
            @{
                Name = "EV3 Windows remote install checker"
                Path = "shared/02-ev3-server/ev3-firmware/scripts/windows_install_and_check.sh"
                Required = $true
            }
            @{
                Name = "EV3 systemd unit"
                Path = "shared/02-ev3-server/ev3-firmware/systemd/vsle-ev3-server.service"
                Required = $true
            }
            @{
                Name = "Windows helper install script"
                Path = "windows/02-weisilelink-desktop/install-windows.ps1"
                Required = $true
            }
            @{
                Name = "Windows helper uninstall script"
                Path = "windows/02-weisilelink-desktop/uninstall-windows.ps1"
                Required = $true
            }
            @{
                Name = "Windows service metadata"
                Path = "windows/02-weisilelink-desktop/weisile-link-service.xml"
                Required = $true
            }
        )
        Json = @(
            @{
                Name = "Windows receipt JSON"
                Path = "windows/02-weisilelink-desktop/windows-internal-release-download-receipt.json"
                Required = $true
            }
            @{
                Name = "Windows install evidence template JSON"
                Path = "windows/03-evidence-templates/windows-vsle-bluetooth-install-smoke.template.json"
                Required = $true
            }
        )
        Xml = @(
            @{
                Name = "Windows setup wizard XAML"
                Path = "windows/setup-wizard.xaml"
                Required = $true
            }
            @{
                Name = "Windows service XML"
                Path = "windows/02-weisilelink-desktop/weisile-link-service.xml"
                Required = $true
            }
        )
        ZipEntries = @(
            @{
                Name = "Windows internal release zip entries"
                Path = "windows/02-weisilelink-desktop/windows-internal-release-evidence.zip"
                Required = $true
                Entries = @(
                    "desktop/release/internal/windows/WeisileLink/WeisileLink.exe",
                    "desktop/release/internal/windows/WeisileLink/install.ps1",
                    "desktop/release/internal/windows/WeisileLink/uninstall.ps1",
                    "desktop/release/internal/windows/WeisileLink/weisile-link-service.xml",
                    "desktop/release/internal/windows/WeisileLink-windows-0.1.0-internal-manifest.json",
                    "desktop/release/internal/windows/WeisileLink-windows-0.1.0-internal-unsigned.zip"
                )
            }
        )
    }
}

function Test-VsleHashFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallRoot,
        [Parameter(Mandatory = $true)]
        [hashtable]$Check
    )

    $path = Join-Path $InstallRoot $Check.Path
    if (-not (Test-Path -LiteralPath $path)) {
        return New-VsleCheckResult -Name $Check.Name -Category "hash" -Required $Check.Required -Passed $false -Path $Check.Path -Message "File is missing."
    }

    $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    $expected = $Check.Sha256.ToLowerInvariant()
    if ($actual -eq $expected) {
        return New-VsleCheckResult -Name $Check.Name -Category "hash" -Required $Check.Required -Passed $true -Path $Check.Path -Message "SHA-256 matched."
    }

    return New-VsleCheckResult -Name $Check.Name -Category "hash" -Required $Check.Required -Passed $false -Path $Check.Path -Message "SHA-256 mismatch."
}

function Test-VsleExistingFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallRoot,
        [Parameter(Mandatory = $true)]
        [hashtable]$Check
    )

    $path = Join-Path $InstallRoot $Check.Path
    $exists = Test-Path -LiteralPath $path
    return New-VsleCheckResult -Name $Check.Name -Category "exists" -Required $Check.Required -Passed $exists -Path $Check.Path -Message $(if ($exists) { "Path is present." } else { "Path is missing." })
}

function Test-VsleJsonFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallRoot,
        [Parameter(Mandatory = $true)]
        [hashtable]$Check
    )

    $path = Join-Path $InstallRoot $Check.Path
    if (-not (Test-Path -LiteralPath $path)) {
        return New-VsleCheckResult -Name $Check.Name -Category "json" -Required $Check.Required -Passed $false -Path $Check.Path -Message "JSON file is missing."
    }

    try {
        [void](Get-Content -LiteralPath $path -Raw | ConvertFrom-Json)
        return New-VsleCheckResult -Name $Check.Name -Category "json" -Required $Check.Required -Passed $true -Path $Check.Path -Message "JSON parsed."
    } catch {
        return New-VsleCheckResult -Name $Check.Name -Category "json" -Required $Check.Required -Passed $false -Path $Check.Path -Message "JSON parse failed."
    }
}

function Test-VsleXmlFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallRoot,
        [Parameter(Mandatory = $true)]
        [hashtable]$Check
    )

    $path = Join-Path $InstallRoot $Check.Path
    if (-not (Test-Path -LiteralPath $path)) {
        return New-VsleCheckResult -Name $Check.Name -Category "xml" -Required $Check.Required -Passed $false -Path $Check.Path -Message "XML file is missing."
    }

    try {
        [void]([xml](Get-Content -LiteralPath $path -Raw))
        return New-VsleCheckResult -Name $Check.Name -Category "xml" -Required $Check.Required -Passed $true -Path $Check.Path -Message "XML parsed."
    } catch {
        return New-VsleCheckResult -Name $Check.Name -Category "xml" -Required $Check.Required -Passed $false -Path $Check.Path -Message "XML parse failed."
    }
}

function Test-VsleZipEntries {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallRoot,
        [Parameter(Mandatory = $true)]
        [hashtable]$Check
    )

    $path = Join-Path $InstallRoot $Check.Path
    if (-not (Test-Path -LiteralPath $path)) {
        return New-VsleCheckResult -Name $Check.Name -Category "zip" -Required $Check.Required -Passed $false -Path $Check.Path -Message "Zip file is missing."
    }

    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $archive = [System.IO.Compression.ZipFile]::OpenRead($path)
        try {
            $names = @($archive.Entries | ForEach-Object { $_.FullName })
            $missing = @($Check.Entries | Where-Object { $_ -notin $names })
        } finally {
            $archive.Dispose()
        }
    } catch {
        return New-VsleCheckResult -Name $Check.Name -Category "zip" -Required $Check.Required -Passed $false -Path $Check.Path -Message "Zip read failed."
    }

    if ($missing.Count -eq 0) {
        return New-VsleCheckResult -Name $Check.Name -Category "zip" -Required $Check.Required -Passed $true -Path $Check.Path -Message "Expected zip entries are present."
    }

    return New-VsleCheckResult -Name $Check.Name -Category "zip" -Required $Check.Required -Passed $false -Path $Check.Path -Message "Missing zip entries: $($missing -join ', ')"
}

function Invoke-VsleInstallFileChecks {
    [CmdletBinding()]
    param(
        [string]$InstallRoot = (Get-VsleDefaultInstallRoot)
    )

    $plan = Get-VsleInstallFileCheckPlan
    $results = @()

    foreach ($check in $plan.Hashes) {
        $results += Test-VsleHashFile -InstallRoot $InstallRoot -Check $check
    }
    foreach ($check in $plan.Exists) {
        $results += Test-VsleExistingFile -InstallRoot $InstallRoot -Check $check
    }
    foreach ($check in $plan.Json) {
        $results += Test-VsleJsonFile -InstallRoot $InstallRoot -Check $check
    }
    foreach ($check in $plan.Xml) {
        $results += Test-VsleXmlFile -InstallRoot $InstallRoot -Check $check
    }
    foreach ($check in $plan.ZipEntries) {
        $results += Test-VsleZipEntries -InstallRoot $InstallRoot -Check $check
    }

    $blocked = @($results | Where-Object { $_.Required -and -not $_.Passed })
    $warnings = @($results | Where-Object { -not $_.Required -and -not $_.Passed })
    $status = if ($blocked.Count -gt 0) {
        "blocked"
    } elseif ($warnings.Count -gt 0) {
        "warning"
    } else {
        "passed"
    }

    $evidence = ($results | ForEach-Object {
        "$($_.Status): $($_.Name) [$($_.Path)] - $($_.Message)"
    }) -join [Environment]::NewLine

    [PSCustomObject]@{
        Status = $status
        Passed = ($status -eq "passed")
        Blocking = ($status -eq "blocked")
        CheckedAt = (Get-Date).ToString("s")
        Summary = "Install file validation: $($results.Count) checks, $($blocked.Count) blocked, $($warnings.Count) warnings."
        Evidence = $evidence
        Results = $results
    }
}

Export-ModuleMember -Function Get-VsleInstallFileCheckPlan, Invoke-VsleInstallFileChecks, Test-VsleZipEntries, Test-VsleJsonFile, Test-VsleXmlFile
