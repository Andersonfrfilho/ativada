# Plano — Spec 009

Fatos conferidos em 2026-10-14 (não repetir a busca):

- **Gráfico atual** (`apps/frontend-ativada/src/runs/`): `TradeChartCard` → `TradeChartBody` → `PriceChart` (SVG,
  `price-chart.ts` escala pura, `PriceChartAxes`, `PriceChartLegend`, `TradeMarker`, `MarkerCluster`, `MarkerTooltip`,
  `chart-keyboard.ts`, `chart-description.ts`, `useChartView`, `useActiveChartItem`), faixa em `chart-range.ts`, seleção em
  `trade-selection.ts`, ao vivo em `live-chart.ts`/`LiveChartStatus`. Esquema `trade-chart.validation.ts`
  (`columns` mín–máx por balde, `markers` só `buy`/`sell`, `clusters`, `totals`, `runRange`, `lastClosedCandleTime`).
- **API do gráfico** (`apps/api-ativada/src/runs/chart/`): `GET /v1/runs/:runId/chart?from=&to=&columns=` (100 a 2.000
  colunas, padrão 800; `CHART_MARKER_LIMIT` 500; política `RUN_CHART` 30/min); `chart-decisions.ts` já devolve `decisions`
  (spec 008 T1.5, `null` acima de 500 velas ou fora de `live_paper`).
- **Velas públicas**: `GET /v1/markets/candles?symbol=&timeframe=&from=&to=` (`markets.routes.ts`, `MAX_CANDLES_PER_RESPONSE`
  5.000, política `CANDLE_QUERY`, só pares/timeframes habilitados no env). `candles` tem `open/high/low/close numeric(24,8)` e
  `volume numeric(32,8)`, PK `(exchange, symbol, timeframe, open_time)`.
- **O que o motor grava por vela** (`signals`, migration 0008; contrato da spec 008 L1–L20 no ADR 0002): `score`, `action`,
  `votes`, `indicators` (`collectIndicators`): `rule:<id>` ou `rule:<id>.<saída>` (EMA cross `.fast/.slow`, Bollinger
  `.lower/.middle/.upper/.width`, Donchian `.lower/.upper`, MACD `.macd/.signal/.histogram`), `risk:atr`, `regime:adx.*`.
  Uma linha por vela depois do aquecimento. Limiares em `config.thresholds = { buy, sell }` da versão. Stop/alvo =
  entrada ∓/± k·ATR (`stopAtrMultiple` 2, `targetAtrMultiple` 3 por padrão).
- **Ao vivo**: ticker da API (`packages/market-data-crypto/src/ticker/`, `<par>@miniTicker`: só preço, abertura 24 h e
  instante); o worker consome klines (`x === true` grava; as não fechadas são descartadas). Painel: `MarketStore` +
  `useShownPrice`/`useLivePrice`; aviso `runs` invalida a raiz `runs`.
- **Painel**: React 19.3, Vite 8.3, TanStack Query 5.104, sem biblioteca de UI; CSP do build em
  `apps/frontend-ativada/panel-security-headers.constant.ts` (`script-src 'self'`, `style-src 'self'`, `img-src 'self' data:`).
  Testes em happy-dom (sem canvas). Spec 008: Fases 0 e 1 prontas; Fases 2–4 (painel) abertas.
- **Biblioteca candidata**: `lightweight-charts` 5.2.1 (npm, 2026-08-12; 5.2.0 em 2026-04-24; 5.1.0 em 2025-12-16), Apache-2.0,
  dependência única `fancy-canvas@2.1.0`. O `NOTICE` exige o aviso de atribuição e um link para tradingview.com na página
  (a opção `attributionLogo` satisfaz o link). v5 tem painéis nativos e marcadores por plugin (`createSeriesMarkers`).
  **Não instalada.**
- Última migration: `0023_run_stall`.

## D1. Arquitetura do gráfico no painel (com a D1-A; a D1-B troca só a camada "Superfície")

```text
TradeChartCard (existente)
 ├─ ChartToolbar         vela (15m/1h/4h/1d), camadas, zoom      ← chart-preferences.ts (localStorage, try/catch)
 ├─ CandleChart          dono do ciclo de vida: cria/destrói a superfície num useEffect, liga dados por hooks
 │   └─ ChartSurface     PORTA (tipo): setCandles, setVolume, setLines, setScore, setMarkers, setProjection,
 │                        setLiveCandle, setCrosshair, onCrosshairMove, onVisibleRangeChange, fit, scrollToEnd, destroy
 │       ├─ lightweight-surface.ts   adaptador real (o ÚNICO arquivo que importa a biblioteca)
 │       └─ test/support/fake-chart-surface.ts   registra chamadas para os contratos
 ├─ OhlcLegend           HTML por cima do canvas (texto decimal formatado; nunca desenhado no canvas)
 ├─ NextCandlePanel      "Próxima vela de perto": SVG pequeno à mão (≤ 8 velas, sem biblioteca) + rótulo + resultado
 ├─ ChartAnnouncer       região aria-live + navegação por teclado (chart-keyboard.ts reaproveitado)
 └─ TradesTable (existente)
Cartões novos abaixo: ProjectionSourceCard ("De onde vem a previsão"), ProjectionHistoryCard ("Histórico de acertos")
```

- **Puros e testáveis** (sem DOM): `candle-series.ts` (velas da API → `{ time, open, high, low, close }` em segundos UTC; a
  ÚNICA conversão texto→`number`, só para desenho), `strategy-line-series.ts`, `score-series.ts`, `marker-series.ts`,
  `projection-cone.ts` (pontos do cone por `√f`, metade colorida), `chart-theme.ts` (lê os tokens por `getComputedStyle` uma vez
  e na troca de tema), `candle-paging.ts` (quando pedir a página anterior; dedupe por `open_time`), `ohlc-text.ts`.
- **Fuso**: a biblioteca desenha em UTC; `tickMarkFormatter` e `localization.timeFormatter` usam `formatInZone` com o fuso
  do usuário (`useUserTimeZone`), a mesma função da spec 005.
- **Cores**: nada de hexadecimal no código; `chart-theme.ts` lê `--buy`, `--sell`, `--ink*`, `--line`, `--accent`, `--bench`
  e as derivadas novas (`--chart-grid`, `--cone-up`, `--cone-down`, `--cone-neutral` em `global.css`, por `color-mix`).
- **Paginação**: primeira carga = últimas 1.000 velas da faixa (ou a faixa da URL); `onVisibleRangeChange` perto da borda
  pede a página anterior por `to = primeira vela`; teto de 20.000 velas em memória (descarta as mais distantes).
- **Ao vivo**: `useLiveCandle(symbol, timeframe)` lê o `MarketStore` (D9-A: mensagem `candle`; D9-B: ticks) e chama
  `surface.setLiveCandle`; vela fechada chega pelo aviso `runs` → refetch da última página.

## D2. Contrato das rotas (fechar na T0.1)

`GET /v1/runs/:runId/strategy-layers?from=&to=` → `200 { data }` (faixa `[from, to)` em ms UTC, recortada pela da execução,
teto de 5.000 velas — acima disso `400 RANGE_TOO_LARGE`, o painel pagina):

```text
version: 'layers-1'
timeframe, thresholds: { buy, sell }                     // texto decimal da versão da estratégia da execução
lines: [{ key: 'rule:<id>.upper', ruleId, label, role: channel_upper|channel_lower|ema_fast|ema_slow|band_upper|band_middle|band_lower,
          points: [{ candleTime, value | null }] }]       // só regras de preço; valor em texto decimal
score: [{ candleTime, score, action: BUY|SELL|HOLD }]
atr: [{ candleTime, value }]                              // usado pela faixa e pelo "De onde vem"
```

`GET /v1/runs/:runId/projections?cursor=&limit=` → `200 { data }` (mais recente primeiro, `limit` padrão 24, teto 100):

```text
version: 'projection-1'
current: { candleTime, closedAt, horizonEndsAt, side: buy|sell|none, stance: buy|hold|sell|stay_out,
           strength: weak|strong|decided, score, threshold, base, bandLow, bandHigh, atr, message }
       | { unavailable: no_candle|warming_up|neutral|not_running|other_timeframe, message }
summary: { counted, hits, hitRate, upMoves, upRate, banded, inside, insideRate,
           byStrength: [{ strength, counted, hits, hitRate }], verdict: above|even|below|too_few, message }
items: [{ candleTime, side, strength, base, nextClose | null, result: hit|miss|tie|no_side|pending, isInside | null }]
nextCursor | null
```

- `current` só para `live_paper` rodando (backtest: `unavailable: not_running`, mas `summary` e `items` vêm).
- `summary` sobre a execução inteira, numa consulta: `signals` ⋈ `candles` com `LEAD(close) OVER (ORDER BY open_time)` na mesma
  série, filtrando o dono; walk-forward só as janelas de teste. Índices usados: `signals_run_id_candle_time_unique`,
  `candles_exchange_symbol_timeframe_open_time_pk` (conferir o plano na T0.1; índice faltando = **parar e perguntar**).
- `/chart` e `/live-status` não mudam; `live-status` pode ganhar `projection` (aditivo) se a T0.1 provar que poupa uma ida.
- Erros: `404 RUN_NOT_FOUND` (alheia, inexistente, id malformado); `400` com todos os erros, sem eco. Políticas: `RUN_CHART`
  para `strategy-layers`; `RUN_LIVE_STATUS` (60/min) para `projections`.

## D3. Regra `projection-1` (pura, `apps/api-ativada/src/runs/projections/projection-rule.ts`)

Entrada: `{ score, thresholds, atr, close, isHolding }` da vela `t` (todos texto decimal; `EngineDecimal` na conta).

1. `side` = `buy` se `score > 0`, `sell` se `score < 0`, `none` se `= 0`.
2. `ratio` = `|score| ÷ |limiar do lado|` (`buy` ou `sell`); `strength` = `weak` se `ratio ≤ 0,5`, `strong` se `< 1`, senão
   `decided`.
3. `stance` (palavra da tela): fora + buy → `buy` ("Tende a COMPRAR"); fora + sell → `stay_out` ("Tende a FICAR DE FORA");
   comprada + buy → `hold` ("Tende a SEGURAR"); comprada + sell → `sell` ("Tende a VENDER").
4. Faixa: `bandLow = close − atr` (para baixo no tick), `bandHigh = close + atr` (para cima): a faixa nunca encolhe.
5. Acerto na vela `t+1` (fechada): `hit` se `side = buy` e `close(t+1) > close(t)` ou `side = sell` e `<`; `miss` no contrário;
   `tie` se igual; `no_side` se `side = none`; `pending` se `t+1` ainda não fechou. `isInside` = `bandLow ≤ close(t+1) ≤ bandHigh`.
6. Taxas (`hitRate`, `upRate`, `insideRate`) com 2 casas, **para baixo**; `upRate` = fração das velas contadas que subiram (o
   "sempre sobe").
7. Veredito (D8): `too_few` se `counted < 30`; intervalo de Wilson 95% (z = 1,96, decimal com 12 casas) sobre `hits/counted`:
   limite inferior > 0,5 → `above`; superior < 0,5 → `below`; senão `even`.

Teste dourado: os dois conjuntos reais do motor (`btcusdt-1h-500`, `ethusdt-1d-400`) com o Placar clássico e o Donchian +
MACD → resumo literal gravado; mudar a regra exige `projection-2` e o dourado regravado.

## D4. Frases (catálogo fechado, `projection-messages.ts`)

- Tendência: "Tende a COMPRAR", "Tende a SEGURAR", "Tende a VENDER", "Tende a FICAR DE FORA" + "fraco"/"forte"/"decidiu".
- Motivo: "Placar +1 de +2 para comprar." / "Placar −1 de −2 para vender."; o "o que falta" é o `trigger-messages.ts` da
  spec 008 (não duplicar).
- Sem previsão: `neutral` "O placar está em 0: nenhuma regra puxa para um lado."; `warming_up` "A estratégia ainda está
  juntando velas para calcular as regras."; `no_candle` "Aguardando a primeira vela fechar."; `not_running` "A simulação não
  está rodando: não há próxima decisão."; `other_timeframe` (montada no painel) "A estratégia decide em velas de 1 h; troque
  para 1h para ver a previsão."; preço parado (painel) "O preço ao vivo parou de chegar; a previsão volta quando ele voltar."
- Veredito: `above` "Até aqui, a tendência acertou o lado mais vezes que uma moeda ao ar."; `even` "Até aqui, a tendência
  acertou o lado tanto quanto uma moeda ao ar. Ela serve para ler o placar, não para adivinhar o preço."; `below` "Até aqui,
  a tendência errou o lado mais vezes que uma moeda ao ar."; `too_few` "Ainda há poucas previsões para dizer se acerta mais
  que o acaso."
- Toda frase tem teste com o texto literal.

## D5. Vela em formação (D9-A)

- `packages/market-data-crypto`: `createKlineTickerStream` (ou opção do ticker existente) assina
  `<par>@kline_<tf>` dos `MARKET_SYMBOLS` × `MARKET_TIMEFRAMES` na mesma conexão combinada; Zod do quadro; `x` ignorado
  aqui (a gravação continua só no worker).
- `apps/api-ativada/src/market-stream/`: agregador com teto de 1 mensagem/s por (par, tf) por socket; entrega
  `{ type: 'candle', symbol, timeframe, openTime, open, high, low, close, volume, closed }` (texto decimal) só aos sockets
  que assinaram o par (mesma assinatura do ticker, `STREAM_MAX_PAIRS_PER_SOCKET`). Env `TICKER_KLINE_ENABLED` (padrão `true`
  em dev). Contrato no `make stream-api-test`.
- Painel: `MarketStore` guarda a última vela aberta por (par, tf); `computeMarketState` vale para ela também (parada >
  limite = "sem dados").

## D6. Acessibilidade sobre canvas

- Contêiner `role="img"` + `aria-roledescription="gráfico de velas"` + `aria-describedby` (ajuda de teclado + descrição),
  `tabindex="0"`; o teclado move um **índice de vela** no estado React e chama `surface.setCrosshair(index)`; o anúncio
  (`aria-live="polite"`, com espera de 400 ms para não falar a cada tecla) usa o `ohlc-text.ts`.
- Shift+seta usa a lista de eventos (marcadores) já ordenada; Enter numa vela com operação seleciona a linha da tabela
  (`?operacao=`, spec 005 RF10).
- A biblioteca recebe `handleScroll`/`handleScale` normais (roda, arrasto, pinça); os botões de zoom chamam
  `timeScale().applyOptions`/`setVisibleLogicalRange`.

## D7. Testes e mutantes

- Puros (API): `projection-rule` (contas à mão, propriedades: faixa nunca encolhe, `hitRate ∈ [0,1]`, `counted = hits +
  misses`), Wilson nas bordas, frases literais, `layer-series` (chaves achatadas → linhas por papel).
- Rotas (`loadApiApp()`): feliz, 404 entre usuários nas duas, 400 sem eco, faixa > 5.000, backtest sem `current`,
  walk-forward só teste, aquecendo, neutro; `api-openapi` verde; paridade do `summary` SQL contra o oráculo TS no Postgres
  (`make database-test`).
- Mutantes: `test/api-run-projections-mutants.contract.test.ts` (dono, `LEAD` trocado por `LAG`, empate contado, limiar do
  lado errado, arredondamento para cima) e `scripts/api-runs-mutants.ts` (+2 filtros de dono no Postgres).
- Painel: contratos com a superfície falsa (`test/candle-chart*.contract.tsx`): velas/volume/linhas/placar/marcadores
  chamados com os dados certos, troca de vela, camadas, teclado e anúncio, estados do painel de previsão, histórico, 375 px por
  classe, contraste das cores novas; puros (`candle-series`, `projection-cone`, `candle-paging`, `ohlc-text`).
- E2E (`make panel-e2e`): o gráfico real desenha (o `canvas` existe e tem pixels não vazios), arrastar pede a página
  anterior (rede), Tab + setas mudam o anúncio, vela em formação muda com `POST /tick`/kline falso, CSP sem violação no
  console.

## D8. Gates

Como nas specs anteriores: `bun run typecheck` + `bun run lint` + testes (`make check`, o script `test` do painel com os
arquivos novos na lista explícita, e o alvo `make` da task) + commit isolado. **Rodar no Linux/WSL**, num espelho em disco
Linux (spec 003 plan D6). Contratos de rota usam `loadApiApp()`. Instalar a biblioteca (D1-A) só depois da autorização,
versão **exata** (`5.2.1`), `bun install` com lockfile commitado e `bun audit` limpo.
