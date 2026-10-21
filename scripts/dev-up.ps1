# Copyright (c) 2026 Ada Technology. All rights reserved.
# Sobe o ambiente local: infra (Docker), migrations, API, worker e painel em segundo plano.
# Uso: pwsh scripts/dev-up.ps1 [-DryRun] [-EnvFile CAMINHO] [-StateDir CAMINHO]
param(
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
$logDir = Join-Path $stateRoot 'logs'
$pidDir = Join-Path $stateRoot 'pids'
$postgresWaitSeconds = 60
$serviceWaitSeconds = 60
$hasConflict = $false

function Write-Step([string]$Title) { Write-Dev ''; Write-Dev "==> $Title" }

function Assert-Docker {
    if ($DryRun) { Write-Dev '[dry-run] docker info'; return }
    docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Dev 'ERRO: o Docker não responde. Abra o Docker Desktop e rode de novo.'
        exit 1
    }
}

function Start-Infra {
    $composeArguments = Get-DevComposeArguments $EnvFile
    if ($DryRun) { Write-Dev "[dry-run] docker $($composeArguments -join ' ') up -d --wait"; return }
    & docker @composeArguments up -d --wait
    if ($LASTEXITCODE -ne 0) { Write-Dev 'ERRO: docker compose up falhou.'; exit 1 }
}

function Wait-Postgres {
    $port = [int]$env:POSTGRES_PORT
    if ($DryRun) { Write-Dev "[dry-run] esperaria o Postgres em 127.0.0.1:$port por até ${postgresWaitSeconds}s"; return }
    for ($waited = 0; -not (Test-DevPortOpen $port); $waited++) {
        if ($waited -ge $postgresWaitSeconds) {
            Write-Dev "ERRO: o Postgres não respondeu em 127.0.0.1:$port depois de ${postgresWaitSeconds}s."
            Write-Dev "Se 'docker ps' mostra $($env:PROJECT_NAME)-$($env:ENV)-postgres como healthy mas a coluna PORTS vazia,"
            Write-Dev 'o Docker Desktop não publicou a porta (costuma acontecer depois que o computador suspende).'
            Write-Dev 'O que fazer: reinicie o Docker Desktop (Restart) e rode scripts/dev-up.ps1 de novo.'
            Write-Dev 'Este script não reinicia o Docker nem recria containers. Passo a passo: docs/runbook-dev-local.md §2'
            exit 1
        }
        Start-Sleep -Seconds 1
    }
    Write-Dev "Postgres respondendo em 127.0.0.1:$port"
}

function Invoke-Migrations {
    if ($DryRun) { Write-Dev '[dry-run] bun scripts/dev-migrate.ts packages/database/drizzle'; return }
    & bun (Join-Path $root 'scripts/dev-migrate.ts') (Join-Path $root 'packages/database/drizzle')
    if ($LASTEXITCODE -ne 0) { Write-Dev 'ERRO: as migrations falharam.'; exit 1 }
}

function Start-DevService([string]$Name, [int]$Port, [string]$Directory, [string[]]$Arguments) {
    $registered = Get-DevRegisteredPid $pidDir $Name
    if ($registered) { Write-Dev "$Name já está no ar (pid $registered); não subo de novo."; return }
    if ($Port -gt 0 -and (Test-DevPortOpen $Port)) {
        Write-Dev "ERRO: a porta $Port já está ocupada por um processo que não é deste script; $Name NÃO foi iniciado."
        $script:hasConflict = $true
        return
    }
    if ($DryRun) { Write-Dev "[dry-run] iniciaria $Name em ${Directory}: bun $($Arguments -join ' ') (log em $logDir\$Name.log)"; return }
    New-Item -ItemType Directory -Force -Path $logDir, $pidDir | Out-Null
    $process = Start-Process -FilePath (Get-Command bun).Source -ArgumentList $Arguments -WorkingDirectory (Join-Path $root $Directory) `
        -RedirectStandardOutput (Join-Path $logDir "$Name.log") -RedirectStandardError (Join-Path $logDir "$Name.err.log") `
        -WindowStyle Hidden -PassThru
    Set-Content -LiteralPath (Join-Path $pidDir "$Name.pid") -Value "$($process.Id)|$($process.StartTime.ToString('o'))"
    Write-Dev "$Name iniciado (pid $($process.Id))"
}

function Wait-ServicePort([string]$Name, [int]$Port) {
    if ($DryRun) { return }
    for ($waited = 0; -not (Test-DevPortOpen $Port); $waited++) {
        if ($waited -ge $serviceWaitSeconds) { Write-Dev "AVISO: $Name ainda não abriu a porta $Port; veja $logDir\$Name.log"; return }
        Start-Sleep -Seconds 1
    }
}

Write-Step 'Docker'
Assert-Docker
Write-Step 'Infra (Postgres, Keycloak, Mailpit)'
Start-Infra
Wait-Postgres
Write-Step 'Migrations'
Invoke-Migrations
Write-Step 'Processos'
Start-DevService 'api' ([int]$env:API_PORT) '.' @('run', 'apps/api-ativada/src/main.ts')
Start-DevService 'worker' 0 '.' @('run', 'apps/worker-ativada/src/main.ts')
Start-DevService 'painel' ([int]$env:PANEL_PORT) 'apps/frontend-ativada' @('run', 'dev')
Wait-ServicePort 'api' ([int]$env:API_PORT)
Wait-ServicePort 'painel' ([int]$env:PANEL_PORT)

Write-Step 'Ambiente local'
Write-Dev "Painel:    http://127.0.0.1:$($env:PANEL_PORT)"
Write-Dev "API:       http://127.0.0.1:$($env:API_PORT)/v1/health"
Write-Dev "Keycloak:  http://127.0.0.1:$($env:KEYCLOAK_PORT)"
Write-Dev "Mailpit:   http://127.0.0.1:$($env:MAILPIT_UI_PORT)"
Write-Dev "Moedas:    $($env:MARKET_SYMBOLS)"
Write-Dev "Logs:      $logDir\{api,worker,painel}.log (erros em *.err.log)  ex.: Get-Content -Wait $logDir\worker.log"
Write-Dev 'Parar:     pwsh scripts/dev-down.ps1   (-Infra derruba também os containers)'
if ($hasConflict) { Write-Dev 'Atenção: houve conflito de porta; veja as mensagens acima.'; exit 1 }
