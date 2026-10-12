# Plano — Spec 005

## D1. Onde mora cada peça

| Peça | Lugar | Por quê |
|---|---|---|
| Campos novos de operação | `apps/api-ativada/src/runs/` — o caso de uso de `GET /v1/runs/:runId/trades` passa a juntar `positions` com os dois `fills` da posição (`position_key`) | Mudança aditiva (spec D1); o repositório já filtra por dono |
| Leitura do gráfico | `packages/database/src/runs/` (repositório de resultado): `listPriceColumns` e `listFillMarkers`, ambos com `userId` no tipo | Agrupar no Postgres; o repositório de execução já é o dono do escopo |
| Rota do gráfico | `apps/api-ativada/src/runs/chart/` — `run-chart.route.ts`, `run-chart.use-case.ts`, `run-chart.schema.ts`, `run-chart.docs.ts` | Padrão das rotas da T3.4 |
| Resumo | `apps/api-ativada/src/runs/trade-summary/` — rota, caso de uso, frase (`trade-summary-message.ts`) | O servidor escreve a frase (como `horizon-messages.ts`) |
| Painel: dados | `apps/frontend-ativada/src/runs/trades/` — `trade-chart.query.ts`, `trade-chart.validation.ts`, `trade-summary.query.ts`, `trade-summary.validation.ts`; o `run.validation.ts` ganha os campos novos de `Trade` | Zod espelhado (CLAUDE.md, painel) |
| Painel: escala | `src/runs/trades/price-chart.ts` (puro: faixa → pixels, balde → caminho SVG, marcador → posição, agrupamento) | Testável sem DOM, como `plan-chart.ts` |
| Painel: gráfico | `PriceChart.component.tsx`, `TradeMarker.component.tsx`, `MarkerCluster.component.tsx`, `MarkerTooltip.component.tsx`, `ChartRangeControls.component.tsx`, `chart-description.ts` (texto para leitor de tela) | Um conceito por arquivo; cada um ≤ 200 linhas |
| Painel: tabela | `TradesTable.component.tsx` (substitui o miolo do `TradesCard`), `virtual-rows.ts` (puro), `useVirtualRows.hook.ts`, `trade-row-text.ts` | Janela virtual testável |
| Painel: estado ligado | `useTradeSelection.hook.ts` (faixa e operação na URL via `useSearchParams`) | Um lugar só para seleção e zoom (web.md §4) |
| Painel: fuso | `src/format/zoned-time.ts` (`formatInZone`, `zoneLabel`) + `useUserTimeZone.hook.ts` (lê a conta) | `format.ts` hoje fixa UTC |
| Glossário | `src/glossary/glossary.constant.ts` (termo → frase), `Term.component.tsx`, `Term.module.css` | Uma frase por termo em todo o painel |
| Ao vivo | O mesmo cartão no detalhe da execução `live_paper`; link na "Visão geral" | Sem tela nova |

## D2. Contrato das rotas

**`GET /v1/runs/:runId/trades`** (existente, aditivo). Query nova opcional `from`, `to` (ms UTC, inteiros): devolve as
posições com compra **ou** venda em `[from, to]`. Cada item ganha:

```text
closedCandleTime   number | undefined   (hora do preenchimento de venda)
quantity           decimal texto
entryNotional      decimal texto        (notional do fill de compra)
exitNotional       decimal texto | undefined
entryFee, exitFee  decimal texto (exitFee undefined se aberta)
paid               entryNotional + entryFee
received           exitNotional − exitFee | undefined
fees               entryFee + exitFee | entryFee
netProfitRate      netProfit ÷ paid, para baixo, 8 casas | undefined
```

O cursor e o `limit` ≤ 100 continuam iguais. Ordem: posição aberta primeiro, depois por `openedCandleTime` decrescente
(como hoje — conferir na T1.1 e manter).

**`GET /v1/runs/:runId/chart?from=&to=&columns=`**. `from`/`to` opcionais (padrão: período inteiro da execução; no ao
vivo, do início até a última vela fechada). `columns` inteiro de 100 a 2.000, padrão 800. Resposta:

```text
{ data: {
    symbol, timeframe, from, to, lastClosedCandleTime,
    columns: [{ startTime, endTime, first, last, low, high }],     // ≤ columns itens, decimais em texto
    markers: [{ positionKey, side, candleTime, price, quantity, notional, fee, netProfit?, netProfitRate? }]
             | undefined,
    clusters: [{ startTime, endTime, buys, sells }] | undefined,  // só quando a faixa tem > 500 preenchimentos
    totals: { buys, sells }                                        // na faixa
} }
```

Exatamente um entre `markers` e `clusters` vem preenchido. `from > to`, faixa fora da execução ou `columns` fora da
faixa → 400 com todos os erros e sem eco.

**`GET /v1/runs/:runId/trade-summary`**. `{ data: { closedTrades, totalPaid, totalReceived, totalFees, net,
openPaid?, message } }`, tudo em texto decimal; `message` é a frase do RF11.

As três: `access` de dono, `documentation`, contrato negativo entre usuários (`404`) e mutante do filtro de dono.

## D3. Redução do preço (SQL)

```sql
-- balde = floor((open_time - :from) * :columns / (:to - :from + 1))
SELECT bucket, min(open_time), max(open_time),
       (array_agg(open ORDER BY open_time))[1]        AS first,
       (array_agg(close ORDER BY open_time DESC))[1]  AS last,
       min(low), max(high)
FROM candles WHERE symbol = $1 AND timeframe = $2 AND open_time BETWEEN $3 AND $4
GROUP BY bucket ORDER BY bucket
```

Parametrizado, sem `sql.raw`. A linha do gráfico liga o `last` de cada coluna; a faixa clara vai de `low` a `high`
(assim um pico de compra nunca some na redução). A referência pura em `test/` (oráculo em
TypeScript sobre a lista de velas) confere o SQL em séries sintéticas e no conjunto real.

## D4. Marcadores e agrupamento

Contar os `fills` da faixa (`count(*)`, índice `(run_id, candle_time)` — conferir se existe; se não, migration
aditiva com `.rollback.sql`). Até 500: devolve cada um com o `netProfit` da posição na venda. Acima: agrupa pelos
mesmos baldes do preço (`buys`, `sells`). O limite é constante nomeada (`CHART_MARKER_LIMIT = 500`) em
`runs.constant.ts`.

## D5. Fuso e horário de verão

`formatInZone({ epochMilliseconds, timeZone })` usa `Intl.DateTimeFormat('pt-BR', { timeZone, …, timeZoneName:
'shortOffset' })`. O eixo de tempo do gráfico é em UTC (posição em pixel); só os rótulos são convertidos. Os atalhos
"1 dia"/"7 dias" são durações em milissegundos, não dias de calendário local (sem ambiguidade na troca de horário).
Fuso inválido vindo da conta cai em `America/Sao_Paulo` com aviso no console de desenvolvimento só (nunca em produção).

## D6. Seleção e janela virtual

- Estado na URL: `de`, `ate` (ISO UTC), `operacao` (positionKey). `useTradeSelection` é a única fonte.
- Selecionar na tabela: se a operação está fora da faixa, a faixa passa a ser centrada nela com a mesma largura.
- Selecionar no gráfico: a tabela busca por `from`/`to` da faixa atual (a operação está nela), acha o índice e
  `computeVisibleRows` rola até ele.
- `computeVisibleRows({ scrollTop, viewportHeight, rowHeight, total, overscan })` → `{ first, last, padTop,
  padBottom }`, pura, testada por propriedades (nunca passa de `total`, sempre inclui a linha selecionada após rolar).

## D7. Textos em português simples

Motivo da venda (estende `EXIT_REASON_LABEL` em `run.constant.ts`): `target` → "atingiu o alvo de lucro"; `stop` →
"vendeu para limitar a perda (stop)"; `signal` → "a estratégia mandou vender"; `gap` → "faltaram dados do mercado e a
posição foi fechada"; `end` / `stopped` → "a simulação terminou"; demais → o código cru (nunca some). Conferir a lista
real de `exitReason` no motor e cobrir todos.

Resumo (servidor): "Você pagou {totalPaid} USDT em {n} compras e recebeu {totalReceived} USDT nas vendas. Taxas:
{totalFees} USDT. Saldo líquido: {net} USDT." Com posição aberta: "+ uma operação ainda aberta, com {openPaid} USDT
pagos."

## D8. Ao vivo

A consulta do gráfico fica sob a chave raiz `runs` (`[runs, runId, 'chart', from, to, columns]`), então o aviso do
`useLiveStream` já a invalida. "Acompanhando" = `ate` ausente na URL; nesse caso a API usa a última vela fechada. Com
`ate` presente, a tela compara `lastClosedCandleTime` com `ate` e mostra "Há operações novas — ir para o fim".

## D9. Custo medido

Conjunto de prova: 17.520 velas de 15 min e 1.000 posições (reusa o lote sintético do `make database-test`) e 44.000
velas de 1h. Medir `/chart` (faixa inteira e 1 dia), `/trades` (primeira página com `from/to`) e `/trade-summary`. Se o
p95 passar de 300 ms, o primeiro passo é índice, não cache.

## D10. Gates

Como nas specs anteriores: `bun run typecheck` + `bun run lint` + testes (`make check` e o script `test` do painel, com
os arquivos novos na lista explícita) + commit isolado. Rodar no Linux/WSL (spec 003 plan D6: caminhos `/C:/...`
quebram fixtures no Windows). Contratos de rota usam `loadApiApp()` e os repositórios em memória de
`test/fixtures/api-routes/`; integração com Postgres entra em `make api-runs-test`.
