param(
    [int]$Port = 8083,
    [int]$BackendPort = 8001,
    [switch]$WaitForReady,
    [switch]$NoClearCache,
    [switch]$ForceRestart,
    [switch]$NoResponsively,
    [switch]$Foreground,
    [string]$FrontendDir,
    [string]$RuntimeDir
)

$ErrorActionPreference = "Stop"

$repoRoot = $PSScriptRoot
if (-not $FrontendDir) {
    $frontendDir = Join-Path $repoRoot "frontend"
} else {
    $frontendDir = $FrontendDir
}
if (-not (Test-Path -LiteralPath $frontendDir)) {
    throw "Directory frontend non trovata: $frontendDir"
}
if (-not $RuntimeDir) {
    $runtimeDir = Join-Path $env:TEMP "Timbrature-runtime"
}
$pidPath = Join-Path $runtimeDir "frontend.pid"
$logPath = Join-Path $runtimeDir "frontend.log"
$errorLogPath = Join-Path $runtimeDir "frontend.err.log"
$responsivelyLogPath = Join-Path $runtimeDir "responsively.log"
$responsivelyErrorLogPath = Join-Path $runtimeDir "responsively.err.log"

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

function Stop-ProcessesOnPort {
    param([int]$Port)

    $pids = @()
    netstat -aon | Select-String ":${Port}\s" | ForEach-Object {
        $parts = $_.ToString().Trim() -split '\s+'
        $pidValue = $parts[-1]
        if ($pidValue -match '^\d+$' -and [int]$pidValue -gt 0) {
            $pids += [int]$pidValue
        }
    }

    foreach ($pidValue in ($pids | Select-Object -Unique)) {
        & taskkill /PID $pidValue /T /F | Out-Null
    }
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

function Get-NodeCommand {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        return $node.Source
    }

    $nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($nodeCmd) {
        return $nodeCmd.Source
    }

    throw "node non trovato nel PATH."
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
        $previousElectronLogging = $env:ELECTRON_ENABLE_LOGGING
        $env:ELECTRON_ENABLE_LOGGING = "0"
        try {
            Start-Process `
                -FilePath $launcher.Target `
                -ArgumentList @($Url) `
                -WindowStyle Hidden `
                -RedirectStandardOutput $responsivelyLogPath `
                -RedirectStandardError $responsivelyErrorLogPath | Out-Null
        } finally {
            if ($null -eq $previousElectronLogging) {
                Remove-Item Env:ELECTRON_ENABLE_LOGGING -ErrorAction SilentlyContinue
            } else {
                $env:ELECTRON_ENABLE_LOGGING = $previousElectronLogging
            }
        }
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
        Stop-ProcessesOnPort -Port $Port
    } else {
        Write-Host "Frontend gia avviato su http://127.0.0.1:$Port"
        if ($WaitForReady) {
            Wait-UrlReady -Url "http://127.0.0.1:$Port"
        }
        return
    }
} elseif ($ForceRestart) {
    Stop-ProcessesOnPort -Port $Port
}

$nodeCommand = Get-NodeCommand
$clearArgument = ""
if (-not $NoClearCache) {
    $clearArgument = " --clear"
}

if ($Foreground) {
    Set-Location -LiteralPath $frontendDir
    $env:CI = "1"
    $env:BROWSER = "none"
    $env:EXPO_PUBLIC_BACKEND_URL = "http://127.0.0.1:$BackendPort"
    if ($NoClearCache) {
        & $nodeCommand "node_modules/expo/bin/cli" start --web --port $Port
    } else {
        & $nodeCommand "node_modules/expo/bin/cli" start --web --port $Port --clear
    }
    exit $LASTEXITCODE
}

$command = @"
Set-Location -LiteralPath '$frontendDir'
`$env:CI = '1'
`$env:BROWSER = 'none'
`$env:EXPO_PUBLIC_BACKEND_URL = 'http://127.0.0.1:$BackendPort'
& '$nodeCommand' 'node_modules/expo/bin/cli' start --web --port $Port$clearArgument
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
