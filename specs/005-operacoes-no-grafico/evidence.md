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

## T1.2 — Repositório do gráfico (2026-10-13, `sonnet`)

Entrega (todas as leituras no escopo do dono: `isOwnedRun` antes de ler, `undefined` para execução alheia; sem migration):

| Função (`RunResultRepository`) | Onde | O que faz |
|---|---|---|
| `listPriceColumns(scope, runId, params)` | `packages/database/src/run-results/run-price-columns.ts` | SQL do ADR O7: balde `((open_time - from) * columns) / (to - from)` em `bigint` parametrizado, `exchange` no WHERE, primeiro (abertura), último (fechamento), mínima e máxima por coluna, decimais com `trim_scale` (grafia canônica) |
| `listFillMarkers(scope, runId, {range, limit})` | `run-fill-markers.ts` | preenchimentos da faixa em ordem `(candle_time, order_key)`, com o `net_profit` da posição só na venda |
| `countFillsInRange(scope, runId, range)` | `run-fill-markers.ts` | `count(*) FILTER` de compras e vendas da faixa (dá o `totals` e decide marcadores ou agrupamentos) |
| `listFillClusters(scope, runId, {range, columns})` | `run-fill-markers.ts` | o MESMO balde sobre `candle_time`, só os baldes com preenchimento |

Oráculo puro (sem importar SQL nem produção, `bigint`): `test/fixtures/run-chart/chart-oracle.fixture.ts`, com contas à mão em
`test/run-chart-oracle.contract.test.ts` (7 casos: balde com dízima, `to` excluído, coluna sem vela, grafia canônica).
Os repositórios em memória do harness (`in-memory-runs.fixture.ts`) usam o oráculo e contam as chamadas (`chartCalls`).

Verificação do SQL contra um Postgres de verdade, nesta máquina: o Docker Desktop não sobe agora ("Docker Desktop is unable to
start"), então `make database-test` NÃO foi executado. No lugar, um script descartável (fora do repositório, em PGlite 0.5.9, o
Postgres embutido) rodou as funções reais do repositório, via Drizzle, contra o oráculo:

- preço: 3 séries sintéticas (dízima no balde, uma vela por coluna, faixa menor que as colunas) e 2 conjuntos reais
  (`btcusdt-1h-500`, `ethusdt-1d-400`), 6 faixas/colunas cada (100, 800, 2.000, 137; faixa que começa 1 ms depois; metade da
  série), 30 comparações: todas iguais;
- agrupamento de preenchimentos (100 e 800 colunas), contagem, marcadores (ordem, limite, resultado só na venda), faixa de
  posições e `status`, `listFillsOfPositions`: todos iguais, 0 falhas. O script achou um defeito real na primeira rodada:
  `ORDER BY bucket` com o alias `::text` ordenava por texto (10 antes de 2); corrigido para `ORDER BY bucketed.bucket`.

A mesma verificação ficou como checagens do `make database-test` (`packages/database/test-support/run-chart-checks.ts`:
`checkPriceColumns`, `checkFillMarkers`, `checkTradeFilters`, registradas em `database-test.ts`), com dono alheio recebendo
`undefined` em todas as leituras. **PENDENTE:** rodar `make database-test` num Postgres descartável assim que o Docker Desktop
estiver de pé.

Gates (WSL, espelho `ativada-spec5`): `tsc --noEmit` limpo; `eslint .` limpo; `prettier --check .` limpo; 294 testes verdes
em 17 arquivos (os da T1.1 mais `run-chart-oracle`).

## T1.3 — `GET /v1/runs/:runId/chart` (2026-10-13, `sonnet`)

Entrega: rota nova, só do dono (`access: USER` e `documentation`), query estrita validada por Zod (`from`, `to`, `columns`),
sem migration. `CHART_MARKER_LIMIT = 500` em `runs.constant.ts`.

| Peça | Onde |
|---|---|
| Rota, esquema, OpenAPI | `apps/api-ativada/src/runs/chart/run-chart.{route,schema,docs}.ts` (`columns` 100 a 2.000, padrão 800, texto de dígitos; `to <= from` é `to: must_be_after_from`) |
| Caso de uso | `run-chart.use-case.ts` (contagem + colunas em paralelo; ≤ 500 lê marcadores, 501+ lê agrupamentos; nunca os dois) |
| Faixa da execução (ADR O1) | `run-chart-range.ts` (`resolveRunRange`: backtest concluído = `[period_start, period_end)`; senão, e no ao vivo, até `last_candle_time + duração`; walk-forward = `[min(test_start), max(test_end))`) e `clipRange` (recorta; sem interseção = `400 from: outside_run`) |
| Marcadores e agrupamentos | `chart-views.ts` (`amount` = pago na compra e recebido na venda; `netProfitRate` pelo piso a 8 casas, com pago = recebido − resultado; limites do balde `from + ceil(b·W/C)`) |
| Arredondamento compartilhado | `apps/api-ativada/src/runs/money-rounding.ts` (usado também por `trades/trade-amounts.ts`) |
| Ligação | `routes/create-api-routes.ts`, `create-domain-route-dependencies.ts`; harness `runs-harness.fixture.ts` e `api-app.fixture.ts` (módulos carregáveis pelos mutantes) |
| Contrato | `test/api-run-chart.contract.test.ts` (21 casos) |

Provas: colunas conferidas à mão (cada vela de 100+i abre em 100+i, fecha em 100,5+i, mínima 98+i, máxima 108+i: coluna de
4 velas = primeiro 100, último 103,5, mínima 98, máxima 111); nunca mais colunas que o pedido; recorte da faixa e `to`
excluído; 404 igual para alheia, inexistente, malformada e apagada; 400 com todos os erros e sem eco (`columns` 99, 2001,
`abc`, `1.5`, `-100`, vazio; `to <= from`); exatamente 500 preenchimentos dão `markers` (e o repositório de agrupamento
não é chamado), 501 dão `clusters` (e o de marcadores não é chamado), soma dos agrupamentos = `totals`, limites pela fórmula
com largura que não divide (137 colunas sobre 10 h); `amount`, `netProfit` e `netProfitRate` do marcador iguais aos do
`/trades`; walk-forward só nas janelas de teste (colunas começam em `test_start` e terminam antes de `test_end`); ao vivo
para na última vela processada (a vela gravada depois dela só aparece quando `last_candle_time` avança); execução na fila e
ao vivo sem vela dão listas vazias; resposta valida no esquema documentado.

Auditoria §15: o único `Promise.all` novo junta a contagem e as colunas de preço, ambas do caminho crítico (falhar uma já
invalida a resposta), então não há consulta de refinamento que possa derrubar o fluxo.

Gates (WSL, espelho `ativada-spec5`): `tsc --noEmit` limpo; `eslint .` limpo; `prettier --check .` limpo; 391 testes
verdes em 19 arquivos (os da T1.1 e T1.2, `api-run-chart` e o `api-routes-mutants`, 134 s).
