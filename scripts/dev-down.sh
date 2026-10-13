#!/usr/bin/env bash
# Copyright (c) 2026 Ada Technology. All rights reserved.
# Para API, worker e painel registrados em .dev/pids (nunca por nome de processo). Não apaga volumes.
# Uso: scripts/dev-down.sh [--infra] [--dry-run] [--env-file CAMINHO] [--state-dir CAMINHO]
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/dev-lib.sh
. scripts/dev-lib.sh
dev_parse_arguments "$@"
dev_load_environment

STOP_WAIT_SECONDS=10

stop_service() {
  local name="$1" pid waited=0
  if ! pid="$(dev_registered_pid "$name")"; then
    rm -f "$DEV_PID_DIR/$name.pid" 2>/dev/null || true
    dev_say "$name não está no ar."
    return
  fi
  if [ "$DEV_DRY_RUN" = 1 ]; then dev_say "[dry-run] pararia $name (pid $pid e filhos)"; return; fi
  dev_kill_tree "$pid" TERM
  while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt "$STOP_WAIT_SECONDS" ]; do
    sleep 1
    waited=$((waited + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then dev_kill_tree "$pid" KILL; fi
  rm -f "$DEV_PID_DIR/$name.pid"
  dev_say "$name parado (pid $pid)."
}

stop_infra() {
  if [ "$DEV_DRY_RUN" = 1 ]; then
    dev_say "[dry-run] docker compose --env-file $DEV_ENV_FILE -f compose.yaml down (sem apagar volumes)"
    return
  fi
  dev_compose down
}

ask_infra() {
  [ "$DEV_WITH_INFRA" = 1 ] && return 0
  if [ -t 0 ] && [ "$DEV_DRY_RUN" = 0 ]; then
    local answer
    read -r -p "Derrubar também os containers (os dados ficam nos volumes)? [s/N] " answer
    [ "$answer" = s ] || [ "$answer" = S ] && return 0
    return 1
  fi
  dev_say "Os containers continuam no ar. Para derrubá-los também: scripts/dev-down.sh --infra"
  return 1
}

for name in painel worker api; do stop_service "$name"; done
if ask_infra; then stop_infra; fi
dev_say "Pronto. Os volumes (dados do Postgres e do Keycloak) não foram apagados."
