#!/usr/bin/env bash
# Copyright (c) 2026 Ada Technology. All rights reserved.
# Funções comuns de dev-up.sh e dev-down.sh. Nunca imprime o valor de uma variável do env.

DEV_DEFAULT_SYMBOLS='BTCUSDT,ETHUSDT,DOGEUSDT,PEPEUSDT,SOLUSDT,XRPUSDT,BNBUSDT,LINKUSDT,SHIBUSDT'
DEV_SERVICE_NAMES=(api worker painel)

dev_say() { printf '%s\n' "$*"; }

dev_parse_arguments() {
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

# Precedência das moedas: DEV_MARKET_SYMBOLS (shell) > MARKET_SYMBOLS do env.dev.local > lista padrão.
dev_load_environment() {
  [ -f "$DEV_ENV_FILE" ] || { dev_say "ERRO: $DEV_ENV_FILE não existe."; exit 1; }
  local shell_symbols="${DEV_MARKET_SYMBOLS:-}"
  set -a
  # shellcheck disable=SC1090
  . "$DEV_ENV_FILE"
  unset MARKET_SYMBOLS VITE_MARKET_SYMBOLS
  # shellcheck disable=SC1090
  [ -f "$DEV_ENV_FILE.local" ] && . "$DEV_ENV_FILE.local"
  MARKET_SYMBOLS="${shell_symbols:-${MARKET_SYMBOLS:-$DEV_DEFAULT_SYMBOLS}}"
  VITE_MARKET_SYMBOLS="$MARKET_SYMBOLS"
  set +a
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
