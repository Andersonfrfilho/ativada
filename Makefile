ENV ?= dev

include envs/env.$(ENV)
export

COMPOSE := docker compose --env-file envs/env.$(ENV) -f compose.yaml
REQUIRED_BUN_VERSION := 1.3.14

.PHONY: help bootstrap config up down ps check

help: ## Lista os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-10s %s\n", $$1, $$2}'

bootstrap: ## Instala dependências com o lockfile congelado
	bun install --frozen-lockfile

config: ## Valida o ambiente, a versão do Bun e o compose
	@test -f envs/env.$(ENV) || { echo "Arquivo envs/env.$(ENV) não existe"; exit 1; }
	@test -n "$(PROJECT_NAME)" || { echo "PROJECT_NAME ausente em envs/env.$(ENV)"; exit 1; }
	@test "$$(bun --version)" = "$(REQUIRED_BUN_VERSION)" || { echo "Bun $(REQUIRED_BUN_VERSION) é obrigatório; encontrado $$(bun --version)"; exit 1; }
	$(COMPOSE) config --quiet

up: ## Sobe a infraestrutura e espera ficar saudável
	$(COMPOSE) up -d --wait

down: ## Derruba os containers da infraestrutura
	$(COMPOSE) down

ps: ## Mostra o estado dos containers
	$(COMPOSE) ps

check: ## Gate completo: formato, lint, tipos e testes
	bun run format:check
	bun run lint
	bun run typecheck
	bun test
