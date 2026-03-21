param(
    [int]$Port = 8000,
    [switch]$WaitForReady,
    [switch]$ForceRestart
)

$ErrorActionPreference = "Stop"

$repoRoot = $PSScriptRoot
$backendDir = Join-Path $repoRoot "backend"
$runtimeDir = Join-Path $env:TEMP "Timbrature-Codex-runtime"
$pidPath = Join-Path $runtimeDir "backend.pid"
$logPath = Join-Path $runtimeDir "backend.log"
$errorLogPath = Join-Path $runtimeDir "backend.err.log"

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
        [int]$TimeoutSeconds = 90
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

function Get-PythonCommand {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return $python.Source
    }

    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        return $pyLauncher.Source
    }

    throw "Python non trovato nel PATH."
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

$processoEsistente = Get-ExistingProcess -PidFile $pidPath
if ($processoEsistente) {
    if ($ForceRestart) {
        Write-Host "Backend gia attivo: riavvio forzato in corso..."
        Stop-RunningProcess -Process $processoEsistente -PidFile $pidPath
    } else {
        Write-Host "Backend gia avviato su http://127.0.0.1:$Port"
        if ($WaitForReady) {
            Wait-UrlReady -Url "http://127.0.0.1:$Port/api/health"
        }
        return
    }
}

$pythonCommand = Get-PythonCommand
$command = @"
Set-Location -LiteralPath '$backendDir'
& '$pythonCommand' -m uvicorn server:app --host 127.0.0.1 --port $Port
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
    Wait-UrlReady -Url "http://127.0.0.1:$Port/api/health"
}

Write-Host "Backend avviato su http://127.0.0.1:$Port"
Write-Host "Log: $logPath"
