param(
  [string]$BaseUrl = "http://localhost:8081/",
  [string]$OutputDir = "",
  [switch]$Headed
)

$ErrorActionPreference = "Stop"

if (-not $OutputDir) {
  $OutputDir = Join-Path $PSScriptRoot "..\..\output\playwright\bustapaga-smoke"
}

$ResolvedOutputDir = [System.IO.Path]::GetFullPath($OutputDir)
$null = New-Item -ItemType Directory -Force -Path $ResolvedOutputDir

$env:PLAYWRIGHT_SMOKE_BASE_URL = $BaseUrl
$env:PLAYWRIGHT_SMOKE_OUTPUT_DIR = $ResolvedOutputDir

$Args = @(
  "--yes",
  "@playwright/test",
  "test",
  "frontend/scripts/playwright-smoke.spec.js",
  "--reporter",
  "list",
  "--workers",
  "1"
)

if ($Headed) {
  $Args += "--headed"
}

& npx.cmd --yes @playwright/test --version | Out-Null

$NpxCacheRoot = Join-Path $env:LOCALAPPDATA "npm-cache\_npx"
$PlaywrightNodeModules = Get-ChildItem $NpxCacheRoot -Directory |
  Sort-Object LastWriteTime -Descending |
  ForEach-Object { Join-Path $_.FullName "node_modules" } |
  Where-Object { Test-Path (Join-Path $_ "@playwright\test") } |
  Select-Object -First 1

if (-not $PlaywrightNodeModules) {
  throw "Impossibile individuare @playwright/test nella cache npx."
}

$PreviousNodePath = $env:NODE_PATH
$env:NODE_PATH = if ($PreviousNodePath) {
  "$PlaywrightNodeModules;$PreviousNodePath"
} else {
  $PlaywrightNodeModules
}

try {
  & npx.cmd @Args
} finally {
  $env:NODE_PATH = $PreviousNodePath
}

if ($LASTEXITCODE -ne 0) {
  throw "Playwright smoke workflow fallito."
}
