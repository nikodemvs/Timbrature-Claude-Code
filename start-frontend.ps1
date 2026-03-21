param(
    [int]$Port = 8081,
    [int]$BackendPort = 8000,
    [switch]$WaitForReady,
    [switch]$NoClearCache,
    [switch]$ForceRestart,
    [switch]$NoResponsively
)

$ErrorActionPreference = "Stop"

$repoRoot = $PSScriptRoot
$frontendDir = Join-Path $repoRoot "frontend"
$runtimeDir = Join-Path $env:TEMP "Timbrature-Codex-runtime"
$pidPath = Join-Path $runtimeDir "frontend.pid"
$logPath = Join-Path $runtimeDir "frontend.log"
$errorLogPath = Join-Path $runtimeDir "frontend.err.log"

function Get-ExistingProcess {
    param([string]$PidFile)

    if (-not (Test-Path -LiteralPath $PidFile)) {
        return $null
    }

    $pidValue = Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $pidValue) {
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
        return $null
    }

    $process = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
    if ($process) {
        return $process
    }

    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    return $null
}

function Stop-RunningProcess {
    param(
        [System.Diagnostics.Process]$Process,
        [string]$PidFile
    )

    if (-not $Process) {
        return
    }

    & taskkill /PID $Process.Id /T /F | Out-Null
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

function Wait-UrlReady {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 180
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $successCount = 0
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -lt 500) {
                $successCount += 1
                if ($successCount -ge 2) {
                    return
                }
                Start-Sleep -Seconds 1
                continue
            }
        } catch {
            $successCount = 0
        }
        Start-Sleep -Seconds 2
    }

    throw "Timeout in attesa di $Url"
}

function Get-NpxCommand {
    $npx = Get-Command npx -ErrorAction SilentlyContinue
    if ($npx) {
        return $npx.Source
    }

    $npxCmd = Get-Command npx.cmd -ErrorAction SilentlyContinue
    if ($npxCmd) {
        return $npxCmd.Source
    }

    throw "npx non trovato nel PATH."
}

function Get-ResponsivelyLauncher {
    if ($env:RESPONSIVELY_APP_PATH -and (Test-Path -LiteralPath $env:RESPONSIVELY_APP_PATH)) {
        return @{
            Type = "exe"
            Target = $env:RESPONSIVELY_APP_PATH
        }
    }

    $commands = Get-Command ResponsivelyApp, ResponsivelyApp.exe, responsivelyapp, responsivelyapp.exe -ErrorAction SilentlyContinue
    if ($commands) {
        $command = $commands | Select-Object -First 1
        return @{
            Type = "exe"
            Target = $command.Source
        }
    }

    $knownPaths = @(
        (Join-Path $env:LOCALAPPDATA "Programs\\ResponsivelyApp\\ResponsivelyApp.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\\Responsively App\\ResponsivelyApp.exe"),
        (Join-Path $env:ProgramFiles "ResponsivelyApp\\ResponsivelyApp.exe"),
        (Join-Path $env:ProgramFiles "Responsively App\\ResponsivelyApp.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "ResponsivelyApp\\ResponsivelyApp.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Responsively App\\ResponsivelyApp.exe")
    ) | Where-Object { $_ }

    $existingPath = $knownPaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($existingPath) {
        return @{
            Type = "exe"
            Target = $existingPath
        }
    }

    if (Test-Path "Registry::HKEY_CLASSES_ROOT\\responsively") {
        return @{
            Type = "protocol"
            Target = "responsively://"
        }
    }

    return $null
}

function Open-InResponsively {
    param([string]$Url)

    $launcher = Get-ResponsivelyLauncher
    if (-not $launcher) {
        Write-Warning "Responsively App non trovata. Installa l'app oppure imposta RESPONSIVELY_APP_PATH. URL disponibile: $Url"
        return $false
    }

    $responsivelyUrl = "responsively://$Url"

    if ($launcher.Type -eq "protocol") {
        Start-Process $responsivelyUrl | Out-Null
        return $true
    }

    try {
        Start-Process -FilePath $launcher.Target -ArgumentList @($Url) | Out-Null
        return $true
    } catch {
        Write-Warning "Impossibile avviare Responsively App con $($launcher.Target). URL disponibile: $Url"
        return $false
    }
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

$processoEsistente = Get-ExistingProcess -PidFile $pidPath
if ($processoEsistente) {
    if ($ForceRestart) {
        Write-Host "Frontend gia attivo: riavvio forzato in corso..."
        Stop-RunningProcess -Process $processoEsistente -PidFile $pidPath
    } else {
        Write-Host "Frontend gia avviato su http://127.0.0.1:$Port"
        if ($WaitForReady) {
            Wait-UrlReady -Url "http://127.0.0.1:$Port"
        }
        return
    }
}

$npxCommand = Get-NpxCommand
$clearFlag = ""
if (-not $NoClearCache) {
    $clearFlag = "--clear"
}

$command = @"
Set-Location -LiteralPath '$frontendDir'
`$env:CI = '1'
`$env:BROWSER = 'none'
`$env:EXPO_PUBLIC_BACKEND_URL = 'http://127.0.0.1:$BackendPort'
& '$npxCommand' expo start --web --port $Port $clearFlag
"@

$process = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command) `
    -WindowStyle Hidden `
    -RedirectStandardOutput $logPath `
    -RedirectStandardError $errorLogPath `
    -PassThru

Set-Content -LiteralPath $pidPath -Value $process.Id

if ($WaitForReady) {
    Wait-UrlReady -Url "http://127.0.0.1:$Port"
}

$frontendUrl = "http://127.0.0.1:$Port"
if (-not $NoResponsively) {
    Open-InResponsively -Url $frontendUrl | Out-Null
}

Write-Host "Frontend avviato su $frontendUrl"
Write-Host "Backend collegato: http://127.0.0.1:$BackendPort"
Write-Host "Log: $logPath"
