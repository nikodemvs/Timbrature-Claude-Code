param(
    [int]$BackendPort = 8001,
    [int]$FrontendPort = 8083,
    [switch]$NoClearCache,
    [switch]$NoResponsively,
    [string]$BackendDir,
    [string]$FrontendDir,
    [string]$RuntimeDir
)

$ErrorActionPreference = "Stop"

$backendScript = Join-Path $PSScriptRoot "start-backend.ps1"
$frontendScript = Join-Path $PSScriptRoot "start-frontend.ps1"

$backendArgs = @{
    Port = $BackendPort
    WaitForReady = $true
    ForceRestart = $true
}
if ($BackendDir) {
    $backendArgs.BackendDir = $BackendDir
}
if ($RuntimeDir) {
    $backendArgs.RuntimeDir = $RuntimeDir
}
& $backendScript @backendArgs

$frontendArgs = @{
    Port = $FrontendPort
    BackendPort = $BackendPort
    WaitForReady = $true
    NoClearCache = $NoClearCache
    ForceRestart = $true
    NoResponsively = $NoResponsively
}
if ($FrontendDir) {
    $frontendArgs.FrontendDir = $FrontendDir
}
if ($RuntimeDir) {
    $frontendArgs.RuntimeDir = $RuntimeDir
}
& $frontendScript @frontendArgs

Write-Host ""
Write-Host "Applicazione pronta."
Write-Host "Backend:  http://127.0.0.1:$BackendPort/api/health"
Write-Host "Frontend: http://127.0.0.1:$FrontendPort"
Write-Host "Log runtime: $env:TEMP\\Timbrature-runtime"
