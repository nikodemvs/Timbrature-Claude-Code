$port = 8001
$repoRoot = Split-Path $PSScriptRoot -Parent
$scriptPath = Join-Path $repoRoot "start-backend.ps1"
& $scriptPath -Port $port -ForceRestart -Foreground
