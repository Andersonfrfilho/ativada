ENV ?= dev

include envs/env.$(ENV)
export

COMPOSE := docker compose --env-file envs/env.$(ENV) -f compose.yaml
REQUIRED_BUN_VERSION := 1.3.14

.PHONY: help bootstrap config up down ps check migration-test database-test identity-test session-test admin-test lgpd-test identity-logs

help: ## Lista os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-10s %s\n", $$1, $$2}'

bootstrap: ## Instala dependências com o lockfile congelado
	bun install --frozen-lockfile

config: ## Valida o ambiente, a versão do Bun e o compose
	@test -f envs/env.$(ENV) || { echo "Arquivo envs/env.$(ENV) não existe"; exit 1; }
	@test -n "$(PROJECT_NAME)" || { echo "PROJECT_NAME ausente em envs/env.$(ENV)"; exit 1; }
	@test "$$(bun --version)" = "$(REQUIRED_BUN_VERSION)" || { echo "Bun $(REQUIRED_BUN_VERSION) é obrigatório; encontrado $$(bun --version)"; exit 1; }
	$(COMPOSE) config --quiet

up: ## Sobe a infraestrutura e espera ficar saudável (SERVICES=postgres limita os serviços)
	$(COMPOSE) up -d --wait $(SERVICES)

down: ## Derruba os containers (DOWN_FLAGS=--volumes apaga os dados)
	$(COMPOSE) down $(DOWN_FLAGS)

ps: ## Mostra o estado dos containers
	$(COMPOSE) ps

check: ## Gate completo: formato, lint, tipos e testes
	bun run format:check
	bun run lint
	bun run typecheck
	bun test

migration-test: ## Aplica e desfaz as migrations num Postgres de teste descartável
	set -a; . envs/env.test; set +a; \
	status=0; \
	$(MAKE) up ENV=test && bun --env-file=envs/env.test run --cwd packages/database db:migration-test || status=$$?; \
	$(MAKE) down ENV=test; \
	exit $$status

database-test: ## Prova a resolução concorrente de usuários num Postgres de teste descartável
	set -a; . envs/env.test; set +a; \
	status=0; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run --cwd packages/database db:database-test || status=$$?; \
	$(MAKE) down ENV=test; \
	exit $$status

identity-test: ## Verifica realm, permissões e reuso de refresh num Keycloak de teste descartável
	set -a; . envs/env.test; set +a; \
	status=0; \
	$(MAKE) up ENV=test && bun --env-file=envs/env.test run scripts/identity-test.ts || status=$$?; \
	$(MAKE) down ENV=test DOWN_FLAGS=--volumes; \
	exit $$status

session-test: ## Prova as rotas de sessão do token handler contra um Keycloak de teste descartável
	set -a; . envs/env.test; set +a; \
	status=0; \
	$(MAKE) up ENV=test && bun --env-file=envs/env.test run scripts/session-test.ts || status=$$?; \
	$(MAKE) down ENV=test DOWN_FLAGS=--volumes; \
	exit $$status

admin-test: ## Prova convite, bloqueio, auditoria e Telegram contra Postgres, Keycloak e Mailpit de teste descartáveis
	set -a; . envs/env.test; set +a; \
	status=0; \
	$(MAKE) up ENV=test && bun --env-file=envs/env.test run scripts/admin-test.ts || status=$$?; \
	$(MAKE) down ENV=test DOWN_FLAGS=--volumes; \
	exit $$status

lgpd-test: ## Prova exportar e apagar a conta (API, cron, Postgres, Keycloak e Mailpit de teste descartáveis)
	set -a; . envs/env.test; set +a; \
	status=0; \
	$(MAKE) up ENV=test && bun --env-file=envs/env.test run scripts/lgpd-test.ts || status=$$?; \
	$(MAKE) down ENV=test DOWN_FLAGS=--volumes; \
	exit $$status

identity-logs: ## Segue os logs do Keycloak do ambiente atual
	$(COMPOSE) logs -f keycloak
