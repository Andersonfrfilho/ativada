# CLAUDE.md

Contexto operacional do **CryptoAdA**. Produto e regras em `README.md`,
`docs/spec/constitution.md` e nas specs em `specs/NNN-nome/`.

## Estado

Só documentação. Nenhum código ainda. Próximo passo: `specs/001-simulador-e-sinais/tasks.md`, Fase 0.

## Stack decidida

Monorepo Bun (workspaces) em TypeScript estrito:

```
apps/api-cryptoada/        Bun.serve — REST + WebSocket para o painel; backtest em worker_thread
apps/worker-cryptoada/     consome o stream de candles da Binance, avalia estratégias, simula ordens
apps/cron-cryptoada/       one-shot agendado: exclusão de contas (Keycloak + dados, ADR 0001 §h), backfill de histórico e índice Fear & Greed
apps/frontend-cryptoada/   React 19 + Vite (PWA)
packages/database/      Drizzle + migrations (cada uma com .rollback.sql) + cliente Bun.sql
packages/environment/   validação Zod do env; `process.env` só em environment.ts (lint)
packages/identity-admin/ cliente da Admin API do Keycloak (API e cron o compartilham)
packages/market-data/    cliente REST de klines da Binance (Zod, peso, retry; cron e worker o compartilham)
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
  `lgpd-test`, `backfill-test`) sobem uma infra descartável em `ENV=test` e a derrubam com `--volumes` em `EXIT`, `INT` e
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
  Lacuna que a Binance não tem sai no log como `unfillable`, sem laço de retry. `make backfill-test` prova
  isso com o cron real, Postgres descartável e uma Binance falsa local.

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
- Uma task por vez, tirada do `tasks.md`. Task só fecha com evidência em `evidence.md`.
