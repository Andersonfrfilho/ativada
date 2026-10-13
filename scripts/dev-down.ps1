# Copyright (c) 2026 Ada Technology. All rights reserved.
# Para API, worker e painel registrados em .dev/pids (nunca por nome de processo). Não apaga volumes.
# Uso: pwsh scripts/dev-down.ps1 [-Infra] [-DryRun] [-EnvFile CAMINHO] [-StateDir CAMINHO]
param(
    [switch]$Infra,
    [switch]$DryRun,
    [string]$EnvFile = 'envs/env.dev',
    [string]$StateDir = '.dev'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
. (Join-Path $PSScriptRoot 'dev-lib.ps1')
Import-DevEnvironment $EnvFile

$stateRoot = if ([System.IO.Path]::IsPathRooted($StateDir)) { $StateDir } else { Join-Path $root $StateDir }
$pidDir = Join-Path $stateRoot 'pids'

function Stop-DevService([string]$Name) {
    $registered = Get-DevRegisteredPid $pidDir $Name
    if (-not $registered) {
        Remove-Item -LiteralPath (Join-Path $pidDir "$Name.pid") -ErrorAction SilentlyContinue
        Write-Dev "$Name não está no ar."
        return
    }
    if ($DryRun) { Write-Dev "[dry-run] pararia $Name (pid $registered e filhos)"; return }
    Stop-DevProcessTree $registered
    Remove-Item -LiteralPath (Join-Path $pidDir "$Name.pid")
    Write-Dev "$Name parado (pid $registered)."
}

function Test-DevInfraRequested {
    if ($Infra) { return $true }
    if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected -and -not $DryRun) {
        return (Read-Host 'Derrubar também os containers (os dados ficam nos volumes)? [s/N]') -match '^[sS]$'
    }
    Write-Dev 'Os containers continuam no ar. Para derrubá-los também: pwsh scripts/dev-down.ps1 -Infra'
    return $false
}

foreach ($name in 'painel', 'worker', 'api') { Stop-DevService $name }
if (Test-DevInfraRequested) {
    $composeArguments = Get-DevComposeArguments $EnvFile
    if ($DryRun) { Write-Dev "[dry-run] docker $($composeArguments -join ' ') down (sem apagar volumes)" }
    else { & docker @composeArguments down }
}
Write-Dev 'Pronto. Os volumes (dados do Postgres e do Keycloak) não foram apagados.'
