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

## T1.1 — `/trades` aditivo (2026-10-13, `sonnet`)

Entrega: `GET /v1/runs/:runId/trades` ganha a query `from`, `to` (ms UTC, `[from, to)`, sem recorte) e `status=open|closed`
e cada item ganha `entryNotional`, `exitNotional`, `paid`, `received`, `fees` e `netProfitRate` (ADR 0002, O3 a O5).
Nenhum campo existente muda de nome ou tipo; cursor, `limit` e ordem iguais aos de antes. Os preenchimentos da página
vêm numa consulta só (`listFillsOfPositions`: `run_id` + `position_key IN (...)`, dono no tipo). Sem migration.

| Peça | Onde |
|---|---|
| Filtro de faixa e status | `packages/database/src/run-results/run-position-list.ts` (`listPositions`, movido de `run-result-list.ts` por causa do limite de 200 linhas) |
| Preenchimentos da página | `packages/database/src/run-results/run-fill-list.ts` |
| Conta pura de pago, recebido, taxas e % | `apps/api-ativada/src/runs/trades/trade-amounts.ts` |
| Rota, esquema, caso de uso, OpenAPI | `apps/api-ativada/src/runs/trades/run-trades.{route,schema,use-case,docs}.ts`, `run-range-query.ts` |
| Repositório em memória | `test/fixtures/api-routes/in-memory-runs.fixture.ts` (`listPositions` filtra, `fillLookups` conta as consultas de preenchimento) |
| Contrato | `test/api-run-trades.contract.test.ts` (16 casos) |

Provas do contrato novo: valores conferidos à mão contra `fills` (300,123456789 sobe a 300,12345679; 310,987654321 desce
a 310,98765432; pago 300,57345679, recebido 310,51765432, `netProfitRate` 0,03308408); piso para −∞ na 9ª casa
(−0,0033333333 vira −0,00333334); `recebido − pago = netProfit` em decimal exato em 300 posições sorteadas com oráculo
`bigint` que não importa o código da API; faixa (só a compra, só a venda, atravessando fica fora, `from` incluído, `to`
excluído, só `from`, só `to`); `status`; páginas concatenadas com faixa e cursor; uma consulta de preenchimentos por
página; 400 com todos os erros e sem eco; `to <= from`; 404 igual para alheia, inexistente, malformada e apagada.

Desvio do ADR (O4): posição fechada sem preenchimento de venda NÃO vira `500`; os campos que dependem do preenchimento
que falta (`exitNotional`, `received`, `netProfitRate`) saem omitidos. Motivo: o contrato antigo
(`test/api-run-series.contract.test.ts`) semeia posições fechadas sem venda e precisa continuar verde sem mudança. No
banco real os dois são gravados na mesma transação, então o caso não ocorre.

Gates (WSL, espelho `ativada-spec5`): `tsc --noEmit` limpo; `eslint .` limpo; `prettier --check .` limpo; 287 testes
verdes em 16 arquivos (`api-run-trades`, `api-runs`, `api-run-series`, `api-run-series-order`, `api-run-export`,
`api-run-log-export`, `api-run-delete`, `api-run-admission`, `api-run-queue-dispatcher`, `api-run-symbol-filters`,
`api-openapi`, `api-docs-page`, `ownership-registry`, `strategy-engine-boundary`, `code-size-limits`,
`app-import-boundary`).

Pendente: o filtro de faixa e `listFillsOfPositions` contra Postgres real entram na verificação do `make database-test`
da T1.2 (Docker Desktop não sobe nesta máquina agora; ver evidência da T1.2).
