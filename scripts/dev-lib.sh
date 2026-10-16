#!/usr/bin/env bash
# Copyright (c) 2026 Ada Technology. All rights reserved.
# Funções comuns de dev-up.sh e dev-down.sh. Nunca imprime o valor de uma variável do env.

DEV_DEFAULT_SYMBOLS='BTCUSDT,ETHUSDT,DOGEUSDT,PEPEUSDT,SOLUSDT,XRPUSDT,BNBUSDT,LINKUSDT,SHIBUSDT'
DEV_SERVICE_NAMES=(api worker painel)

dev_say() { printf '%s\n' "$*"; }

# No Git Bash/MSYS o pid, o ps e o /dev/tcp são do emulador, não do Windows: o par dev-up.ps1/dev-down.ps1 é o caminho.
dev_refuse_windows_shell() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      dev_say "ERRO: este script não roda no Git Bash/MSYS. No Windows use o PowerShell: pwsh scripts/$(basename "$0" .sh).ps1"
      exit 1 ;;
  esac
}

dev_parse_arguments() {
  dev_refuse_windows_shell
  DEV_DRY_RUN=0
  DEV_WITH_INFRA=0
  DEV_ENV_FILE="envs/env.dev"
  DEV_STATE_DIR=".dev"
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --dry-run) DEV_DRY_RUN=1 ;;
      --infra) DEV_WITH_INFRA=1 ;;
      --env-file) DEV_ENV_FILE="${2:?--env-file pede um caminho}"; shift ;;
      --state-dir) DEV_STATE_DIR="${2:?--state-dir pede um caminho}"; shift ;;
      *) dev_say "Argumento desconhecido: $1"; exit 2 ;;
    esac
    shift
  done
  case "$DEV_STATE_DIR" in /*) ;; *) DEV_STATE_DIR="$PWD/$DEV_STATE_DIR" ;; esac
  DEV_LOG_DIR="$DEV_STATE_DIR/logs"
  DEV_PID_DIR="$DEV_STATE_DIR/pids"
}

# Lê KEY=VALUE linha a linha, sem executar nada: o valor é literal (uma senha com $ não expande), igual ao dev-lib.ps1.
dev_read_environment_file() {
  local line name value
  local double_quoted='^"(.*)"$' single_quoted="^'(.*)'\$"
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    name="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ "$value" =~ $double_quoted || "$value" =~ $single_quoted ]]; then value="${BASH_REMATCH[1]}"; fi
    export "$name=$value"
  done < "$1"
}

# Precedência das moedas: DEV_MARKET_SYMBOLS (shell) > MARKET_SYMBOLS do env.dev.local > lista padrão.
dev_load_environment() {
  [ -f "$DEV_ENV_FILE" ] || { dev_say "ERRO: $DEV_ENV_FILE não existe."; exit 1; }
  local shell_symbols="${DEV_MARKET_SYMBOLS:-}"
  dev_read_environment_file "$DEV_ENV_FILE"
  unset MARKET_SYMBOLS VITE_MARKET_SYMBOLS
  if [ -f "$DEV_ENV_FILE.local" ]; then dev_read_environment_file "$DEV_ENV_FILE.local"; fi
  MARKET_SYMBOLS="${shell_symbols:-${MARKET_SYMBOLS:-$DEV_DEFAULT_SYMBOLS}}"
  VITE_MARKET_SYMBOLS="$MARKET_SYMBOLS"
  export MARKET_SYMBOLS VITE_MARKET_SYMBOLS
  if [ -n "${MARKET_TIMEFRAMES:-}" ]; then export VITE_MARKET_TIMEFRAMES="$MARKET_TIMEFRAMES"; fi
  if [ -n "${MARKET_DISPLAY_TIMEFRAMES:-}" ]; then export VITE_MARKET_DISPLAY_TIMEFRAMES="$MARKET_DISPLAY_TIMEFRAMES"; fi
}

dev_compose() {
  local files=(--env-file "$DEV_ENV_FILE")
  [ -f "$DEV_ENV_FILE.local" ] && files+=(--env-file "$DEV_ENV_FILE.local")
  docker compose "${files[@]}" -f compose.yaml "$@"
}

dev_port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

dev_process_identity() { ps -p "$1" -o lstart= 2>/dev/null | tr -s ' ' || true; }

# O pid só vale se o início do processo bate com o gravado: pid reaproveitado depois de reinício não é nosso.
dev_registered_pid() {
  local pid_file="$DEV_PID_DIR/$1.pid" pid recorded
  [ -f "$pid_file" ] || return 1
  pid="$(cut -d'|' -f1 "$pid_file")"
  recorded="$(cut -d'|' -f2- "$pid_file")"
  [ -n "$pid" ] && [ "$(dev_process_identity "$pid")" = "$recorded" ] || return 1
  printf '%s' "$pid"
}

dev_kill_tree() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null || true); do dev_kill_tree "$child"; done
  kill -"${2:-TERM}" "$1" 2>/dev/null || true
}
