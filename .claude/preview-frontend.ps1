$port = 8083
$repoRoot = Split-Path $PSScriptRoot -Parent
$scriptPath = Join-Path $repoRoot "start-frontend.ps1"
& $scriptPath -Port $port -BackendPort 8001 -ForceRestart -Foreground
