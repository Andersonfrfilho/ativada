ENV ?= dev

include envs/env.$(ENV)
export

COMPOSE := docker compose --env-file envs/env.$(ENV) -f compose.yaml
REQUIRED_BUN_VERSION := 1.3.14
LIVE72 := env -i PATH="$$PATH" HOME="$$HOME" bun --env-file=envs/env.live72 run scripts/live72/cli.ts

.PHONY: help bootstrap config up down ps check panel-e2e contract-full migration-test database-test identity-test session-test admin-test lgpd-test backfill-test stream-test backtest-test walkforward-test api-runs-test api-runs-mutants example-mutants stall-mutants price-alert-mutants user-asset-mutants alert-mutants runlog-mutants telegram-test goals-test price-alerts-test telegram-mutants queue-test queue-mutants live-test live-mutants stream-api-test stream-mutants db-outage-test identity-logs live72-up live72-start live72-status live72-report live72-stop live72-down

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

check: ## Gate completo: formato, lint, tipos e testes (API, worker, cron, pacotes e painel)
	bun run format:check
	bun run lint
	bun run typecheck
	env -i PATH="$$PATH" HOME="$$HOME" bun test --timeout 60000
	env -i PATH="$$PATH" HOME="$$HOME" bun run --cwd apps/frontend-ativada test

contract-full: ## Bateria completa do motor: todo corte nos checks de lookahead e retomada (FULL_CONTRACT=1)
	env -i PATH="$$PATH" HOME="$$HOME" FULL_CONTRACT=1 bun test --timeout 60000

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

api-runs-mutants: ## Prova que o isolamento entre usuários dos repositórios das rotas REST reprova 21 mutantes (filtro de dono removido, um por ponto dos repositórios) contra um Postgres de teste descartável
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

queue-mutants: ## Prova que a fila e a reivindicação ao vivo reprovam 24 mutantes do banco (teto ignorado, FIFO puro, sem SKIP LOCKED, órfã nunca detectada, conta bloqueada reivindicada, posição que vaza, entre outros) contra um Postgres de teste descartável
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/queue-mutants.ts

live-test: ## Prova a simulação ao vivo contra Postgres de teste descartável: paridade com o backtest nos dois conjuntos reais, morte do processo (SIGKILL) entre passos e no meio de um, candle repetido, conta apagada ou bloqueada, dois workers, teto por usuário, lacuna de candles e a API real ponta a ponta
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/live-test.ts

db-outage-test: ## Prova a recuperação do worker e da API quando o banco cai e volta (SIGKILL do banco visto pelos clientes e meia conexão que não fecha), por um proxy TCP, contra um Postgres de teste descartável: volta em até 60 s, fills e signals iguais aos da execução contínua, /v1/health 503 e 200, batimento do worker e log sem PII
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/db-outage-test.ts

live-mutants: ## Prova que o adaptador do banco da simulação ao vivo reprova 8 mutantes (passo em duas transações, checkpoint recusado que deixa linhas, bolsa errada, sentimento sem corte, espera por buraco que não grava ou não apaga, entre outros) contra o live-test inteiro, num Postgres de teste descartável
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/live-mutants.ts

example-mutants: ## Prova que a semeadura da estratégia de exemplo reprova 6 mutantes (sem marca, sem índice, re-semeia, linha compartilhada, conta inativa, marca fora da transação) contra um Postgres de teste descartável
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/example-mutants.ts

stall-mutants: ## Prova que a varredura de parada no banco reprova 11 mutantes (sem trava consultiva, STALL duplicado no mesmo episódio, RESUME sem STALL, alerta para dono sem Telegram, leitura velha que abre episódio, episódio sobrescrito ou fechado por outro, aviso ao painel que não sai, marca que sobra em execução parada, varredura fora de uma transação) contra um Postgres de teste descartável
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/stall-mutants.ts

user-asset-mutants: ## Prova que os ativos do usuário reprovam 14 mutantes do banco (sem filtro de dono em leitura, lista e escrita, sem a trava do dono, teto ignorado ou com folga, recusa que ainda grava, cursor inclusivo, página sem ordem e cada CHECK ou unicidade removidos) num Postgres de teste descartável
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/user-asset-mutants.ts

price-alert-mutants: ## Prova que os alertas de preço reprovam 26 mutantes do banco (sem filtro de dono, teto contando alertas desligados ou sem a trava do dono, religar sem limpar o disparo ou sem respeitar o teto, disparo estrito, invertido, sem par, sem carimbo, sem trava atômica, aviso para dono sem Telegram ou com valores trocados, dono bloqueado ou apagado e cada CHECK removido) num Postgres de teste descartável
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/price-alert-mutants.ts

alert-mutants: ## Prova que a caixa de saída dos alertas reprova 14 mutantes (sem vínculo, lado fora da chave, duplicata que estoura, sem arrendamento, tentativa não contada, chat de outro dono, alerta desligado, estado final reaberto, hora ignorada, FK sem dono, métricas de outro dono, esgotado reivindicado, esgotado pendente, teto fora por um) contra um Postgres de teste descartável
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/alert-mutants.ts

runlog-mutants: ## Prova que o registro cronológico da execução reprova 10 mutantes (sinal antes do preenchimento, só por instante, cursor que repete, sem a linha a mais da página, ordem pelo instante errado, preço por float, filtro de dono em cada consulta, execuções misturadas) contra um Postgres de teste descartável
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/runlog-mutants.ts

goals-test: ## Prova as metas contra a API real e um Postgres de teste descartável: CRUD e isolamento entre usuários, avaliação estratégia x par de 5 pares em menos de 1 s com cache e ranking, simulação ao vivo atrelada à meta com os três desfechos (atingida, perda máxima, prazo) iguais à varredura independente, alerta GOAL uma vez por desfecho e reinício no meio sem duplicar desfecho nem alerta
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/goals-test.ts

price-alerts-test: ## Prova o alerta de preço contra Postgres de teste descartável, com ticker falso (o publicador de produção da API) e duas instâncias: cruzar o valor dispara UMA vez mesmo com ticks repetidos e com duas instâncias no mesmo tick, religar rearma, alerta de outro usuário nunca dispara para este, ticker indisponível ou dado velho não disparam nada, aviso só no Telegram do dono e NOTIFY com o ponteiro, exportação LGPD e log sem token nem chat
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/price-alerts-test.ts

telegram-test: ## Prova o alerta no Telegram contra Postgres de teste descartável e uma Bot API falsa: vínculo por código (uso único, vencido, chat de outro dono), passo ao vivo que enfileira um alerta por sinal BUY/SELL, entrega ao chat do próprio dono com motivo e acerto histórico, retry com espera crescente e retry_after, desistência, queda e reinício sem duplicar, desvinculação, exportação e exclusão LGPD e log sem token nem chat
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/telegram-test.ts

telegram-mutants: ## Prova que o passo ao vivo reprova 4 mutantes do alerta (sem gravar o alerta, em transação própria antes do passo, acerto lido do tipo ou da versão errada) contra o telegram-test inteiro, num Postgres de teste descartável
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/telegram-mutants.ts

stream-api-test: ## Prova o WebSocket de tempo real contra a API real, o worker e um Postgres de teste descartável: NOTIFY do worker ao dono em menos de 10 s, nada ao outro usuário, ticket reutilizado e Origin errada recusados, teto de sockets, resync ao refazer o LISTEN, token vencido (4401) e renovado no socket, conta bloqueada (4403) e encerramento
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/stream-api-test.ts

stream-mutants: ## Prova que o NOTIFY do passo ao vivo reprova 8 mutantes (tipo errado, eventId errado, dono no payload, operação nunca avisada, todos os candles, outro canal, entre outros) contra um Postgres de teste descartável
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test SERVICES=postgres && bun --env-file=envs/env.test run scripts/stream-mutants.ts

identity-logs: ## Segue os logs do Keycloak do ambiente atual
	$(COMPOSE) logs -f keycloak

panel-e2e: ## Prova o painel no navegador (Playwright) contra a API real, Postgres e Keycloak de teste descartáveis: metas com ranking, plano com alerta, ativos e preço ao vivo pelo ticker (Binance falsa), socket derrubado e recuperado; aviso de simulação em todas as rotas, login PKCE, visão geral com dados do seed e o crédito do Fear & Greed, conta (preferências, Telegram, exportar, apagar), PWA sem cache de /v1 e CSP sem unsafe-inline
	set -a; . envs/env.test; set +a; \
	trap '$(MAKE) down ENV=test DOWN_FLAGS=--volumes' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(MAKE) up ENV=test && bun --env-file=envs/env.test run scripts/panel-e2e.ts

live72-up: ## T6.3: sobe a infra dedicada da simulação de 72 h, carrega o LaunchAgent e prepara usuário e candles (idempotente)
	$(LIVE72) up

live72-start: ## T6.3: cria a meta e UMA simulação live_paper do Placar clássico (BTCUSDT 1h, 10 000 USDT fictícios) e grava ~/.ativada-live72/run.json
	$(LIVE72) start

live72-status: ## T6.3: andamento em texto curto (tempo, candles, sinais, ordens, patrimônio, alertas, processos, ticker, disco)
	$(LIVE72) status

live72-report: ## T6.3: gera ~/.ativada-live72/report.md com o veredito do critério 4 (APROVADO, REPROVADO ou INCONCLUSIVO)
	$(LIVE72) report

live72-stop: ## T6.3: descarrega o LaunchAgent e para tudo sem apagar dados (containers e volumes ficam)
	$(LIVE72) stop

live72-down: ## T6.3: remove agente, containers, volumes e ~/.ativada-live72 (exige CONFIRM=1)
	@test "$(CONFIRM)" = "1" || { echo "live72-down apaga containers, volumes e dados da simulação: rode make live72-down CONFIRM=1"; exit 1; }
	$(LIVE72) down --confirm
