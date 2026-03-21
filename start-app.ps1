param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 8081,
    [switch]$NoClearCache
)

$ErrorActionPreference = "Stop"

$backendScript = Join-Path $PSScriptRoot "start-backend.ps1"
$frontendScript = Join-Path $PSScriptRoot "start-frontend.ps1"

& $backendScript -Port $BackendPort -WaitForReady -ForceRestart
& $frontendScript -Port $FrontendPort -BackendPort $BackendPort -WaitForReady -NoClearCache:$NoClearCache -ForceRestart

Write-Host ""
Write-Host "Applicazione pronta."
Write-Host "Backend:  http://127.0.0.1:$BackendPort/api/health"
Write-Host "Frontend: http://127.0.0.1:$FrontendPort"
Write-Host "Log runtime: $env:TEMP\\Timbrature-Codex-runtime"
