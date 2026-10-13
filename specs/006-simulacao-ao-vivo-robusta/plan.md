# Plano — Spec 006

Fatos conferidos em 2026-10-13 (não repetir a busca):

- Cliente do banco: `openDatabase()` em `packages/database/src/database-handle.ts` faz `new Bun.SQL(url)` uma vez, sem
  `max`/`idleTimeout`/`connectionTimeout`, guardado num `WeakMap`; o worker abre um no `startWorker` (`apps/worker-ativada/src/main.ts`)
  e o mantém pelo processo inteiro. Só existem `pingDatabase` e `closeDatabase`. `migrate.ts` abre o próprio cliente.
- Escutador LISTEN/NOTIFY (`packages/database/src/notifications/notification-listener.ts`) já tem backoff 1 s → 30 s com sorteio e
  a API o expõe como `listener.state` (`up`/`reconnecting`/`failed`, `apps/api-ativada/src/stream/listener-health.ts`).
- Laços do worker são `setInterval`: `live/live-scheduler.ts` (loga `TICK_FAILED` com só `errorName`), `alerts/alert-scheduler.ts`
  (`DISPATCH_FAILED`), `stream/recovery-runner.ts` e `stream/gap-recovery.ts` (`GAP_RECOVERY_FAILED`). O worker não tem HTTP nem
  batimento de processo; só `runs.heartbeat_at` por execução.
- `/v1/health` (`apps/api-ativada/src/routes/health.routes.ts`) devolve sempre `200 ok` sem tocar o banco; `/v1/admin/health` traz
  `checks.database`, `listener` e `runs`. `logging/own-error.ts` tem `isOwnError` e `readErrorCode`.
- `POST /v1/runs` aceita qualquer timeframe habilitado em `live_paper`; `goalId` só em `live_paper`. Teto de 5 ao vivo
  (`users.schema.ts` `DEFAULT_USER_LIMITS`), cobrado em `run-admission.ts` e em `live-run-claim.ts`.
- Painel: `useGoalSimulation` é função local em `src/goals/RankingCard.component.tsx`; `GOAL_TIMEFRAME = '1d'` em
  `src/goals/goal.constant.ts`; "Aguardando o primeiro candle" em `ActiveGoalCard.component.tsx`, `overview/BalanceCard.component.tsx`
  e `test/goals.contract.tsx`. Não há tela de admin.
- `alerts.side` é `varchar(8)` com check (`BUY`, `SELL`, `GOAL`, `PRICE`); evento `warning` já existe para `waitingForData`.
  Última migration: `0021_run_soft_delete`.
- Falha injetada hoje é por stub em cada teste (`test/live-scheduler.contract.test.ts`, `test/alert-scheduler.contract.test.ts`);
  não há porta de banco falsa genérica.

## D1. Onde mora cada peça

| Peça | Lugar | Por quê |
|---|---|---|
| Porteiro de conexão | `packages/database/src/connection/` — `resilient-database.ts` (estado `up`/`down`, falhas seguidas, reabre o `Bun.SQL`), `connection-error.ts` (classifica: erro de conexão × erro de consulta), `reconnect-backoff.ts` (puro) | Um lugar só; worker e API usam o mesmo |
| Log resumido | `packages/database/src/connection/outage-log.ts` (puro: decide se loga, com `code`, `failures`, `sinceMs`) e `readSafeErrorFields` (`name`, `code`, `errno`) | A regra "sem mensagem crua" num lugar só |
| Laços do worker | `live-scheduler.ts`, `alert-scheduler.ts`, `recovery-runner.ts` passam a perguntar ao porteiro antes da ronda e a esperar o backoff quando `down` | Hoje cada ronda falha e loga |
| Batimento | migration `0022_worker_heartbeats` (+ `.rollback.sql`), repositório `packages/database/src/worker-heartbeats/`, laço `apps/worker-ativada/src/heartbeat/` | Visível pela API sem HTTP no worker |
| Readiness | `health.routes.ts`: `/v1/health` com `SELECT 1` e teto de 1 s → `200`/`503`; admin com `worker` e `database.lastFailureCode`; `health.docs.ts` | Contrato honesto |
| Detector de parada | `apps/api-ativada/src/runs/stall/` — `stall-policy.ts` (puro: `computeStalledSince({ timeframe, lastCandleTime, startedAt, now, graceMinutes, waitingForData })`), `stall-sweeper.ts` (laço a cada 60 s), migration aditiva `0023_run_stall` (`runs.stalled_since`, `alerts_side_check` com `STALL` e `RESUME`) | A API vê quando o worker some |
| Painel: vela | `src/goals/SimulationTimeframePicker.component.tsx`, `simulation-timeframe.constant.ts` (opções, frases, padrão), `next-candle-close.ts` (puro: fim da vela em curso), `useGoalSimulation.hook.ts` (sai do `RankingCard`) | Um conceito por arquivo; ≤ 200 linhas |
| Painel: estados | `src/runs/LiveRunStatus.component.tsx` (aguardando a primeira vela / última e próxima decisão / parada), usado por `BalanceCard`, `ActiveGoalCard` e detalhe | Mesmo texto em toda tela |
| Ambiente local | `scripts/dev-up.sh`, `scripts/dev-up.ps1`, `scripts/dev-down.sh`, `scripts/dev-down.ps1`; `docs/runbook-dev-local.md`; `.dev/` no `.gitignore` | RF16, RF17 |

## D2. Contrato da reconexão (fechar na T0.1)

1. **Reproduzir primeiro**: worker e API contra Postgres descartável, `docker restart` do container; registrar o `code`/`errno` real
   do Bun 1.3.14 e se o `Bun.SQL` se recupera sozinho depois de N segundos. O resultado decide se o porteiro precisa **reabrir** o
   cliente ou só **esperar**. O plano assume reabrir (spec D5).
2. Erro de conexão = `ERR_POSTGRES_CONNECTION_CLOSED`, `ERR_POSTGRES_CONNECTION_TIMEOUT`, `ECONNREFUSED`, `ECONNRESET`, SQLSTATE
   classe `08` e `57P01`/`57P02`/`57P03` (lista exata na T0.1). Qualquer outro erro é da consulta e segue o caminho de hoje.
3. Após `RECONNECT_FAILURE_THRESHOLD` (padrão 2) erros de conexão seguidos: estado `down`, fecha o cliente velho (dreno 1 s), abre
   um novo. Tentativas seguintes com `computeBackoff({ attempt, baseMs: 1000, maxMs: 30000, random })`, sorteio igual ao do
   escutador. Sem desistir (spec D6).
4. Reabrir só **entre rondas**: o porteiro nunca troca o cliente com transação em voo (contador de uso; espera ou desiste da
   ronda). Toda consulta ganha teto de tempo (`DATABASE_QUERY_TIMEOUT_SECONDS`, padrão 30) para a ronda nunca ficar presa.
5. `DatabaseHandle` não muda de forma: o porteiro troca o `OpenDatabase` dentro do `WeakMap`. Quem já tem o handle continua.

## D3. Contrato do aviso de parada (fechar na T0.1)

- Vela esperada: a última vela **fechada** do timeframe antes de `now` (`floor(now / duração) × duração − duração`).
- `stalledSince` = `fim da vela esperada + carência` quando `runs.last_candle_time` (ou, sem passo, `started_at`) está atrás da
  vela esperada **e** a execução não está em `waitingForData`. Função pura, testada com 15m, 1h, 4h e 1d, com e sem passo.
- Varredura na API a cada `LIVE_STALL_SWEEP_SECONDS` (60): `UPDATE runs SET stalled_since = ... WHERE ...` e, na mesma transação,
  `INSERT INTO alerts (side 'STALL' | 'RESUME') ... ON CONFLICT DO NOTHING` (chave: execução + `stalled_since` + lado) e
  `pg_notify('run_events', { kind: 'warning' })`. Ao voltar, zera `stalled_since` e enfileira `RESUME`. Uma instância só por
  vez (`pg_try_advisory_xact_lock`).
- O despachante do worker já envia `alerts`; ganha o texto de `STALL` e `RESUME` (sem dado pessoal; nome da estratégia e par).
  Se o worker estiver morto, a mensagem sai quando ele voltar — a faixa no painel é o aviso imediato. **Registrar isso no ADR.**

## D4. Por que o banco continua sendo a fila (ADR 0002)

Registrar na T0.1, seção "Simulação ao vivo robusta (spec 006)": a queda foi do **banco**, e qualquer mensageria nova
(Redis/RabbitMQ) seria mais uma peça que cai junto quando o computador dorme. Com o banco como fila durável, o passo, o sinal e o
alerta nascem na mesma transação; quando o banco volta, nada se perdeu e nada se duplica. O conserto certo é o cliente
reconectar, não trocar a fila.

## D5. Painel: vela e estados

- Opções em `SIMULATION_TIMEFRAME_OPTIONS` (`1h` padrão, `4h`, `1d`; `15m` em "Mais opções"), cada uma com a frase do spec RF02.
  O `POST /v1/runs` manda o `timeframe` escolhido; o resto do corpo não muda.
- `nextCandleClose({ timeframe, now })` puro, em UTC; a exibição usa `formatInZone` + "hoje/amanhã" (`zoned-time.ts` da spec 005).
- Contagem "3 de 5" e duplicata: a lista de execuções `live_paper` `running`/`queued` do usuário (consulta já existente sob `runs`).
  O limite vem do erro `409` ou de `GET /v1/me` se já trouxer `limits` (conferir na T3.1; se não trouxer, campo aditivo).
- Estados de `LiveRunStatus`: `waitingFirstCandle` (sem passo, antes da vela + carência), `running` (última e próxima decisão),
  `waitingForData` (texto de hoje), `stalled` (`stalledSince`).

## D6. Ambiente local

- `dev-up.sh`: `set -euo pipefail`; carrega `envs/env.dev` (+ `env.dev.local`) com `set -a`; confere `docker info`; `make up`;
  espera `pg_isready`/`nc -z` na porta do env até 60 s e, se falhar, imprime "Postgres não respondeu na porta X: veja
  docs/runbook-dev-local.md §2"; `make migrate` (ou o alvo atual); sobe `api`, `worker` e `painel` com `nohup`, logs em
  `.dev/logs/<nome>.log`, PID em `.dev/pids/`; se já há PID vivo, não sobe de novo. Nunca `echo` de variável.
- `dev-up.ps1`: mesma sequência com `Test-NetConnection -Port`, `Start-Process -RedirectStandardOutput`.
- Conferir no `Makefile` os alvos reais de migration e os comandos de cada app (`package.json`) na T4.1; os `/tmp/start-*.sh`
  do usuário estão fora do repo e não são lidos.

## D7. Testes e mutantes

- **Porta de banco falsa** em `packages/database/test-support/flaky-sql.ts`: cliente que responde, cai (lança o erro de conexão
  real registrado na T0.1) e volta sob comando. Usada pelos contratos do porteiro, dos três laços e do detector.
- **Integração** `make db-outage-test` (`scripts/db-outage-test.ts`): infra descartável, API + worker reais em subprocesso,
  simulação `live_paper` com a Binance falsa, `docker restart` do Postgres no meio; confere RNF01, contagem de `fills`/`signals`
  igual à de uma execução contínua, `/v1/health` 503 → 200, `worker.state` e as linhas de log sem PII.
- **Mutantes** (`test/db-reconnect-mutants.contract.test.ts`, `test/live-stall-mutants.contract.test.ts`, padrão de
  `live-mutants`): limiar de falhas, teto do backoff, reabrir só entre rondas, resumo de 60 s, classificação de erro,
  carência, `waitingForData` excluído, alerta único por episódio, `RESUME` só após `STALL`.

## D8. Gates

Como nas specs anteriores: `bun run typecheck` + `bun run lint` + testes (`make check`, o script `test` do painel com os
arquivos novos na lista explícita, e o alvo `make` da task) + commit isolado. **Rodar no Linux/WSL** (spec 003 plan D6:
caminhos `/C:/...` quebram fixtures no Windows). Contratos de rota usam `loadApiApp()`; do worker, `loadLiveApi()` /
`loadAlertsApi()`.
