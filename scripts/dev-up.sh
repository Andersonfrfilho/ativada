#!/usr/bin/env bash
# Copyright (c) 2026 Ada Technology. All rights reserved.
# Sobe o ambiente local: infra (Docker), migrations, API, worker e painel em segundo plano.
# Uso: scripts/dev-up.sh [--dry-run] [--env-file CAMINHO] [--state-dir CAMINHO]
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/dev-lib.sh
. scripts/dev-lib.sh
dev_parse_arguments "$@"
dev_load_environment

POSTGRES_WAIT_SECONDS=60
SERVICE_WAIT_SECONDS=60
HAS_CONFLICT=0

dev_step() { dev_say ""; dev_say "==> $*"; }

check_docker() {
  if [ "$DEV_DRY_RUN" = 1 ]; then dev_say "[dry-run] docker info"; return; fi
  docker info >/dev/null 2>&1 || {
    dev_say "ERRO: o Docker não responde. Abra o Docker Desktop (ou inicie o serviço) e rode de novo."
    exit 1
  }
}

start_infra() {
  if [ "$DEV_DRY_RUN" = 1 ]; then
    dev_say "[dry-run] docker compose --env-file $DEV_ENV_FILE -f compose.yaml up -d --wait"
    return
  fi
  dev_compose up -d --wait
}

wait_postgres() {
  local port="$POSTGRES_PORT" waited=0
  if [ "$DEV_DRY_RUN" = 1 ]; then
    dev_say "[dry-run] esperaria o Postgres em 127.0.0.1:$port por até ${POSTGRES_WAIT_SECONDS}s"
    return
  fi
  until dev_port_open "$port"; do
    waited=$((waited + 1))
    if [ "$waited" -ge "$POSTGRES_WAIT_SECONDS" ]; then
      dev_say "ERRO: o Postgres não respondeu em 127.0.0.1:$port depois de ${POSTGRES_WAIT_SECONDS}s."
      dev_say "Se 'docker ps' mostra ${PROJECT_NAME}-${ENV}-postgres como healthy mas a coluna PORTS vazia,"
      dev_say "o Docker Desktop não publicou a porta (costuma acontecer depois que o computador suspende)."
      dev_say "O que fazer: reinicie o Docker Desktop (Restart) e rode scripts/dev-up.sh de novo."
      dev_say "Este script não reinicia o Docker nem recria containers. Passo a passo: docs/runbook-dev-local.md §2"
      exit 1
    fi
    sleep 1
  done
  dev_say "Postgres respondendo em 127.0.0.1:$port"
}

run_migrations() {
  if [ "$DEV_DRY_RUN" = 1 ]; then dev_say "[dry-run] bun run --cwd packages/database db:migrate"; return; fi
  bun run --cwd packages/database db:migrate
}

start_service() {
  local name="$1" port="$2" directory="$3"
  shift 3
  local pid
  if pid="$(dev_registered_pid "$name")"; then
    dev_say "$name já está no ar (pid $pid); não subo de novo."
    return
  fi
  if [ -n "$port" ] && dev_port_open "$port"; then
    dev_say "ERRO: a porta $port já está ocupada por um processo que não é deste script; $name NÃO foi iniciado."
    HAS_CONFLICT=1
    return
  fi
  if [ "$DEV_DRY_RUN" = 1 ]; then
    dev_say "[dry-run] iniciaria $name em $directory: $* (log em $DEV_LOG_DIR/$name.log)"
    return
  fi
  mkdir -p "$DEV_LOG_DIR" "$DEV_PID_DIR"
  (cd "$directory" && nohup "$@" </dev/null >>"$DEV_LOG_DIR/$name.log" 2>&1 & echo "$!" >"$DEV_PID_DIR/$name.pid.tmp")
  pid="$(cat "$DEV_PID_DIR/$name.pid.tmp")"
  rm -f "$DEV_PID_DIR/$name.pid.tmp"
  printf '%s|%s\n' "$pid" "$(dev_process_identity "$pid")" >"$DEV_PID_DIR/$name.pid"
  dev_say "$name iniciado (pid $pid)"
}

wait_service_port() {
  local name="$1" port="$2" waited=0
  [ "$DEV_DRY_RUN" = 1 ] && return
  until dev_port_open "$port"; do
    waited=$((waited + 1))
    if [ "$waited" -ge "$SERVICE_WAIT_SECONDS" ]; then
      dev_say "AVISO: $name ainda não abriu a porta $port; veja $DEV_LOG_DIR/$name.log"
      return
    fi
    sleep 1
  done
}

print_summary() {
  dev_step "Ambiente local"
  dev_say "Painel:    http://127.0.0.1:${PANEL_PORT}"
  dev_say "API:       http://127.0.0.1:${API_PORT}/v1/health"
  dev_say "Keycloak:  http://127.0.0.1:${KEYCLOAK_PORT}"
  dev_say "Mailpit:   http://127.0.0.1:${MAILPIT_UI_PORT}"
  dev_say "Moedas:    ${MARKET_SYMBOLS}"
  dev_say "Logs:      $DEV_LOG_DIR/{api,worker,painel}.log  (ex.: tail -f $DEV_LOG_DIR/worker.log)"
  dev_say "Parar:     scripts/dev-down.sh   (--infra derruba também os containers)"
  [ "$HAS_CONFLICT" = 0 ] || { dev_say "Atenção: houve conflito de porta; veja as mensagens acima."; exit 1; }
}

dev_step "Docker"
check_docker
dev_step "Infra (Postgres, Keycloak, Mailpit)"
start_infra
wait_postgres
dev_step "Migrations"
run_migrations
dev_step "Processos"
start_service api "$API_PORT" . bun run apps/api-ativada/src/main.ts
start_service worker "" . bun run apps/worker-ativada/src/main.ts
start_service painel "$PANEL_PORT" apps/frontend-ativada bun run dev
wait_service_port api "$API_PORT"
wait_service_port painel "$PANEL_PORT"
print_summary
