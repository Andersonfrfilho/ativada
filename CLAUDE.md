# CLAUDE.md

Contexto operacional do **crypto-paper-trader**. Produto e regras em `README.md`,
`docs/spec/constitution.md` e nas specs em `specs/NNN-nome/`.

## Estado

Só documentação. Nenhum código ainda. Próximo passo: `specs/001-simulador-e-sinais/tasks.md`, Fase 0.

## Stack decidida

Monorepo Bun (workspaces) em TypeScript estrito:

```
apps/api-crypto/        Bun.serve — REST + WebSocket para o painel; backtest em worker_thread
apps/worker-crypto/     consome o stream de candles da Binance, avalia estratégias, simula ordens
apps/cron-crypto/       backfill de histórico e índice Fear & Greed
apps/frontend-crypto/   React 19 + Vite (PWA)
packages/database/      Drizzle + migrations (cada uma com .rollback.sql) + cliente Bun.sql
packages/environment/   validação Zod do env; `process.env` só em environment.ts (lint)
packages/identity-admin/ cliente da Admin API do Keycloak (API e cron o compartilham)
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
