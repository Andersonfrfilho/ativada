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
