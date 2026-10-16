# Evidência — Spec 013

## Autorização do usuário (2026-10-16)

O usuário (Anderson), sobre evitar operações de lucro baixo por causa das taxas da exchange, pediu: **"certo, add isso nas
regras para evitarmos transações nesses valores"**. Isso vale como resposta às decisões do `spec.md` §9 com as opções A e
como a **autorização registrada** que o `tasks.md` exige:

| Decisão | Resposta | O que libera |
|---|---|---|
| D1 | A — `RunParameters.minimumNetTargetRate` opcional + checagem no motor (`placeEntry`) | **mudar o motor** (Fase 1) |
| D2 | A — 0,6% pré-preenchido no painel, desligável (só depois da T0.2 registrada) | T3.1 |
| D3 | A — recusa registrada com motivo próprio (`below_minimum_profit`) | **migration ADITIVA** do `CHECK` `orders_reason_check` (só escrita e aplicada na Fase 2, T2.1) |
| D4 | A — a trava `move_cost` do analista fica como está | nada no analista antes da T4.2 |
| D5 | A — "ganho possível" = o alvo | — |
| D6 | A — prazos, metas e "O que falta para comprar" fora | — |

## T0.1 🧠 — contrato `minimum-profit-1` (2026-10-16, opus)

- **ADR 0002, seção "Lucro mínimo por operação (spec 013)"** (MP1 a MP14 e a validação): campo com `exactOptional` (conferido
  no `zod@4.6.5` que `.optional()` deixa a chave com `undefined` e o `canonicalJson` lança), fórmula sem divisão
  `m × ATR ≥ (mínimo + custo) × fechamento` com produtos num clone de 64 algarismos (a 40, a armadilha de precisão passaria
  errado: medido no `decimal.js@10.6.0`), ordem das checagens em `placeEntry`, `computeRoundTripCostRate` como lugar único do
  custo, hashes (ausente = `runHash` idêntico), **sem `ENGINE_VERSION` novo** (conferido: versão nova falharia toda simulação
  em andamento por `ENGINE_VERSION_MISMATCH`), recusa em `orders`, `live-status` continua em 5 consultas (um `EXISTS` dentro de
  `listDecisionRows`), frase fechada com X para baixo e Y, Z para cima, avisos, composição com o analista, deploy e reversão.
- **Desvios do plano registrados no ADR:** (1) `outcome` NÃO ganha `waited_minimum_profit` (RF07/plan D5): o painel publicado
  valida `outcome` com enum fechado e quebraria no deploy e na reversão; vai o campo aditivo `waitReason: 'minimum_profit' |
  null`. (2) `isEntryProfitable` recebe as entradas, não o `edge` em texto. (3) A migration da T2.1 também cria o índice
  parcial `orders_minimum_profit_idx`. (4) O oráculo mora em `test/fixtures/minimum-profit/` (a tarefa pediu esse caminho; o
  plan D7 citava `test/fixtures/strategy-engine/minimum-profit/`). (5) Frase curta quando o mínimo é exatamente 0.
- **Validação:** `architect` (opus) — APROVADO COM AJUSTES, sem bloqueio; os 6 ajustes entraram no ADR e no teste.
- **Oráculo independente** (`test/fixtures/minimum-profit/minimum-profit-oracle.ts`, `bigint`, sem `src` nem `decimal.js`) e
  `test/minimum-profit-oracle.contract.test.ts`: 8 casos à mão, a frase sem números, 3 conjuntos reais e 3.000 sorteios
  (cruzar sem divisão = líquido a 12 casas; mínimo maior nunca libera; frase sem contradição). Entradas reais gravadas por
  `scripts/record-minimum-profit-oracle-inputs.ts` em `test/fixtures/minimum-profit/real-buy-candles.json`.
- **Resultado exato nos conjuntos reais** (velas em que o Placar clássico pediu compra; barradas por mínimo 0 / 0,3% / 0,6% /
  1,0%): BTCUSDT 15 min × 3.300 — 879 pedidas, **131 / 372 / 693 / 843**; BTCUSDT 1 h × 500 — 113, **0 / 0 / 0 / 10**; ETHUSDT
  1 d × 400 — 60, **0 / 0 / 0 / 0**. Iguais à estimativa do `spec.md` §7 (que dividia e cortava a 6 casas). Novo: com mínimo 0,
  15% das compras de 15 min tinham o alvo abaixo do custo.
- **Nada mudou** em `packages/strategy-engine`, `packages/run-recording`, banco, migrations nem apps.
- **Gates** (espelho WSL `~/gates/ativada-spec13`): ver o commit da T0.1.
