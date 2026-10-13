# Evidência — Spec 006

## T0.1 🧠 — Reprodução da queda e contrato (2026-10-13, `opus`)

Contrato registrado no ADR 0002, seção "Simulação ao vivo robusta (spec 006)". Nada de código de produção nem de teste.

### Ambiente

- Postgres 18.3 descartável do `embedded-postgres@18.3.0-beta.17` (`~/pg-scratch` no Ubuntu do WSL), dados novos em
  `~/pg-scratch/data-006`, porta **56434**, SCRAM-SHA-256 com senha. Nenhum container `ativada-dev-*` (nem de outro projeto)
  foi tocado e o Docker não foi reiniciado.
- Bun **1.4.3** (o desta máquina: `bun --version` no Windows e no WSL) e **1.3.14** (o citado na spec, instalado com
  `bun add bun@1.3.14` em `~/pg-scratch/bun-1.3.14`, fora do repositório).
- Cliente: `new Bun.SQL(url)` sem opções (igual ao `openDatabase` de `packages/database/src/database-handle.ts`), aberto UMA
  vez e reusado; um segundo cliente com `drizzle-orm/bun-sql` 0.45.4 (o do repositório); o escutador
  `createNotificationListener` de `packages/database/src/notifications/` importado do código do repositório (só leitura).
- Scripts de rascunho fora do repositório (scratchpad da sessão): `pgctl.sh` (init/start/stop `-m fast`/kill -9 de todos os
  processos/`SIGSTOP`/`SIGCONT`), `probe.ts` (queda real do servidor), `probe2.ts` (proxy TCP na 56435 na frente do banco,
  imitando o encaminhador de porta do Docker Desktop), `outage*.sh` (rodam tudo no WSL).

```text
wsl.exe -d Ubuntu -- bash <scratchpad>/outage.sh    # probe.ts com Bun 1.4.3
wsl.exe -d Ubuntu -- bash <scratchpad>/outage2.sh   # probe2.ts 1.4.3 + probe.ts e probe2.ts com Bun 1.3.14
wsl.exe -d Ubuntu -- bash <scratchpad>/outage3.sh   # probe2.ts corrigido (aceitar-e-fechar de verdade, meia conexão longa)
```

Duas sondas em laço (`SELECT 1` a cada 250 ms, uma no `Bun.SQL` cru e uma pelo Drizzle; "HANG" = sem resposta em 3 s), o
log só registra a troca de estado. Os campos abaixo são `constructor.name`, `name`, `code`, `errno` e `severity`; as mensagens
não foram registradas.

### Resultado (Bun 1.4.3; o 1.3.14 deu o mesmo, exceto onde indicado)

| Fase | Tempo | Observado |
|---|---|---|
| S1 `SIGKILL` em todos os processos do Postgres, transação crua, transação Drizzle e `pg_sleep(10)` em voo | +0,0 s | as três em voo: `PostgresError` / `ERR_POSTGRES_CONNECTION_CLOSED` |
| S1 banco fora (9 s) | | cru: `ERR_POSTGRES_CONNECTION_REFUSED` (1.3.14: `ERR_POSTGRES_CONNECTION_CLOSED`), x32; Drizzle: `DrizzleQueryError` (`name = "Error"`) com `cause` = o mesmo `PostgresError` |
| S1 banco de volta (mesma porta) | +9,1 s | **o mesmo cliente volta na primeira consulta** (cru e Drizzle `ok` em 11,5 s, junto do `pg_ctl start`) |
| S1 escutador | | `closed_by_server` → 3 × `connection_failed` com backoff (0,7 s, 1,8 s, 3,2 s) → `listening` `isReconnect: true` 3,6 s depois da volta; notificação seguinte entregue |
| S2 parada limpa (`pg_ctl stop -m fast`, como `docker stop`) | | `pg_sleep` em voo: `code = ERR_POSTGRES_SERVER_ERROR`, `errno = 57P01`, `severity = FATAL`; transações paradas entre comandos (crua e Drizzle): `ERR_POSTGRES_EXPECTED_REQUEST`; banco fora: igual a S1; escutador: `server_error` `sqlState 57P01` |
| S2 banco de volta | | o mesmo cliente volta na primeira consulta; escutador volta em 2,2 s |
| S3 servidor congelado (`SIGSTOP`, como `docker pause`) por 8 s | | consultas no cliente aberto penduram sem erro; `query.cancel()` não solta (a consulta só resolve com o `SIGCONT`, 8.030 ms); cliente NOVO com `connectionTimeout: 2`: `ERR_POSTGRES_CONNECTION_TIMEOUT` em 2.003 ms |
| S3 descongelado | | tudo volta sozinho na hora |
| S4 cliente NOVO aberto com o banco fora | | `ERR_POSTGRES_CONNECTION_REFUSED` em 11 ms (1.3.14: `ERR_POSTGRES_CONNECTION_CLOSED`); funciona 3 s depois da volta |
| P1 proxy fecha as conexões e passa a aceitar-e-fechar por 6 s | | consultas esperam em silêncio (HANG), sem erro; escutador: 4 × `closed_by_server` |
| P1 proxy volta a encaminhar | | o mesmo cliente volta sozinho em 0,5 s; escutador volta |
| P2 **meia conexão**: as conexões abertas param de passar dados sem fechar; conexões novas mudas por 8 s, depois encaminhadas | | o cliente fica **HANG para sempre**: 74 s pendurado, 69 s deles com o banco e o proxy funcionando. O escutador só percebe pelo `keepAlive` (`unresponsive` em ~59 s) e volta em 0,8 s; a notificação enviada 28 s depois da queda **se perdeu**, a de 73 s (já no `LISTEN` novo) chegou |
| P3 `close({ timeout: 1 })` no cliente preso | | a consulta pendente rejeita em 1 ms com `ERR_POSTGRES_CONNECTION_CLOSED`; o `close` resolve em 1.004 ms; um `Bun.SQL` novo responde `ok` na primeira consulta |

Respostas às perguntas da T0.1:

- **(a) `name`/`code`/`errno` reais.** Sempre `name = "PostgresError"` no driver e `name = "Error"` (`DrizzleQueryError`) por
  cima dele, com o driver em `cause`. Durante a queda: `ERR_POSTGRES_CONNECTION_CLOSED` (em voo; e banco fora no 1.3.14),
  `ERR_POSTGRES_CONNECTION_REFUSED` (banco fora no 1.4.3), `ERR_POSTGRES_SERVER_ERROR` + `errno 57P01` (consulta na parada
  limpa), `ERR_POSTGRES_EXPECTED_REQUEST` (transação na parada limpa), `ERR_POSTGRES_CONNECTION_TIMEOUT` (conexão nova com
  `connectionTimeout`). Na volta: nenhum erro, a primeira consulta já passa. Nenhum `ECONNREFUSED`/`ECONNRESET` nem `errno`
  numérico apareceu.
- **(b) O mesmo cliente se recupera?** Sim em queda, parada limpa, congelamento e porta que aceita e fecha. **Não** na meia
  conexão: fica pendurado até `close()` e um cliente novo. Reabrir funciona em todos os casos.
- **(c) Transação em voo e consulta pendurada.** Transação em voo é desfeita e rejeita (`CONNECTION_CLOSED` na queda,
  `EXPECTED_REQUEST` na parada limpa); a consulta pendurada não tem teto no Bun e `cancel()` não a solta: só o servidor
  voltar (congelamento) ou `close()` (meia conexão).
- **(d) Escutador próprio.** Recupera-se sozinho em todos os casos com o backoff de 1 s a 30 s e refaz o `LISTEN`; na meia
  conexão depende do `keepAlive` (30 s, perda em até 60 s) e as notificações desse intervalo se perdem (o `resync` da API
  cobre).

### Decisões fechadas (ADR 0002, "Simulação ao vivo robusta (spec 006)")

- Lista de erros de conexão (R1), estado `down` na primeira falha com sonda única por espera (R2), backoff 1 s a 30 s com
  sorteio `[c/2, c]` sem desistir (R3, **o plano se confirmou: teto de 30 s mantido**), teto de 30 s por unidade com
  reabertura imediata e `connectionTimeout: 10` (R4), reabrir após teto vencido ou 2 falhas seguidas (R5), troca sem cortar
  transação viva (R6), desfecho desconhecido coberto pela idempotência do checkpoint (R7), log pelo porteiro com `code` e sem
  mensagem (R8), `503 DATABASE_UNAVAILABLE` nas rotas (R9).
- Parada: vela devida, carência de **15 min mantida**, `stalled_since` determinístico e fixo no episódio, chave do alerta =
  `(run_id, candle_time = stalled_since, side ∈ STALL/RESUME, channel)`, `RESUME` só fecha `STALL` (P1 a P8).
- Saúde: `/v1/health` `200`/`503` sem detalhe com teto próprio de 1 s que não derruba o porteiro; admin com `database` e
  `worker` (H1 a H3).
- Sem mensageria nova: o banco é a fila (o porquê está no ADR).
- **Ajuste ao plan D7:** `docker restart`/`docker pause` não reproduzem a meia conexão; o `make db-outage-test` precisa de um
  proxy TCP de teste que emudece as conexões.

Sem `[NEEDS CLARIFICATION]`: nada da reprodução exige mudar o teto de 30 s, a carência de 15 min nem o limite de 5. A causa do
incidente (meia conexão do encaminhador do Docker Desktop depois do sono) é a mais provável pelos fatos, mas não foi
reproduzida no Docker Desktop em si (proibido tocar nos containers); o contrato cobre os dois ramos.

Gates: só documentação; `bun x prettier --check` nos dois arquivos.

## T1.1 — Backoff, resumo de queda e campos seguros (2026-10-13, `sonnet`)

Código em `packages/database/src/connection/` (puro, sem I/O, ainda não exportado pela superfície pública):

- `reconnect-backoff.ts`: `computeBackoff({ attempt, baseMilliseconds, maxMilliseconds, random })`, a mesma conta do escutador
  (`c = min(base × 2^(attempt − 1), teto)`, espera `round(c/2 + c/2 × sorteio)`); o sorteio em `[0, 1]` entra pronto, sem
  `Math.random`, e fora da faixa é cortado.
- `safe-error-fields.ts`: `readSafeErrorFields` lê `errorName`, `code` e `errno` do erro MAIS INTERNO que tem `code`, até 4
  níveis de `cause`; só aceita token `[A-Za-z0-9_.-]{1,64}`, então URL, senha ou parâmetro num campo viram `UNKNOWN`.
- `outage-log.ts`: `createOutageLog()`: linha na primeira falha (`failures: 1, sinceMs: 0`), depois no máximo uma por 60 s,
  e `database recovered` (`downtimeMs`, `failures`) só se a queda chegou a ser registrada. Recebe o erro e só devolve campos
  seguros.

Contratos: `test/database-reconnect-backoff.contract.test.ts` (contas à mão para as tentativas 1 a 7 com sorteio 0, 0,5 e 1;
propriedades em 2.000 tentativas: nunca acima de 30 s, nunca abaixo de metade do degrau, inteiro positivo) e
`test/database-outage-log.contract.test.ts` (1.000 falhas a 1 s dão 17 linhas e a da volta; mensagem com URL, senha e
parâmetro nunca sai).

Gates (WSL, `gates6.sh`): contratos novos 25/25; `typecheck`, `lint` e `format` limpos; vizinhos (`database`,
`code-size-limits`, `test-support-boundary`, `app-import-boundary`, `ownership-registry`, `strategy-engine-boundary`,
`worker-environment`) 145/145.

## T1.2 — Dublê `flaky-sql` (2026-10-13, `sonnet`)

- `packages/database/src/connection/sql-client.types.ts`: o formato mínimo do cliente (`unsafe`, `begin`, `close`) que o Drizzle
  pede ao `Bun.SQL`; o porteiro (T1.3) e o dublê falam esse formato.
- `packages/database/test-support/flaky-sql.ts`: `createFlakyServer()` abre clientes que caem e voltam sob comando
  (`setMode`), com os modos medidos na T0.1: `refused` (`ERR_POSTGRES_CONNECTION_REFUSED`), `closed`
  (`ERR_POSTGRES_CONNECTION_CLOSED`, inclusive nas consultas em voo seguradas por `hold()`), `stopping` (`57P01` em `errno` com
  `ERR_POSTGRES_SERVER_ERROR`; `ERR_POSTGRES_EXPECTED_REQUEST` no comando de uma transação), `frozen` (consultas penduram e
  terminam no descongelamento; cliente novo dá `ERR_POSTGRES_CONNECTION_TIMEOUT`) e `hung` (meia conexão: as conexões abertas
  ficam mudas para sempre, só `close()` as solta com `CLOSED`; um cliente novo funciona). Erros são `PostgresError` e
  `wrapLikeDrizzle` reproduz o `DrizzleQueryError` (`name = "Error"`, consulta e parâmetros na mensagem, driver em `cause`). Toda
  mensagem leva `FLAKY_SECRET_URL` para o teste de log procurar vazamento. O cliente registra o que executou, os `timeout` de
  `close()` e as transações abertas.
- Contrato do próprio dublê: `test/flaky-sql.contract.test.ts` (13 casos: preguiça da consulta, cada modo, cura do mesmo
  cliente onde deve curar e não curar onde não deve, `close()` por cliente, formato dos erros).

Gates (WSL, `gates6.sh`): contrato 13/13; `typecheck`, `lint` e `format` limpos; vizinhos 145/145.

## T1.3 — `ResilientDatabase` (2026-10-13, `sonnet`)

Código em `packages/database/src/connection/`: `connection-error.ts` (R1: `isDatabaseConnectionFailure` percorre erro e `cause` até 4
níveis, lê `code` e `errno`; `DatabaseUnavailableError` com `DATABASE_UNAVAILABLE` e `DATABASE_QUERY_TIMEOUT`),
`connection-gate.ts` (estado `up`/`down`, sonda única, backoff, troca do cliente, aposentadoria do velho),
`resilient-database.ts` (teto por unidade, consulta preguiçosa e `begin`), `sql-client.types.ts`, `public.ts`.
`openDatabase` monta o porteiro com `connectionTimeout: 10` e entrega ao Drizzle um `SqlClient` que só expõe `unsafe`/`begin`
(o Drizzle só chama esses dois); a forma opaca do `DatabaseHandle` não mudou. Novo: `readDatabaseHealth(handle)`,
`DatabaseUnavailableError`, `isDatabaseConnectionFailure` na superfície pública. `DATABASE_QUERY_TIMEOUT_SECONDS` (5 a 300, padrão
30) validado por `databaseQueryTimeoutSecondsSchema` em `@ativada/environment` e ligado no ambiente e na abertura do banco da API e
do worker (as threads de backtest/walk-forward e o cron usam o padrão de 30 s).

Contrato (`test/database-resilient.contract.test.ts`, 17 casos, com o dublê): cai → `down` na primeira falha com o backoff da
conta à mão → falha rápida sem tocar o cliente → UMA sonda por espera → a segunda falha seguida reabre o cliente (velho fechado
com dreno de 1 s) → volta a `up` na primeira consulta; backoff 1, 2, 4, 8, 16, 30, 30 s; 57P01 em `errno` conta; erro de consulta
(23505) não; erro embrulhado como o Drizzle conta e falha rápida aninhada não; conexão muda estoura o teto, reabre na hora e a
unidade seguinte vai ao cliente novo; transação em voo nunca é trocada (o cliente velho só fecha depois dela; falha dela não
mexe no estado do novo); R7 documentado no teste (unidade vencida devolve falha mesmo que o servidor tenha aplicado; o que o
cliente velho disser depois é ignorado); `close()` fecha atual e aposentados.

Banco real (Postgres 18.3 embutido do WSL, porta 56434, fora do repo; containers do projeto intocados): novo
`checkReconnection` em `packages/database/test-support/reconnect-checks.ts`, chamado por `database-test.ts`: `pg_terminate_backend` na
conexão do cliente → `down` → volta a `up` sozinho em ~0,9 s (`down=true`). **Pendência:** o `database-test` inteiro não chega ao
fim neste WSL porque a medição "lote de 17.520 pontos < 1.500 ms" já falha SEM a mudança (commit anterior 1.922 ms; com a
mudança 1.677 ms, disco do WSL); rodei o caso novo isoladamente. `make database-test` precisa de Docker (instável aqui).

Gates (WSL, `gates6.sh`): `typecheck`, `lint` e `format` limpos; 335/335 nos contratos novos e nos vizinhos (`database`,
`database-tls` com a CA própria pelo `openDatabase` real, `code-size-limits`, boundaries, ownership, ambientes da API e do
worker, agendadores). Observação: `environment.contract.test.ts` "worker-ativada boots" falhou uma vez em lote paralelo e passa
isolado (temporização).

Desvio do ADR R8: o porteiro NÃO loga; quem loga é cada laço do worker pelo `outage-log` (T1.4), que dá ≤ 1 linha por laço a
cada 60 s e vale também para a API quando ela passar a usar o mesmo resumo.

## T1.4 — Laços do worker esperam o backoff e logam pelo `outage-log` (2026-10-13, `sonnet`)

- `packages/database/src/connection/outage-guard.ts`: `createDatabaseOutageGuard({ readHealth, now, write })` (pública). Uma guarda
  por laço: `isWaiting`/`waitMilliseconds` (porteiro `down` e antes de `nextAttemptAt`), `handleFailure` (erro de conexão vira
  resumo do `outage-log`; outro erro devolve `false` e o laço trata como antes), `handleSuccess` (linha `database recovered`).
- Worker: `outage/loop-outage-guard.ts` liga a guarda ao logger e ao `readDatabaseHealth`. `live-scheduler` e `alert-scheduler`
  pulam a ronda enquanto o porteiro espera e, na falha de conexão, logam só o resumo (`database unavailable` com `code`,
  `failures`, `sinceMs`, no máximo uma por 60 s por laço; nada de `live tick failed`/`alert dispatch failed` com erro).
  `recovery-runner` espera `max(backoff do porteiro, 1 s)` e tenta de novo; `recoverGaps` deixa o erro de conexão subir (não conta por
  par). Cada laço tem a própria guarda (live, alertas, recuperação), criadas em `main.ts` e `create-alert-wiring.ts`.
- Contrato `test/worker-database-outage.contract.test.ts`: com o banco fora (dublê `refused`/`closed`) e relógio injetado, 1.000
  rondas de 5 s do laço ao vivo e 1.000 ciclos do laço de alertas dão linhas separadas por ≥ 60 s, todas com `code`, nenhuma com URL,
  senha, texto de consulta ou parâmetro; a primeira ronda depois do `nextAttemptAt` com o banco de volta loga `database recovered`
  e o porteiro volta a `up`. Recuperação de lacunas: espera, resume e termina quando o banco volta, sem `gap recovery failed` nem
  `retry scheduled`. Erro que não é de conexão segue indo ao log só pelo nome.
- Superfície pública: `createDatabaseOutageGuard` entra e `isDatabaseConnectionFailure` sai (o `index.ts` está no teto de 200 linhas);
  `DatabaseUnavailableError` e `readDatabaseHealth` ficam para a API (T1.6).

Gates (WSL, `gates6.sh`): `typecheck`, `lint` e `format` limpos; 360/360 em 24 arquivos (contratos novos, `database`,
resiliência, agendadores, recuperação, stream, ban, shutdown, avaliador ao vivo e seus mutantes, despachante de alertas,
`code-size-limits`, boundaries, ownership) e 35/35 em `environment` + `database` + o novo.

Pendências: o candle writer grava por vela com retry próprio (3 tentativas) e continua logando só `errorName` por falha de gravação
(sem mensagem), fora do resumo de 60 s; a API ainda não usa a guarda (T1.6/T2.3).

## T1.5 — Batimento do worker (2026-10-13, `sonnet`)

- Migration `0022_worker_heartbeats` (+ `.rollback.sql`, snapshot e `_journal.json` gerados por `drizzle-kit generate --name worker_heartbeats` no WSL;
  uma segunda rodada deu "No schema changes"). Tabela `worker_heartbeats`: `instance_id` (PK, varchar 64, sorteado no boot), `started_at`,
  `last_beat_at` (ambos `now()` do banco), `version` (varchar 32, opcional), índice em `last_beat_at DESC`. Sem `user_id`, sem dado pessoal.
- `packages/database/src/worker-heartbeats/`: `createWorkerHeartbeatRepository(handle)` com `recordBeat` (upsert da instância + apaga linhas que não
  batem há mais de 24 h) e `findLatest` (a batida mais nova, com `ageMilliseconds` pelo relógio do banco, para a T1.6). Exportado em `index.ts`
  (que ganhou espaço trocando a lista de tipos de `run-result.types` por `export type *`).
- Registro LGPD: tabela sem dono declarada em `UNOWNED_PUBLIC_TABLES` (como `candles`), comentário ajustado para "mercado e operacionais".
- Worker: `WORKER_HEARTBEAT_SECONDS` (5 a 120, padrão 15) no `environment.ts`; `heartbeat/heartbeat-loop.ts` (batida imediata e a cada intervalo, sem
  sobreposição, espera o backoff do porteiro com a guarda própria, loga só o resumo da queda ou `errorName`, `stop()` espera a batida em voo) e
  `heartbeat/create-heartbeat-wiring.ts`; `main.ts` liga no boot e o desliga no shutdown gracioso, antes de fechar o banco.
- Desvios do ADR/spec: a coluna é `last_beat_at` (H3), não `beat_at`; os "contadores agregados das rondas" ficam de fora (nada no worker os produz hoje,
  e a spec não os usa); `version` é gravada vazia até haver uma fonte da versão.

Gates: `typecheck`, `lint` e `format` limpos (WSL, `gates6.sh`); 191/191 em `database`, `worker-heartbeat` (novo, 5), `worker-environment`,
`candle-schema`, `ownership-registry`, `account-delete`, `account-export`, `code-size-limits`, boundaries; `worker-database-outage` 6/6.
Banco real (Postgres 18.3 embutido, WSL, porta 56434, fora do repo; containers do projeto intocados), equivalentes de `make`:
`DATABASE_URL=<postgres://…:56434/postgres> bun run --cwd packages/database db:migration-test` -> "OK (23 migrations aplicadas e desfeitas)" (rollback
deixa `public` vazio) e `... db:database-test` -> "OK", incluindo os 3 casos novos de batimento (`worker-heartbeat-checks.ts`).

## T1.6 — Saúde honesta e 503 com o banco fora (2026-10-13, `sonnet`)

- `GET /v1/health` (público): `SELECT 1` pelo porteiro com teto PRÓPRIO de 1 s (`health/database-probe.ts`; estourar responde 503 e NÃO marca o porteiro `down`,
  provado com o dublê em modo `hung`: 503 em ~1 s e `readHealth().state` segue `up`). `200 {data:{status:'ok'}}` ou `503 {data:{status:'degraded'}}`, só isso
  (sem código de erro, versão nem host), `Cache-Control: no-store`.
- `GET /v1/admin/health` ganha `database` (`state`, `consecutiveFailures`, `downSince`, `lastFailureCode`, `lastFailureAt`; só o código, nunca a mensagem) e
  `worker` (`lastHeartbeatAt`, `ageSeconds`, `state`: `alive` até 3 x `WORKER_HEARTBEAT_SECONDS` de idade pelo relógio do banco, `stale` acima, `unknown` sem
  linha ou sem conseguir ler). `checks.database`, `listener` e `runs` intactos. `WORKER_HEARTBEAT_SECONDS` virou `workerHeartbeatSecondsSchema` em
  `@ativada/environment`, usado pelo worker e pela API.
- R9: o filtro global (`exception-filter.ts`) devolve `503 DATABASE_UNAVAILABLE` (`Retry-After: 5`, mensagem fixa) para `DatabaseUnavailableError` E para qualquer
  falha de conexão ainda embrulhada pelo Drizzle (R1, `isDatabaseConnectionFailure` agora pública); não vai a `reportUnexpectedError`. Erro de consulta (23505) segue 500.
  Sem try/catch em use case. A API resume a queda pelo mesmo `createDatabaseOutageGuard` (uma linha por minuto, só `code`) e registra a volta quando o porteiro volta a `up`
  (`reportDatabaseOutage`/`reportDatabaseRecovery` no roteador).
- OpenAPI: 503 `DATABASE_UNAVAILABLE` em todas as rotas (`COMMON_ERRORS`); o `/v1/health` documenta o 503 como resposta `{status:'degraded'}` (sucesso declarado vence o erro comum no gerador).
- Contratos: `test/api-database-outage.contract.test.ts` (12; `loadApiApp()`, porteiro real com o dublê: banco dentro, fora, volta, lento; admin; rotas 503; sem URL/consulta/parâmetro),
  `health-routes`, `api-openapi` (+1), `admin-boundary-routes`, `api-server` (o processo sobe com 200 ou 503, conforme haja Postgres).
- Desvio: R9 aplicada a qualquer falha de conexão (R1) e não só ao `DatabaseUnavailableError`, senão a primeira requisição depois da queda ainda dava 500.

Gates (WSL): `typecheck`, `lint`, `format` limpos; 343/343 nos contratos da task e vizinhos; rodada completa de `test/*.contract.test.ts` sem mutantes: 0 falhas em todos os lotes.

## T1.7 — `make db-outage-test` e mutantes da reconexão (2026-10-13, `sonnet`)

- `packages/database/test-support/outage-proxy.ts`: proxy TCP de teste com `forward`, `refuse` (derruba tudo e fecha as novas na hora) e `mute` (conexões abertas e novas
  ficam mudas SEM fechar; as antigas nunca voltam). Contrato próprio: `test/outage-proxy.contract.test.ts`.
- `scripts/db-outage-test.ts` + `scripts/db-outage-test/` e alvo `make db-outage-test`: dois bancos descartáveis (execução contínua x cenário), worker REAL em processo à parte
  e API real (em processo) atrás do proxy, Binance falsa. Por cenário: 60 velas antes, 30 s de queda com as 246 velas restantes chegando ao banco, volta; confere `/v1/health`
  503 durante e 200 depois, `503 DATABASE_UNAVAILABLE` numa rota de usuário, linhas iguais às da execução contínua (digest de sinais, ordens, preenchimentos, posições, patrimônio),
  log do worker (resumo com `code`, sem URL, senha, consulta nem "tick failed") e o admin (`database.lastFailureCode`). Fecha com o batimento: `alive` -> `stale` (SIGKILL) -> `alive`.
- Resultado medido (Postgres 18.3 embutido do WSL, porta 56434; comando:
  `DATABASE_URL=<…:56434/postgres> bun --env-file=envs/env.test run scripts/db-outage-test.ts` no espelho do WSL):
  - kill (proxy `refuse`): `/v1/health` voltou a 200 em 2.773 ms e o worker alcançou a última vela em 4.773 ms depois da volta (limite 60.000); 307 sinais e 27 preenchimentos iguais
    aos da execução contínua; 4 linhas "database unavailable" (códigos `DATABASE_QUERY_TIMEOUT`, `DATABASE_UNAVAILABLE`) e 4 "database recovered".
  - meia conexão (proxy `mute`): 3.045 ms e 2.509 ms; os mesmos 307 sinais e 27 preenchimentos; 4 linhas e 3 "recovered".
  - batimento: `stale` 14.867 ms depois do SIGKILL (limite 15.000), `alive` 267 ms depois de outro worker subir.
- Mutantes `test/db-reconnect-mutants.contract.test.ts` (45 + controle, todos mortos): teto de tempo por unidade, reabertura após o limiar, troca do cliente com transação em voo,
  eco de cliente aposentado, sonda única, classificação (cada código, SQLSTATE 08/57P0x, errno, `cause`), log com mensagem crua, janela de 60 s, volta registrada, backoff sem teto/
  sem crescimento/sem sorteio. Os contratos `database-resilient`, `-outage-log` e `-reconnect-backoff` passaram a carregar o código por `loadDatabaseConnectionApi()` (é por onde
  o mutante entra). Primeira rodada: 6 sobreviventes; 2 eram equivalentes (`isAbandoned` só vale entre o estouro e o `finally`, e sai removido do conjunto) e 4 viraram testes novos
  (sucesso de transação num cliente aposentado não marca `up`; classificação de `CONNECTION_TIMEOUT`, `EXPECTED_REQUEST` e classe 08).

Pendências: `docker restart` real do Postgres NÃO foi rodado (sem Docker utilizável aqui; o `kill` é o `refuse` do proxy, que para os clientes é igual); `make db-outage-test` em si
não rodou (depende de `make up`), só o comando equivalente acima; `resync` do LISTEN não é asserido.

## T2.1 — `computeStalledSince` (2026-10-13, `sonnet`)

- `apps/api-ativada/src/runs/stall/stall-policy.ts`: `computeStalledSince({ timeframe, lastCandleTime, startedAt, now, graceMinutes, waitingForData })` puro, sem relógio (`now` entra por parâmetro).
  Vela devida = a seguinte à última passada (`lastCandleTime + d`) ou, sem passo, a que estava em curso na criação (`floor(startedAt ÷ d) × d`); `stalledSince` = fechamento dela + carência
  (nunca o instante da varredura); `undefined` em dia ou em `waitingForData`. Usa `ENGINE_TIMEFRAME_DURATION_MILLISECONDS` do motor (só leitura).
- Contrato `test/live-stall-policy.contract.test.ts` (16): contas à mão em 15m, 1h, 4h e 1d com passo e sem passo, no instante exato do limite e um milissegundo antes, início igual quando a varredura chega horas
  depois, `waitingForData`, carência parametrizada e propriedade em 2.000 casos (nunca antes de `última + 2d + carência`, determinístico). A fixture `api-app.fixture.ts` ganhou `stallPolicy` (por onde os mutantes da T2.5 entram).
- Estabilidade DURANTE o episódio (P3) não é da função pura (ela recalcula a partir do estado atual): o varredor da T2.3 mantém o `stalled_since` gravado enquanto a fórmula disser parada.

Gates (WSL, `gates6.sh`): `typecheck`, `lint` e `format` limpos; contrato novo 16/16; vizinhos (`code-size-limits`, `app-import-boundary`, `strategy-engine-boundary`, `ownership-registry`) 75/75.

## T2.2 — Migration `0023_run_stall` e `stalledSince` na API (2026-10-13, `sonnet`)

- Migration `0023_run_stall` (+ `.rollback.sql`, snapshot e `_journal.json` gerados por `drizzle-kit generate --name run_stall` no WSL; a segunda rodada deu "No schema changes, nothing to migrate"):
  `ALTER TABLE runs ADD COLUMN stalled_since bigint` (nula, sem DEFAULT) e troca de `alerts_side_check` (DROP + ADD com `BUY, SELL, GOAL, PRICE, STALL, RESUME`); nenhuma linha existente é tocada.
- `rollback`: apaga as linhas de `alerts` com lado `STALL`/`RESUME` (avisos operacionais que só existem por causa da migration; mesma regra do rollback da 0018 com `PRICE`), solta a coluna e restaura a CHECK antiga.
  Provado à parte (Postgres embutido, WSL): com alertas `BUY`, `STALL` e `RESUME` gravados, o rollback deixa só o `BUY`, a coluna some, `STALL` volta a ser recusado, e reaplicar a 0023 aceita `STALL` de novo.
- Schema Drizzle: `runs.stalledSince` (`bigint`, modo `number`); `ALERT_SIDE.STALL`/`RESUME` (a CHECK do schema sai de `Object.values(ALERT_SIDE)`); `RunRecord.stalledSince?` (opcional para não mexer nas fixtures em memória); mapper lê a coluna.
- API: `GET /v1/runs/:id` e a lista trazem `stalledSince` (ms UTC) só quando gravado e a execução está `running`; AUSENTE nos outros casos (aditivo, `epochMillisecondsSchema.optional()` no `RUN_VIEW_SCHEMA`, descrito no OpenAPI). Painel: espelho Zod `stalledSince: z.number().optional()` em `run.validation.ts` (a faixa é da T3.3).
- Dispatcher do worker: o lado `STALL`/`RESUME` ainda não tem texto (T2.4); até lá ele cai como `bad_payload` sem enviar, e nada os enfileira antes da T2.3.
- Contratos: `api-runs` ganhou 2 casos (campo ausente em dia, presente no detalhe e na lista, some quando zera, não aparece em execução terminada, 404 idêntico para outro dono). `packages/database/test-support/run-stall-checks.ts` (ligado ao `database-test`): coluna nasce nula e guarda ms, `STALL`/`RESUME` aceitos uma vez por início de episódio, lado desconhecido recusado pela CHECK.

Comandos (WSL, Postgres 18.3 embutido de `~/pg-scratch`, porta 56434, fora do repo; containers do projeto intocados), equivalente de `make migration-test`:
`DATABASE_URL=<postgres://probe:…@127.0.0.1:56434/postgres> bun run --cwd packages/database db:migration-test` -> "migration-test: OK (24 migrations aplicadas e desfeitas)".
O `run-stall-checks` rodou isolado ("stall-only OK"): o `database-test` inteiro continua não terminando neste WSL pela medição de 17.520 pontos (pendência herdada da T1.3).

Gates (WSL, `gates6.sh`): `typecheck`, `lint` e `format` limpos; 207/207 (api-runs, api-openapi, ownership-registry, database, strategy-persistence-schema, alert-dispatcher/-scheduler/-message, candle-schema, users-schema);
236/236 (live-alerts, live-alert-parts, live-evaluator, live-gap-wait, telegram-alert-mutants, code-size-limits, boundaries, api-run-delete/-export, account-export/-delete); painel 624/624.

## T2.3 — Varredura de parada na API (2026-10-13, `sonnet`)

- Banco: `packages/database/src/run-stall/` (`createRunStallRepository(handle).inTransaction(work)`): UMA transação por ronda com a sessão `StallSession` (`tryAcquireLock` = `pg_try_advisory_xact_lock`,
  `listCandidates`, `openEpisode`, `closeEpisode`, `clearInactiveEpisodes`). `openEpisode` faz o `UPDATE runs SET stalled_since` (guardado: `running`, `live_paper`, sem episódio aberto e MESMO `last_candle_time` lido, para o
  worker que andou entre a leitura e a gravação não abrir episódio falso), o `INSERT` em `alerts` (`STALL`, `candle_time = stalled_since`, `ON CONFLICT DO NOTHING` na chave única que já existia) e o `pg_notify('run_events',
  { runId, kind: 'warning', eventId: stalled_since })`, tudo na MESMA transação. `closeEpisode` apaga o `stalled_since` aberto (guardado por ele) e enfileira o `RESUME` só se o `STALL` do mesmo episódio existe na caixa de saída.
  Dono sem Telegram vinculado e ligado não recebe alerta (a faixa do painel e o aviso ao painel saem igual). Execução que deixou de rodar com episódio aberto só perde a marca (`clearInactiveEpisodes`), sem `RESUME` (P6).
- API: `apps/api-ativada/src/runs/stall/` — `stall-sweeper.ts` (`sweepStalls`: a máquina de estados; quem não pega a trava não faz nada; episódio aberto só fecha quando a regra diz "em dia"; `waitingForData` nem abre nem fecha),
  `stall-alert-payload.ts` (`{ symbol, timeframe, stalledSince }` e `+ resumedAt`), `stall-sweep-loop.ts` (uma ronda por vez, guarda de queda do banco igual à do batimento do worker: resumo de uma linha por minuto, só `errorName` nos
  outros erros, `stop()` espera a ronda no ar), `create-stall-sweeper-wiring.ts` e `stall-environment.ts` (`LIVE_STALL_GRACE_MINUTES` 5 a 240, padrão 15; `LIVE_STALL_SWEEP_SECONDS` 5 a 3600, padrão 60).
  Ligada em `create-application.ts`: `start()` depois do despachante, `closeResources()` antes do stream, no encerramento gracioso.
- Desvios do ADR: (1) a vela devida sem passo usa `runs.period_start` (a abertura da vela em curso na CRIAÇÃO, que é o que o worker avalia primeiro) e não `floor(started_at ÷ d) × d`: igual quando a reivindicação é na mesma vela, e nunca
  adianta o alarme quando a fila demora. (2) O payload leva só par, vela e horários (nada de nome de estratégia): os alertas existentes tampouco levam, e o nome é texto livre do usuário.
- Contratos em memória (`test/live-stall-sweeper.contract.test.ts`, 13; dublê `test/fixtures/stall/in-memory-stall-store.fixture.ts`): carência exata abre com início determinístico; ronda repetida, horas depois e recuperação parcial não mudam o
  início nem duplicam; fecha com UM `RESUME` no início do episódio e episódio novo tem `STALL` novo; duas varreduras ao mesmo tempo (uma pega a trava); `waitingForData`; execução parada limpa a marca sem `RESUME`; dono sem Telegram; `RESUME` sem `STALL`;
  conteúdo sem dono, execução nem estratégia; laço (só contagens no log, banco em espera, erro só pelo nome). `api-limits-environment` ganhou as duas variáveis.
- Contra o Postgres real (`packages/database/test-support/run-stall-sweep-checks.ts`, ligado ao `database-test`): ciclo abre/fecha/reabre com UM `STALL` e UM `RESUME` pendentes no início do episódio, aviso ao painel só `{ runId, kind, eventId }` sem dono, leitura velha não abre,
  sem Telegram sem alerta, `RESUME` só atrás de `STALL`, episódio órfão limpo, trava consultiva única entre duas transações simultâneas (a segunda recebe `false`, a terceira depois do fim da primeira recebe `true`) e rollback que leva `stalled_since`, alerta e aviso juntos.

Comando (WSL, Postgres 18.3 embutido de `~/pg-scratch`, porta 56434, fora do repo): os checks da parada rodaram isolados do `database-test` (que segue sem terminar neste WSL pela medição de 17.520 pontos, pendência da T1.3): "stall-only OK" com os 5 checks.

Gates (WSL, `gates6.sh`): `typecheck`, `lint` e `format` limpos; 298/298 em 14 arquivos (varredura, política, ambientes, api-server, api-runs, api-openapi, ownership, code-size, boundaries, database, api-database-outage, api-application-dispatcher) e 121/121 em 5 (database, alert-dispatcher, live-alerts, worker-environment, worker-heartbeat).

## T2.4 — Texto `STALL`/`RESUME` no despachante do worker (2026-10-13, `sonnet`)

- `apps/worker-ativada/src/alerts/format-stall-alert-message.ts`: `formatStallAlertMessage` ("Simulação parada · BTCUSDT 1h / Está sem avançar desde 13/10 14:05 UTC...") e `formatResumeAlertMessage` ("Simulação voltou ... voltou a andar às ..."); horário em UTC com o rótulo
  (o worker não conhece o fuso da pessoa). Só par, vela e horários, mais "Nenhuma operação foi perdida." e "Simulação: nenhum dinheiro real foi usado.".
- `live/alert-payload.schema.ts`: `stallAlertPayloadSchema` e `resumeAlertPayloadSchema`, ESTRITOS: chave a mais (PII) ou faltando = `bad_payload`, nada sai. `alert-dispatcher.ts` ganhou as duas ramas em `renderAlertText`; o teto diário
  (`ALERT_TELEGRAM_DAILY_LIMIT_PER_USER`), o vínculo por chat lido no envio, o retry e o `claimDue` seguem os mesmos do alerta de sinal (nada a repetir).
- Worker morto: o `STALL` fica `pending` na caixa de saída (a API o grava) e só sai quando o despachante volta; a faixa do painel (T3.3) é o aviso imediato. Comportamento que já existia, agora provado no contrato.
- Contrato `test/alert-stall.contract.test.ts` (9) com a Bot API falsa em HTTP de verdade (`test/fixtures/telegram/`, `alerts-api.fixture.ts` ganhou os dois formatadores): texto exato, envio ao chat do dono uma vez, pendente até o despachante voltar, teto diário
  dispensa com `daily_limit`, conteúdo com e-mail a mais ou sem `resumedAt` falha como `bad_payload` sem enviar, log sem token, chat, par nem horário, e o conteúdo que a varredura da API monta passa no esquema estrito do worker.

`make telegram-test` equivalente (WSL, Postgres 18.3 embutido, porta 56434, fora do repo; containers do projeto intocados):
`DATABASE_URL=<postgres://probe:…@127.0.0.1:56434/postgres> bun --env-file=envs/env.test run scripts/telegram-test.ts` -> "telegram-test: OK" (297 mensagens entregues, retry, queda, LGPD e log limpos), EXIT 0.

Gates (WSL, `gates6.sh`): `typecheck`, `lint` e `format` limpos; 227/227 em 10 arquivos (alert-stall, alert-dispatcher/-scheduler/-message, telegram-alert-mutants, telegram-client, live-alerts, live-alert-parts, code-size-limits, app-import-boundary).

## T2.5 — Mutantes da parada e o caso de parada no `db-outage-test` (2026-10-13, `sonnet`)

Correção da T2.4: `test/alert-stall.contract.test.ts` tem 8 casos (não 9).

- Mutantes da API, `test/live-stall-mutants.contract.test.ts` (23 + controle, todos mortos; cópia do `src` da API julgada por `live-stall-policy`, `live-stall-sweeper` e `alert-stall`, com `--bail`): carência ignorada, dobrada ou com
  limite exclusivo; vela devida no começo da vela e não no fechamento; "próxima vela" sem avançar; primeira vela fora da grade; `waitingForData` contando como parada; `stalled_since` = instante da varredura (na regra e na gravação do episódio);
  varredura sem a trava consultiva e ignorando a resposta dela; recuperação parcial que fecha e reabre o episódio (STALL duplicado); espera por dado que encerra o episódio; episódio que nunca fecha; marca que sobra em execução parada;
  conteúdo do `RESUME` sem o início do episódio; conteúdo do alerta com `runId` (PII) ou sem o par; laço que ignora a espera do banco, loga toda ronda ou loga a mensagem crua do erro.
- Mutantes do banco, `scripts/stall-mutants.ts` + `make stall-mutants` (11 + controle, todos mortos; juiz `packages/database/test-support/run-stall-test.ts` contra o Postgres real): sem `pg_try_advisory_xact_lock`; `ON CONFLICT` removido (STALL duplicado no mesmo
  episódio); `RESUME` sem `STALL`; alerta para dono sem Telegram; leitura velha que abre episódio; episódio sobrescrito; episódio fechado por outro início; aviso ao painel que não sai; marca que sobra em execução parada; marca apagada em execução que
  roda; varredura fora de uma transação. A primeira rodada deixou 1 sobrevivente (apagar a marca de execução rodando passava): o check ganhou "episódio de execução que segue rodando não é apagado" e o mutante passou a ser morto.
  Comando (WSL, Postgres embutido porta 56434): `DATABASE_URL=<postgres://probe:…@127.0.0.1:56434/postgres> bun --env-file=envs/env.test run scripts/stall-mutants.ts` -> "stall-mutants: OK - 11 mutantes reprovados".
- `scripts/db-outage-test/check-stall.ts` (ligado ao `scripts/db-outage-test.ts` entre a queda e o batimento): worker SIGKILL; usuário com Telegram vinculado; simulação `live_paper` `running` cuja linha do tempo recua 3 h (o relógio da API é o real, então "relógio
  adiantado" é montado do outro lado: a regra só olha `agora − vela devida`); API real varrendo a cada 5 s -> `GET /v1/runs/:id` e a lista trazem `stalledSince` = vela devida + 15 min; várias rondas depois há UM `STALL` pendente e o `stalledSince` não muda; o
  checkpoint alcança a última vela fechada -> a faixa some e fica UM `RESUME` (mesmo início do episódio); o log da varredura tem só as duas linhas de contagem, sem id, dono, par nem chat. O worker é reiniciado no fim para o caso do batimento.
  Comando: `DATABASE_URL=<postgres://probe:…@127.0.0.1:56434/postgres> bun --env-file=envs/env.test run scripts/db-outage-test.ts` -> "db-outage-test: OK"; resultado da parada: faixa em 2.926 ms, faixa some em 4.747 ms depois do checkpoint; queda
  `kill` e `half-open` seguem iguais (307 sinais e 27 preenchimentos iguais aos da execução contínua) e o batimento `alive -> stale -> alive`.

Gates (WSL, `gates6.sh`): `typecheck`, `lint` e `format` limpos; 726/726 em 45 arquivos (`live-*`, `alert*`, `telegram*`, `database*`, `api-run*`, boundaries, ownership, lgpd, code-size; sem os arquivos de mutantes, que rodaram à parte: `live-stall-mutants` 24/24).

## T3.1 — Constantes da vela, `nextCandleClose` puro e `useGoalSimulation` (2026-10-13, `sonnet`)

Decisão do usuário (2026-10-13): vela padrão da simulação = 1 hora; o ritmo FINAL será decidido por um futuro "analista de risco" (spec 007), que NÃO nasce nesta spec. Aqui entra só o padrão `1h` com o seletor simples da spec.

- `src/goals/simulation-timeframe.constant.ts`: `SIMULATION_TIMEFRAME`, padrão `1h` (`DEFAULT_SIMULATION_TIMEFRAME`), opções visíveis 1h/4h/1d, escondida 15m, frases do RF02 e avisos do RF03 EXATAMENTE como no `spec.md`, `LIVE_RUN_LIMIT = 5`.
- `src/goals/next-candle-close.ts`: `nextCandleClose({ timeframe, now })`, PURO (sem relógio global; `now` entra por parâmetro). As velas alinham à época UTC (a diária fecha 00:00 UTC = 21:00 em São Paulo); no instante exato do fechamento nasce a vela seguinte.
- `src/format/zoned-moment.ts`: `formatRelativeMoment` ("21:00 de hoje" / "de amanhã" / "de ontem" / data completa no fuso do usuário, via `formatDayInZone`/`formatTimeInZone` da spec 005) e `describeZone` ("horário de Brasília" no fuso padrão; nos demais, o deslocamento "GMT−4").
- `src/goals/simulation-text.ts`: `describeFrequency` (a frase do 1d usa o horário do fechamento no fuso do usuário) e `describeSimulationSummary` ("A simulação olha o mercado a cada 1 hora. Primeira vela fecha às 10:00 de hoje (horário de Brasília).").
- `src/goals/useGoalSimulation.hook.ts` saiu do `RankingCard`; agora recebe a vela e o `POST /v1/runs` leva `timeframe` escolhido (o `RankingCard` passa o padrão `1h` até o seletor da T3.2). `GOAL_TIMEFRAME` segue só para o plano (`plan.query.ts`), que é diário.
- Desvio pequeno: o resumo diz "às 10:00 **de hoje** (horário de Brasília)" (o spec escreve "às 15:00 (horário de Brasília)"): o "hoje/amanhã" é o do RF06 e evita ambiguidade quando o fechamento é amanhã.
- `test/goals.contract.tsx`: o `POST` agora espera `timeframe: '1h'` (era `1d`). `test/simulation-timeframe.contract.ts` (14 casos, na lista explícita do `package.json`): fim da vela em 15m/1h/4h/1d, instante exato do fechamento, grade de 4h, virada do dia em São Paulo (21:00 hoje/amanhã, 00:00 de amanhã às 02:59 UTC), outro fuso (New York), frases exatas.

Gates (WSL, `gates6.sh`): `typecheck`, `lint` e `format` limpos; `panel-test` 638/638 em 50 arquivos.

## T3.2 — `SimulationTimeframePicker` no ranking e na tela da meta (2026-10-13, `sonnet`)

- `src/goals/SimulationTimeframePicker.component.tsx`: `<fieldset>` com legenda "De quanto em quanto tempo olhar o mercado" e radios nativos do mesmo grupo (teclado e leitor de tela do navegador: setas, nome pelo `<label>`, frase da opção em `aria-describedby`); 1 hora, 4 horas e 1 dia visíveis, padrão `1h`; botão "Mais opções" (`aria-expanded`/`aria-controls`) abre o 15 minutos, que não recolhe enquanto escolhido; resumo "A simulação olha o mercado a cada 1 hora. Primeira vela fecha às HH:MM de hoje (horário de Brasília)." (`aria-live`); aviso do RF03 sempre visível; em 15 min, o aviso de taxas com "⚠" mais o texto (forma e palavra, não só cor); contagem "Você tem N de 5 simulações ao vivo."
- Mesmo seletor na tela da meta: o `RankingCard` é o cartão de `/metas/:goalId`, então a RF04 se cumpre num lugar só. A vela escolhida segue só na simulação (`runs.timeframe`); a meta e o ranking não mudam.
- `useGoalSimulation(goalId, timeframe)` manda o `timeframe` escolhido no `POST /v1/runs`; `live-runs.query.ts` + `useLiveRunSlots.hook.ts` leem as execuções `live_paper` na fila ou rodando (chave sob a raiz `runs`: criar, parar e o aviso do stream refazem) e dão contagem, limite e duplicata.
- `RankingItem`: botão desabilitado no limite de 5 com o texto "Você chegou ao limite de 5 simulações ao vivo. Pare uma para começar outra." (`aria-describedby`); mesma estratégia (versão), par e vela já ativos mostram "Você já tem esta simulação rodando." com link para `/backtests/:id`, SEM bloquear (D4). Outra vela da mesma estratégia e par não avisa. O `409 LIVE_RUN_LIMIT_REACHED` usa o mesmo texto (`GOAL_ERROR_TEXT` agora vem de `LIVE_RUN_LIMIT_TEXT`; o teste de `goals.contract.tsx` foi ajustado de "máximo de simulações" para "limite de 5 simulações").
- Cores: `--accent-soft` (aviso do ranking) e `--warn`/`--warn-soft` (taxas e duplicata) vêm dos tokens, sem estilo inline; alvos de toque de 44 px nas opções.
- Contrato `test/simulation-picker.contract.tsx` (12 casos, na lista do `package.json`): grupo de radios com `1h` marcado e as três frases; radios do mesmo `name` descritos pela frase; "Mais opções" fechado/aberto e o aviso de taxas; o `POST` leva `1h` (padrão), `4h`, `1d` e `15m`; `409` mostra o texto do RF05; "3 de 5" só conta ativas; duplicata avisa com link e não bloqueia; outra vela sem aviso; 5 de 5 desabilita e explica.

Gates (WSL, `gates6.sh`): `typecheck`, `lint` e `format` limpos; `panel-test` 650/650 em 51 arquivos.

## T3.3 — `LiveRunStatus` nos três lugares (2026-10-13, `sonnet`)

- `src/runs/live-run-status.ts` (puro) e `LiveRunStatus.component.tsx`: quatro estados da simulação `live_paper` na fila ou rodando, na ordem em que valem: (1) **parada** (`stalledSince` do servidor): faixa com borda grossa à esquerda, "⚠", a palavra "Parada." e o texto do RF13 ("Sua simulação está parada desde 13:15. O sistema está tentando retomar; nenhuma operação foi perdida."; "ontem"/data quando não é hoje), `role="status"`, nunca só cor (`--warn`/`--warn-soft`); (2) **espera por dado** (`waitingForData`, texto de antes); (3) **aguardando a primeira vela** ("Aguardando a primeira vela, que fecha às 15:00 de hoje.", "de amanhã", e "fechou" quando o horário já passou sem passo; o fim da vela em curso na criação é `nextCandleClose` sobre `startedAt ?? createdAt`, a mesma conta de `computeStalledSince` da API); (4) **rodando** ("Olha o mercado a cada 1 hora. Última decisão às 14:00 de hoje · próxima às 15:00 de hoje.": a decisão acontece no fechamento da vela, então a última é `lastCandleTime + vela` e a próxima, `+ 2 × vela`). Todos acompanham "Horários em GMT−3." (deslocamento do fuso do usuário). Quando o campo `stalledSince` some da resposta, a próxima consulta (polling de 2 s) volta ao estado normal sozinha.
- Usado em `BalanceCard` (Visão geral), `ActiveGoalCard` (cartão "Meta ativa") e `RunProgressCard` ("Andamento" do detalhe da simulação). Backtest, walk-forward e execução encerrada não têm estado.
- Zod: `stalledSince` já existia no `runSchema` do painel (`run.validation.ts`, confere com a API); ganhou `lastCandleTime` e `startedAt` (`nullish`, aditivos) que a API já devolve em `GET /v1/runs/:id`.
- **"Aguardando o primeiro candle" saiu do código e de `test/goals.contract.tsx`.** O caso "without equity yet it waits for the first candle" agora espera "Aguardando a primeira vela" no cartão de meta (e prova com regex que a frase velha não volta); no `BalanceCard`, "Aguardando o primeiro candle fechado para calcular o saldo." virou "O saldo aparece quando a primeira vela fechar." O `BalanceCard` manteve "Rodando"/"Na fila" como rótulo e a espera por dado passou a sair do `LiveRunStatus` (o texto "Aguardando dados do mercado" continua exato; o horário agora usa o fuso do usuário). Nenhum outro teste (`overview.contract.tsx` incluso) precisou mudar.
- `ActiveGoalCard`: `GoalRunBody` ficou grande para o limite de 40 linhas, então `buildProgress` e `GoalLoadFailure` saíram dele (sem mudar comportamento).
- Contrato `test/live-run-status.contract.tsx` (15 casos, relógio fixo em 2026-10-13 17:20 UTC = 14:20 em São Paulo, na lista do `package.json`): os quatro estados com fixture (função pura: hoje, amanhã, "fechou", última/próxima, parada hoje e ontem, nenhum estado para backtest, encerrada ou vela desconhecida) e nos três lugares (Visão geral, meta ativa e detalhe), inclusive a faixa que some quando o campo some. Armadilha registrada no teste: dentro de `waitFor`, `toBeNull()` falho serializa o elemento do DOM e leva segundos por tentativa; use comparação booleana.

Gates (WSL, `gates6.sh`): `typecheck`, `lint` e `format` limpos; `panel-test` 665/665 em 52 arquivos.

## T3.4 — E2E: simular em 1 hora, estado "aguardando" e faixa de parada (2026-10-13, `haiku`→feito em `sonnet` junto da fase)

**PENDENTE de execução.** `make panel-e2e` não roda neste ambiente (sem `make` e sem Chromium no WSL). O código foi escrito e passou `typecheck`, `lint` e `format`; o primeiro `make panel-e2e` com Docker e Chromium deve ser feito pelo responsável (ou numa máquina com `make`):

```bash
make panel-e2e
```

(equivale a `set -a; . envs/env.test; set +a; make up ENV=test && bun --env-file=envs/env.test run scripts/panel-e2e.ts`, que derruba a infra descartável com `--volumes` ao sair.)

- `e2e/flows/goals.flow.ts` (`declareGoalRankAndSimulate`): antes de clicar em "Simular esta meta", confere o seletor (radio "1 hora" marcado, a frase "A simulação olha o mercado a cada 1 hora. Primeira vela fecha às…" e o aviso do ranking diário); depois da criação, o cartão "Meta ativa" deve dizer "Aguardando a primeira vela, que fecha às HH:MM de hoje|amanhã." (o harness não tem worker, então a simulação nova não dá passo).
- `scripts/panel-e2e/control-server.ts`: rota `POST /stall` `{ action: 'stall' | 'resume' }`, no papel da varredura da API: grava (ou zera) `runs.stalled_since` (marca de ~20 min atrás) na simulação semeada e dá o `pg_notify('run_events', { runId, kind: 'warning' })` real; o painel relê a execução e mostra ou tira a faixa. Só a origem do dado é do teste.
- `e2e/flows/control.ts` (`sendStall`) e `e2e/flows/stall.flow.ts` (`watchTheStalledBannerComeAndGo`): Visão geral → "Rodando" sem faixa → `stall` → "Sua simulação está parada desde HH:MM", "Parada." e "nenhuma operação foi perdida" no cartão "Saldo da simulação" → `resume` → a faixa some, tudo sem recarregar. Ligado em `e2e/panel.e2e.ts` depois do teste de metas.
- Risco a observar na primeira execução: se o harness da API subir a varredura de parada (`stall-sweeper`, a cada 60 s), ela pode limpar a marca manual antes da asserção; a asserção acontece em segundos, então o esperado é passar. Se flakear, desligar a varredura no env do E2E.

Gates (WSL, `gates6.sh`): `typecheck`, `lint` e `format` limpos; `panel-test` 665/665 em 52 arquivos (o E2E não faz parte dele).

## T4.1 — Scripts `dev-up` e `dev-down` (2026-10-13, `sonnet`)

- `scripts/dev-up.sh` / `dev-up.ps1` e `dev-down.sh` / `dev-down.ps1`, com `scripts/dev-lib.sh` / `dev-lib.ps1` (funções comuns). Opções: `--dry-run` (`-DryRun`), `--env-file` (`-EnvFile`), `--state-dir` (`-StateDir`) e, no `dev-down`, `--infra` (`-Infra`). O env padrão é `envs/env.dev` (+ `.local`); os scripts exportam o env para os filhos e nunca imprimem valor de variável (só portas e a lista de moedas).
- Sequência do `dev-up`: `docker info`; `docker compose --env-file envs/env.dev -f compose.yaml up -d --wait`; espera a porta do Postgres do host por 60 s e, se não abrir, imprime o diagnóstico exato (`docker ps` com `PORTS` vazia = Docker não publicou a porta; reiniciar o Docker Desktop; link para o runbook §2) e sai 1 sem reiniciar o Docker nem recriar containers; migrations (`bun run --cwd packages/database db:migrate` no bash; `scripts/dev-migrate.ts <pasta>` no PowerShell, que passa `packages/database/drizzle` já resolvida e evita o `new URL().pathname` do pacote no Windows, sem mudar o código do pacote); API, worker e painel em segundo plano, logs em `.dev/logs/<nome>.log` (no Windows, erros em `<nome>.err.log`) e pids em `.dev/pids/<nome>.pid`.
- O pid é gravado com o instante de início do processo; só vale se os dois batem (pid reaproveitado depois de reinício não é nosso e nunca é morto). Segunda execução: pid vivo = "já está no ar"; sem pid mas porta ocupada por outro processo = erro claro e o serviço NÃO sobe (protege o app que já roda na máquina). O `dev-down` para o pid registrado e seus filhos (`pgrep -P` / `taskkill /T`), na ordem painel, worker, API; nunca por nome de processo; nunca `--volumes`; com `--infra` (ou "s" no prompt interativo) roda `compose down`.
- Moedas: `DEV_MARKET_SYMBOLS` (shell) > `MARKET_SYMBOLS` do `env.dev.local` > padrão `BTCUSDT,ETHUSDT,DOGEUSDT,PEPEUSDT,SOLUSDT,XRPUSDT,BNBUSDT,LINKUSDT,SHIBUSDT` (as moedas com filtro em `symbol-filters.constant.ts` mais as duas do motor); `VITE_MARKET_SYMBOLS` recebe o mesmo valor. O `env.dev` versionado segue com `BTCUSDT,ETHUSDT` (o `test/infrastructure.contract.test.ts` o confere), por isso o padrão mora nos scripts.
- `.dev/` no `.gitignore`; `.gitattributes` com `*.sh text eol=lf` (bash quebra com CRLF no checkout do Windows).
- Contrato `test/dev-scripts.contract.test.ts` (10 casos, na raiz): `.dev/` ignorado; a lista padrão é igual em bash e PowerShell e toda moeda tem filtro conhecido; nenhum dos seis arquivos cita `PASSWORD|SECRET|TOKEN|DATABASE_URL` nem despeja o ambiente (`printenv`, `env |`, `set -x`, `Get-ChildItem Env:`); o `dev-down` não usa `pkill`/`killall`/`Stop-Process -Name` nem `--volumes`.
- Teste isolado (o app do usuário NÃO foi tocado: portas e prefixo outros, estado fora do repositório): env temporário `PROJECT_NAME=ativadatest` com portas 38xxx num arquivo fora do repo (`--env-file`), `--state-dir` temporário. (1) `-DryRun` / `--dry-run` de `up` e `down` no PowerShell 7 e no WSL: imprimem tudo que fariam e não criam nada (exit 0). (2) No WSL, com `docker` e `bun` falsos no PATH (o `docker` real não existe no WSL) e um ouvinte TCP na porta do Postgres: 1ª execução sobe API, worker e painel, grava os 3 pids e imprime as URLs (exit 0); 2ª execução diz "já está no ar" para os três e não cria processo; `dev-down` para os três e remove os pids; sem ouvinte, o `dev-up` falha em 60 s com a mensagem de porta não publicada (exit 1). (3) `grep` da saída das duas execuções contra `POSTGRES_PASSWORD`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_SESSION_CLIENT_SECRET`, `KEYCLOAK_SERVICE_CLIENT_SECRET`, `TELEGRAM_BOT_TOKEN` e `TELEGRAM_WEBHOOK_SECRET` do env: nenhum vazamento. (4) `ParseFile` dos três `.ps1`: 0 erros.
- **PENDENTE (ponta a ponta com Docker real).** O WSL desta máquina não tem Docker e o Docker do Windows tem o app do usuário em execução, então o "do zero" com containers, migrations e processos reais não foi rodado. Comando exato, numa máquina com Docker (WSL com integração ligada, ou macOS/Linux), com um env próprio para não colidir (copie `envs/env.dev` para fora do repo trocando `PROJECT_NAME` e as portas):

  ```bash
  scripts/dev-up.sh --env-file /caminho/env.devtest --state-dir /tmp/ativada-dev   # 1ª vez: tudo no ar
  scripts/dev-up.sh --env-file /caminho/env.devtest --state-dir /tmp/ativada-dev   # 2ª: "já está no ar", nada duplicado
  scripts/dev-down.sh --infra --env-file /caminho/env.devtest --state-dir /tmp/ativada-dev
  ```

  No Windows: `pwsh scripts/dev-up.ps1 -EnvFile C:\caminho\env.devtest -StateDir C:\temp\ativada-dev` (e `dev-down.ps1 -Infra`).

Gates (WSL, `gates6.sh`): `typecheck`, `lint` e `format` limpos; `test test/dev-scripts.contract.test.ts test/infrastructure.contract.test.ts` 79/79.

## T4.2 — Runbook do ambiente local (2026-10-13, `sonnet`)

- `docs/runbook-dev-local.md` (pt-BR): §1 subir e descer (tabela PowerShell x bash, `--dry-run`/`--infra`, URLs 56100, 56101, 56180 e 56126); §2 "o banco não responde" (`docker ps` com `PORTS` vazia = Docker não publicou a porta, `Test-NetConnection 127.0.0.1 -Port 56432` / `nc -z 127.0.0.1 56432`, correção = reiniciar o Docker Desktop, por que acontece após suspensão, API e worker voltam sozinhos); §3 logs em `.dev/logs/`; §4 `/v1/health` (público, só ok/degraded) e `/v1/admin/health` (`database` e `worker`); §5 o que significam `database unavailable`, `database recovered` e a faixa "Sua simulação está parada desde HH:MM" (distinta de "Aguardando dados do mercado"); §6 moedas ativas e como mudá-las. Link em `docs/runbook-live72.md`.
- Conferência: nomes das mensagens de log contra `OUTAGE_LOG_MESSAGE` (`packages/database/src/connection/connection.constant.ts`), campos de saúde contra `health-view.ts`, texto da faixa contra o RF13 e a T3.3; `nc -z` no WSL e `Test-NetConnection` no PowerShell 7 numa porta fechada dão "fechada" / `False`; os scripts e o `--dry-run` citados foram rodados na T4.1. `docker ps` não existe no WSL desta máquina (conferido apenas pela sintaxe do filtro `--filter name=`).
- Diff revisado: só dois arquivos de docs mudam (runbook novo e 3 linhas no `runbook-live72.md`), sem código.

## T5.1 — Revisão de design (web.md §15) (2026-10-13, `sonnet`)

Ambiente: API e worker reiniciados com o código novo (o painel já servia o código novo pelo Vite); migrations 0022 e 0023 aplicadas no banco de dev com `scripts/dev-migrate.ts` (aditivas). `/v1/health` 200. Verificação por texto, CSS computado e geometria (navegador embutido, usuário de teste local); 375 px, tema do sistema (escuro) e `data-theme='light'`.

Achados, por item da tarefa:

1. **Seletor de vela** (`/metas/<id>`, é o mesmo cartão do ranking): `<fieldset>` com 3 radios visíveis (1 hora marcado) e frases em `aria-describedby`; "Mais opções" (`aria-expanded`) revela o 15 minutos, que só aparece com o aviso de taxas ("⚠ Com velas de 15 min…"); aviso do ranking diário sempre visível; "Você tem N de 5 simulações ao vivo" (2 de 5 e, depois de criar uma, 3 de 5); duplicata: "⚠ Você já tem esta simulação rodando." com link "Ver a simulação que já está rodando" (44 px de altura) e o botão segue habilitado (D4). Limite de 5 coberto pelo contrato `simulation-picker.contract.tsx` (não forçado no banco de dev). OK.
2. **"Aguardando a primeira vela, que fecha às 19:00 de hoje."**: visto no cartão "Meta ativa" da Visão geral logo depois de criar a simulação 1h pelo painel. Com o worker saudável o estado dura segundos: o worker grava `last_candle_time` da última vela já fechada no primeiro passo e a tela passa para "Última decisão às 18:00 de hoje · próxima às 19:00 de hoje" (ver pendência P1). No detalhe, o estado em si não pôde ser mantido na tela (o worker devolve o valor), então fica provado pelo contrato `live-run-status.contract.tsx` (15 casos).
3. **Faixa de parada**: gravei `runs.stalled_since` (20 min atrás) numa simulação de dev criada para o teste e devolvi `null` ao fim; a faixa aparece na Visão geral (Saldo da simulação e Meta ativa) e no detalhe: "⚠ **Parada.** Sua simulação está parada desde 18:18. O sistema está tentando retomar; nenhuma operação foi perdida. Horários em GMT−3.", `role="status"`, borda de 6 px à esquerda, `--warn` sobre `--warn-soft`. A varredura da API (60 s) apaga a marca de uma simulação que não está parada: é o esperado. As duas simulações diárias (PEPE, LINK) não foram tocadas.
4. **375 px**: `scrollWidth` 375 = `innerWidth` nos dois temas, em `/`, `/metas/<id>` (com "Mais opções" aberto e o 15 min marcado) e no detalhe; nenhum elemento passa da borda direita. Contraste medido (razão WCAG, mesma conta de `test/contrast.contract.ts`):

   | Par | Claro | Escuro | Exigido |
   |---|---|---|---|
   | `warn` sobre `warn-soft` (texto do aviso e da faixa) | 6,30 | 8,84 | 4,5 |
   | `ink` sobre `warn-soft` | já coberto | já coberto | 4,5 |
   | `ink-2` sobre `warn-soft` (legenda "Horários em GMT−3" depois da correção) | 6,98 | 6,81 | 4,5 (novo no contrato) |
   | `ink-3` sobre `warn-soft` (a cor antiga da legenda) | 4,72 | 4,81 | 4,5 (passava, sem folga) |
   | `accent` sobre `warn-soft` (link da duplicata dentro do aviso) | 7,49 | 6,14 | 4,5 (novo no contrato) |
   | `ink`/`ink-2`/`accent` sobre `accent-soft` (aviso do ranking) | 14,55 / 6,40 / 6,87 | 11,84 / 6,52 / 5,89 | 4,5 (já coberto) |
   | `warn` sobre `surface` (borda da faixa, elemento gráfico) | 7,13 | 10,48 | 3 (novo no contrato) |
   | `warn` sobre `bg` (idem) | 6,47 | 11,56 | 3 (novo no contrato) |

   `ink-3` sobre `accent-soft` dá 4,33 no claro (reprova), mas nenhum texto usa essa combinação; fica fora do contrato de propósito.
5. **Foco e Tab** (teclas reais): a ordem é "Como ler este ranking" → "Mais opções" → radio marcado (o grupo é uma parada só; setas trocam) → "Só o par da meta" → "Ver o plano" → "Simular esta meta"; todos com contorno de 2 px `#8ea3ff` (`:focus-visible`).
6. **Vizinhos**: o seletor usa raio 12 px, borda de 1 px `--line` e padding 12×14, igual a `.explainer` e `.situation`; avisos com raio 6 px e padding 10×12, igual à faixa de parada; alvos de 44 px. Sem divergência de tamanho de fonte (16 px de corpo, 13,5 px para legendas).
7. **Linguagem**: frases do RF02/RF03/RF13 conferem com a spec; "vela" é o termo da spec. Resíduo antigo fora desta spec: o aviso "O que teria acontecido com candles que já aconteceram" ainda diz "candles".

Console e rede: depois de recarregar, nenhum recurso com status ≥ 400 (250 recursos); os erros acumulados na aba (HMR do Vite durante as fases e 401/502 enquanto a API antiga reiniciava) são anteriores à recarga.

Corrigido: `.stalled small` (legenda "Horários em GMT−3." da faixa) usava o cinza mais fraco (`--ink-3`, 4,7:1); passou a `--ink-2` (≥ 6,8:1). Contrato de contraste ganhou 4 pares (`ink-2`/`warn-soft`, `accent`/`warn-soft` e, como gráficos, `warn`/`surface` e `warn`/`bg`).

Pendências (não corrigidas, fora de CSS/texto):
- **P1.** No primeiro passo o worker marca a última vela JÁ fechada como processada; "Aguardando a primeira vela" some em segundos e "Última decisão" cita uma vela anterior à criação. Decidir se a tela deve esperar o primeiro fechamento POSTERIOR à criação (critério de aceite 1 da spec) ou se o texto "Última decisão" deve dizer "Vela de HH:MM já analisada".
- **P2.** Na faixa de parada o selo "Rodando" aparece logo acima de "Parada." (e a Visão geral mostra a mesma faixa no cartão de saldo e no de meta ativa quando é a mesma simulação). Não contradiz o texto, mas é redundante; avaliar trocar o selo por "Parada" no `BalanceCard`.
- **P3.** Limite de 5 simulações e fim do estado "Aguardando" no detalhe só provados por contrato (não reproduzidos no app).
- **P4.** Por permissão, não consegui cancelar a simulação 1h de teste que criei (LINK/USDT, Rompimento Donchian, id `01a13733-0a5d-717d-ba48-0c32767df00e`): ela continua `running`; o responsável pode cancelar em `/backtests/<id>`.

Captura final (duas imagens, Playwright com o Edge do Windows, faixa de parada ativa): `specs/006-simulacao-ao-vivo-robusta/evidence/simulacao-ao-vivo-375-escuro.png` (375 px, tema escuro) e `simulacao-ao-vivo-1280-claro.png` (1280 px, tema claro); `scrollWidth` 375 e 1280.
