$ErrorActionPreference = 'Stop'

$projectPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$configPath = Join-Path $env:USERPROFILE '.codex\config.toml'
$canonicalProjectPath = $projectPath.ToLowerInvariant().Replace('/', '\')
$sectionHeader = "[projects.'$canonicalProjectPath']"

if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Codex config was not found: $configPath"
}

$configText = Get-Content -LiteralPath $configPath -Raw
if ($configText -match [regex]::Escape($sectionHeader)) {
    Write-Output "Already registered: $projectPath"
    exit 0
}

$backupPath = "$configPath.bak-labbayk"
if (-not (Test-Path -LiteralPath $backupPath)) {
    Copy-Item -LiteralPath $configPath -Destination $backupPath
}

Add-Content -LiteralPath $configPath -Value "`r`n$sectionHeader`r`n"
Write-Output "Registered project path in Codex config: $projectPath"
Write-Output "Backup: $backupPath"
