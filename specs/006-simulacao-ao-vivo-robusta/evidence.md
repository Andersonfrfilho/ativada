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
