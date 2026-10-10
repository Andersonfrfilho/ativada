ENV ?= dev

include envs/env.$(ENV)
export

COMPOSE := docker compose --env-file envs/env.$(ENV) -f compose.yaml
REQUIRED_BUN_VERSION := 1.3.14

.PHONY: help bootstrap config up down ps check contract-full migration-test database-test identity-test session-test admin-test lgpd-test backfill-test stream-test backtest-test walkforward-test api-runs-test api-runs-mutants example-mutants queue-test queue-mutants identity-logs

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
	@bun run scripts/check-realm-staleness.ts
	$(COMPOSE) up -d --wait $(SERVICES)

down: ## Derruba os containers (DOWN_FLAGS=--volumes apaga os dados, inclusive o realm importado do Keycloak)
	$(COMPOSE) down $(DOWN_FLAGS)

ps: ## Mostra o estado dos containers
	$(COMPOSE) ps

check: ## Gate completo: formato, lint, tipos e testes
	bun run format:check
	bun run lint
	bun run typecheck
	env -i PATH="$$PATH" HOME="$$HOME" bun test

contract-full: ## Bateria completa do motor: todo corte nos checks de lookahead e retomada (FULL_CONTRACT=1)
	env -i PATH="$$PATH" HOME="$$HOME" FULL_CONTRACT=1 bun test

migration-test: ## Aplica e desfaz as migrations num Postgres de teste descartável
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run --cwd packages/database db:migration-test

database-test: ## Prova a resolução concorrente de usuários num Postgres de teste descartável
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run --cwd packages/database db:database-test

identity-test: ## Verifica realm, permissões e reuso de refresh num Keycloak de teste descartável
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test && bun --env-file=envs/env.test run scripts/identity-test.ts

session-test: ## Prova as rotas de sessão do token handler contra um Keycloak de teste descartável
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test && bun --env-file=envs/env.test run scripts/session-test.ts

admin-test: ## Prova convite, bloqueio, auditoria e Telegram contra Postgres, Keycloak e Mailpit de teste descartáveis
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test && bun --env-file=envs/env.test run scripts/admin-test.ts

lgpd-test: ## Prova exportar e apagar a conta (API, cron, Postgres, Keycloak e Mailpit de teste descartáveis)
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test && bun --env-file=envs/env.test run scripts/lgpd-test.ts

backfill-test: ## Prova o backfill retomável de candles e o Fear & Greed diário (cron real, Postgres de teste descartável, Binance e alternative.me falsas locais)
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/backfill-test.ts

stream-test: ## Prova o worker real contra uma Binance falsa (REST + WebSocket) e um Postgres de teste descartável: velas fechadas, queda com lacuna recuperada, SIGTERM
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/stream-test.ts

backtest-test: ## Prova o backtest de 2 anos em worker_thread contra um Postgres de teste descartável: tempo, determinismo, paridade, golden, isolamento, cancelamento, falha, thread que morre, timeout e retomada
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/backtest-test.ts

walkforward-test: ## Prova o walk-forward (24 e 200 combinações) em worker_threads contra um Postgres de teste descartável: overfitting conhecido, tendência real, dois conjuntos reais, determinismo, 1 × N threads, retomada, cancelamento, isolamento e tempo
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/walkforward-test.ts

api-runs-test: ## Prova as rotas REST de mercado, estratégias e execuções contra a API real e um Postgres de teste descartável: estratégia, versão, backtest e walk-forward via HTTP, séries, CSV, parada, isolamento entre usuários, saúde sob carga e OpenAPI
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/api-runs-test.ts

api-runs-mutants: ## Prova que o isolamento entre usuários dos repositórios das rotas REST reprova 11 mutantes (filtro de dono removido, um por repositório) contra um Postgres de teste descartável
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/api-runs-mutants.ts

queue-test: ## Prova a fila durável de execuções contra Postgres de teste descartável: duas instâncias reais, tetos por usuário, justiça entre usuários, queda no meio com retomada idêntica, reinício, isolamento e saúde pela API real
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/queue-test.ts

queue-mutants: ## Prova que a fila reprova 14 mutantes do banco (teto ignorado, FIFO puro, sem SKIP LOCKED, órfã nunca detectada, conta bloqueada reivindicada, posição que vaza, entre outros) contra um Postgres de teste descartável
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/queue-mutants.ts

example-mutants: ## Prova que a semeadura da estratégia de exemplo reprova 6 mutantes (sem marca, sem índice, re-semeia, linha compartilhada, conta inativa, marca fora da transação) contra um Postgres de teste descartável
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/example-mutants.ts

identity-logs: ## Segue os logs do Keycloak do ambiente atual
	$(COMPOSE) logs -f keycloak
