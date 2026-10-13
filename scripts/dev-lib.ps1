# Copyright (c) 2026 Ada Technology. All rights reserved.
# Funções comuns de dev-up.ps1 e dev-down.ps1. Nunca imprime o valor de uma variável do env.

$script:DevDefaultSymbols = 'BTCUSDT,ETHUSDT,DOGEUSDT,PEPEUSDT,SOLUSDT,XRPUSDT,BNBUSDT,LINKUSDT,SHIBUSDT'

function Write-Dev([string]$Message) { Write-Host $Message }

function Read-DevEnvironmentFile([string]$Path) {
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { continue }
        $value = $Matches[2].Trim()
        if ($value -match '^"(.*)"$' -or $value -match "^'(.*)'$") { $value = $Matches[1] }
        [Environment]::SetEnvironmentVariable($Matches[1], $value, 'Process')
    }
}

# Precedência das moedas: DEV_MARKET_SYMBOLS (shell) > MARKET_SYMBOLS do env.dev.local > lista padrão.
function Import-DevEnvironment([string]$EnvFile) {
    if (-not (Test-Path -LiteralPath $EnvFile)) { Write-Dev "ERRO: $EnvFile não existe."; exit 1 }
    $shellSymbols = $env:DEV_MARKET_SYMBOLS
    Read-DevEnvironmentFile $EnvFile
    $env:MARKET_SYMBOLS = $null
    $env:VITE_MARKET_SYMBOLS = $null
    if (Test-Path -LiteralPath "$EnvFile.local") { Read-DevEnvironmentFile "$EnvFile.local" }
    $symbols = if ($shellSymbols) { $shellSymbols } elseif ($env:MARKET_SYMBOLS) { $env:MARKET_SYMBOLS } else { $script:DevDefaultSymbols }
    $env:MARKET_SYMBOLS = $symbols
    $env:VITE_MARKET_SYMBOLS = $symbols
}

function Get-DevComposeArguments([string]$EnvFile) {
    $arguments = @('compose', '--env-file', $EnvFile)
    if (Test-Path -LiteralPath "$EnvFile.local") { $arguments += @('--env-file', "$EnvFile.local") }
    return $arguments + @('-f', 'compose.yaml')
}

function Test-DevPortOpen([int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connecting = $client.ConnectAsync('127.0.0.1', $Port)
        return $connecting.Wait(1000) -and $client.Connected
    } catch { return $false } finally { $client.Dispose() }
}

# O pid só vale se o início do processo bate com o gravado: pid reaproveitado depois de reinício não é nosso.
function Get-DevRegisteredPid([string]$PidDir, [string]$Name) {
    $file = Join-Path $PidDir "$Name.pid"
    if (-not (Test-Path -LiteralPath $file)) { return $null }
    $parts = (Get-Content -LiteralPath $file -Raw).Trim().Split('|', 2)
    $process = Get-Process -Id ([int]$parts[0]) -ErrorAction SilentlyContinue
    if ($null -eq $process -or $process.StartTime.ToString('o') -ne $parts[1]) { return $null }
    return $process.Id
}

function Stop-DevProcessTree([int]$ProcessId) {
    if ($IsWindows) { & taskkill /PID $ProcessId /T /F *> $null; return }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}
