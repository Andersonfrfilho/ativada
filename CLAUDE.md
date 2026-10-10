# CLAUDE.md

Contexto operacional do **CryptoAdA**. Produto e regras em `README.md`,
`docs/spec/constitution.md` e nas specs em `specs/NNN-nome/`.

## Estado

Só documentação. Nenhum código ainda. Próximo passo: `specs/001-simulador-e-sinais/tasks.md`, Fase 0.

## Stack decidida

Monorepo Bun (workspaces) em TypeScript estrito:

```
apps/api-cryptoada/        Bun.serve — REST + WebSocket para o painel; backtest em worker_thread
apps/worker-cryptoada/     consome o stream de klines da Binance (grava velas fechadas, recupera lacunas), avalia estratégias, simula ordens
apps/cron-cryptoada/       one-shot agendado: exclusão de contas (Keycloak + dados, ADR 0001 §h), backfill de histórico e índice Fear & Greed
apps/frontend-cryptoada/   React 19 + Vite (PWA)
packages/database/      Drizzle + migrations (cada uma com .rollback.sql) + cliente Bun.sql
packages/environment/   validação Zod do env; `process.env` só em environment.ts (lint)
packages/identity-admin/ cliente da Admin API do Keycloak (API e cron o compartilham)
packages/market-data/    cliente REST de klines e stream WebSocket de klines da Binance (Zod, peso, retry, reconexão; cron e worker o compartilham)
packages/strategy-engine/  indicadores, placar de votos, risco, corretora simulada, métricas —
                           o MESMO código roda no backtest e no ao vivo
```

Postgres + Drizzle. Keycloak 26.8.0 (OIDC) para login, realm em `realm/`; Mailpit v1.31.4 como SMTP de dev.
Docker Compose único na raiz. `make up` sobe Postgres, Keycloak e Mailpit; `make identity-test` verifica
realm, permissões e reuso de refresh (resultados no ADR 0001 §l). Portas dev: Postgres 56432, Keycloak
56180, Mailpit SMTP 56125 / UI 56126; teste: 56433, 56181, 56127 / 56128.
`Makefile` com `PROJECT_NAME`. Env em `envs/`.

**Multiusuário.** Cada usuário tem login, estratégias, simulações, alertas e (na spec 002) chave de
corretora próprios. Candles e sentimento são compartilhados. Preview da tela em
`docs/preview/dashboard.html`.

## Infraestrutura local e testes

- **O import do realm não altera um realm existente.** Mudou `realm/*.json`? Aplique com
  `make down DOWN_FLAGS=--volumes` e `make up` (apaga os dados do Keycloak daquele ambiente). `make up`
  avisa quando o JSON é mais novo que o volume.
- Alvos `*-test` (`migration-test`, `database-test`, `identity-test`, `session-test`, `admin-test`,
  `lgpd-test`, `backfill-test`, `stream-test`) sobem uma infra descartável em `ENV=test` e a derrubam com `--volumes` em `EXIT`, `INT` e
  `TERM`: Ctrl-C não deixa container vivo. Dois deles ao mesmo tempo disputam o mesmo projeto; rode um por vez.
- `make check` roda `bun test` com `env -i`: teste que precisa de variável a declara; o `export` do `env.dev`
  não chega a ele.
- Código que só os testes de integração usam fica em `packages/<pacote>/test-support/` (pode imprimir); `src`
  não tem `console`.
- **Admin só pelo grupo `admins`.** O grupo carrega o papel `admin` e está fora do alcance da service account
  (ADR 0001 §q). Atribuir o papel direto, sem o grupo, deixa a conta sem essa proteção.
- O cron (`apps/cron-cryptoada`) roda quatro tarefas em sequência e sai `1` se qualquer uma falhar:
  `purge-deleted-accounts`, `reconcile-blocked-accounts`, `expire-audit-events`, `backfill-candles`.
  `CRON_TASKS` (lista separada por vírgula) roda só as nomeadas. O backfill percorre cada par
  (`MARKET_SYMBOLS` x `MARKET_TIMEFRAMES`, padrão BTCUSDT/ETHUSDT em 15m/1h/4h/1d) em sequência, acha as
  lacunas em SQL (`findMissingOpenTimes`), baixa só o que falta e grava cada página ao chegar; `BACKFILL_YEARS`
  (1 a 5, padrão 2) e `BINANCE_BASE_URL` (padrão `https://data-api.binance.vision`, https em produção).
  Lacuna que a Binance não tem sai no log como `unfillable`, sem laço de retry. Um 418 (ban de IP) aborta a
  execução do backfill (saída 1, com o fim do ban no log) em vez de passar ao próximo par. `make backfill-test` prova
  isso com o cron real, Postgres descartável e uma Binance falsa local.
- O worker (`apps/worker-cryptoada`) roda de verdade: abre o banco, consome o stream combinado de klines
  (`createKlineStream`, `packages/market-data`) e grava só velas fechadas (`x === true`) com `upsertCandles`
  (idempotente, não atualiza: vela fechada é imutável). A verificação de lacunas cobre uma JANELA DE RETROCESSO,
  `[agora - STREAM_GAP_LOOKBACK_HOURS, última vela fechada)`, não "a partir da última gravada": roda em CADA
  (re)conexão e a cada `STREAM_GAP_CHECK_MINUTES` (SQL barato; só vai ao REST se houver lacuna). Par sem nenhum
  candle fica para o backfill do cron; buraco que a Binance não tem e que passou de 24 h não é pedido de novo.
  Escrita que falha repete 3 vezes com backoff e, se persistir, dispara a verificação por janela. Erro de
  gravação é logado (id opaco) e não derruba o worker; 418 faz dormir o `Retry-After` (teto 24 h) em fatias e a
  recuperação não segue pelos pares seguintes; SIGTERM/SIGINT cancelam (AbortSignal) a recuperação em curso e
  encerram de forma graciosa (saída 0). A hora vem do servidor (`createServerClock`, `GET /api/v3/time`; falha
  cai no relógio local com aviso); o repositório só rejeita vela com `closeTime` além de agora + 5 s. Variáveis:
  `MARKET_EXCHANGE` (só `binance`), `MARKET_SYMBOLS`, `MARKET_TIMEFRAMES`, `BINANCE_BASE_URL` (REST),
  `BINANCE_STREAM_URL` (padrão `wss://data-stream.binance.vision`, `wss://` em produção), `STREAM_STALE_SECONDS`
  (5 a 600, padrão 60: sem mensagem por esse tempo, reconecta), `STREAM_GAP_LOOKBACK_HOURS` (1 a 720, padrão 168)
  e `STREAM_GAP_CHECK_MINUTES` (1 a 1440, padrão 15). `make stream-test` prova isso com o worker real em subprocesso, Postgres
  descartável e uma Binance falsa local (REST + WebSocket em `packages/market-data/test-support/`).

## Regras que não se negociam

- **Nenhuma ordem real sem uma pessoa ligar o modo `live`.** A I.A. nunca arma o modo real, nunca
  manuseia chave de API real e nunca executa ordem com dinheiro de verdade.
- Dinheiro e quantidade de moeda são decimais (`numeric` no banco, `decimal.js` no código). Float
  só dentro do cálculo de indicador.
- **Sem lookahead**: decisão no fechamento do candle `t`, execução na abertura de `t+1`. Teste de
  contrato prende isso.
- Backtest e simulação ao vivo usam o mesmo `packages/strategy-engine`. Lógica duplicada entre os
  dois é defeito.
- `userId` vem só do token. Repositório de recurso de usuário exige `userId` no tipo; recurso de
  outro usuário responde `404`. Toda rota nova nasce com contrato negativo entre usuários.
- Chave de corretora do usuário é só escrita, cifrada fora do alcance da chave do banco, e cada
  usuário arma a própria execução.
- Toda decisão (sinal, motivo, ordem, preenchimento) fica registrada.
- Chave, token e segredo nunca em log, commit ou terminal.
- **Tamanho do código é imposto pelo lint** em `apps/*/src` e `packages/*/src` (testes, `scripts/` e `test-support/`
  ficam de fora): função com no máximo 40 linhas, arquivo com no máximo 200 (ambos sem linhas em branco e comentários) e
  3 parâmetros por função (acima disso, um objeto tipado). É erro, não aviso. A única forma de burlar é uma exceção
  nomeada: um override por arquivo em `eslint.config.js`, com arquivo, função e motivo em um comentário de uma linha.
  `eslint-disable` não funciona (`noInlineConfig`). Hoje há zero exceções. `test/code-size-limits.contract.test.ts` prova
  cada regra por sonda e por mutação do limite.
- Uma task por vez, tirada do `tasks.md`. Task só fecha com evidência em `evidence.md`.
