# Evidência — Spec 005

## T0.1 🧠 — Contrato das operações no gráfico (2026-10-13, `opus`)

Entrega: seção "Operações no gráfico (spec 005)" no fim de `docs/adr/0002-contrato-do-motor-de-estrategias.md`, com
as decisões O1 a O13 e os contratos de teste esperados por rota. Só documentação: nenhum código de produção, teste ou
migration.

Conferido no código (lido, não suposto):

| Ponto | Onde | O que se achou |
|---|---|---|
| `/trades`, `/fills`, `/equity` | `apps/api-ativada/src/runs/run-series.routes.ts`, `run-series.use-cases.ts`, `shared/pagination/read-page.ts` | Query estrita `limit`/`cursor`; `/trades` devolve `PositionInput` inteiro; `closedCandleTime`, `quantity`, `entryFee` e `exitFee` já existem |
| Ordem do `/trades` | `packages/database/src/run-results/run-result-list.ts` (`listPositions`) | `(opened_candle_time, engine_key)` crescente; o plan supunha "aberta primeiro, decrescente" (corrigido em O3) |
| `positions`, `fills`, `candles` | `packages/database/src/schema/*.schema.ts` | Índices listados no ADR; `candles` só com a PK `(exchange, symbol, timeframe, open_time)`; `runs` sem corretora |
| `exitReason` | `packages/strategy-engine/src/engine-vocabulary.constant.ts`, `packages/database/src/run-results/run-result.constant.ts` | `stop`, `target`, `signal`, `command`, `gap`; `end`/`stopped` do plan D7 não existem |
| Notional e caixa | `packages/strategy-engine/src/wallet/exit-fill.ts`, `entry-fill.ts`, `money.ts` | Notional do `fill` sem arredondar; débito `ceil8(notional) + taxa`, crédito `floor8(notional) − taxa` (base de O5) |
| Walk-forward | `apps/api-ativada/src/walk-forward/evaluate-window.ts`, schema `walk_forward_windows` | Só as janelas de teste são gravadas; `test_end` exclusivo (base de O1) |
| Painel | `apps/frontend-ativada/src/runs/run.validation.ts`, `runs.query.ts`, `TradesCard.component.tsx`, `run.constant.ts` | `tradeSchema` é `z.object` (ignora campo novo), só manda `limit`/`cursor`: a mudança aditiva não quebra |

Migration: nenhuma (O8). `[NEEDS CLARIFICATION]` aberto: nenhum. Um índice `fills (run_id, candle_time)` só entra se a
medição da T1.5 passar de 300 ms p95, e aí volta ao responsável antes de ser criado.

Gates: `bun x prettier --check` nos dois arquivos tocados. Testes não se aplicam (só documentação).
