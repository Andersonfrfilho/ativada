# Plan — Spec 017 (gráfico em velas menores, opiniões de 15 min)

Os fatos de código abaixo foram conferidos em 2026-10-16; os marcados **(conferir na T0.1)** precisam ser lidos no código
antes de virar contrato no ADR.

## D1 — Onde moram as velas de 3 min (medido e estimado)

Medição só por `SELECT` no banco dev (`ativada-dev-postgres`, 2026-10-16): 9 pares (BNB, BTC, DOGE, ETH, LINK, PEPE, SHIB,
SOL, XRP) × 15m/1h/4h/1d; ~70.467 velas de 15 min por par em 2 anos; `candles` com 838.983 linhas e 151 MB
(97 MB tabela + 54 MB índice PK `(exchange, symbol, timeframe, open_time)`) ≈ **189 B por linha** (≈ 124 B de linha).
`candles_timeframe_check` aceita só `15m, 1h, 4h, 1d` → gravar 3m **exige migration**. `runs` usa 15m (56), 1h (5),
4h (2) e 1d (4): a regra vale para qualquer vela de execução que a de exibição divida.

| Cenário | Velas por par | 9 pares | Disco (~189 B) | Pedidos de backfill (1.000/pedido, peso 2) |
|---|---|---|---|---|
| 3m · 2 anos | 350.640 | 3.155.760 | ≈ 570–600 MB | 3.159 (6.318 de peso) |
| **3m · 90 dias** | **43.200** | **388.800** | **≈ 70 MB** | **396 (792 de peso)** |
| 3m · 30 dias | 14.400 | 129.600 | ≈ 23 MB | 135 |
| 1m · 90 dias | 129.600 | 1.166.400 | ≈ 211 MB | 1.170 |
| 5m · 90 dias | 25.920 | 233.280 | ≈ 42 MB | 234 |

Tempo de backfill (estimativa): o cliente (`packages/market-data-crypto`, `MAX_KLINES_PER_REQUEST = 1000`,
`weightCeiling` 6.000 com margem 600 → 5.400/min ≈ 2.700 pedidos/min) não é o gargalo; o backfill é sequencial por par
com ~0,2–0,5 s por pedido → 90 dias ≈ **1,5 a 3,5 min**; 2 anos ≈ **11 a 27 min** e ~6.300 de peso (se rodar sem pausa
chega perto do teto de 1 minuto: a margem do portão segura, mas um backfill de 2 anos só com autorização). Crescimento
em regime: 480 velas/par/dia → 4.320 linhas ≈ 0,8 MB/dia, removidas pelo expurgo.

- **A (recomendada):** `3m` gravado. Migration `00NN_candles_display_timeframes` (número livre na hora; hoje a última é
  0025): recria o `CHECK` com `1m, 3m, 5m` (`NOT VALID` + `VALIDATE`), `.rollback.sql` aborta se houver linha com eles.
  `CANDLE_TIMEFRAMES` e `TIMEFRAME`/`TIMEFRAME_DURATION_MILLISECONDS` (`market-data-crypto`) ganham as velas; nova
  constante `DISPLAY_ONLY_TIMEFRAMES`; `RUN_TIMEFRAMES` (`packages/database/src/runs/run.constant.ts`) e
  `ENGINE` timeframes (`strategy-engine/src/engine.constant.ts`) **não mudam**. Env: `MARKET_DISPLAY_TIMEFRAMES`
  (padrão `3m`), `CANDLE_DISPLAY_RETENTION_DAYS` (90). O backfill da vela de exibição usa `retenção` em vez de
  `BACKFILL_YEARS`. Expurgo: tarefa nova do cron `purge-display-candles` (`DELETE ... WHERE timeframe = ANY($display)
  AND open_time < $corte` em lotes de 5.000, parametrizado), na lista de `CRON_TASKS`.
- **B:** proxy sob demanda na API com cache de 60 s por (par, vela, página alinhada). Sem migration, mas: chamada externa no
  caminho do pedido (100–400 ms, indisponibilidade da Binance = gráfico vazio), peso dividido com worker e cron no mesmo IP
  (um 418 provocado por arrastos para a recuperação de lacunas das simulações ao vivo), vela em formação vinda de outra
  fonte, e nenhuma prova do oráculo 5×3 = 15 sobre dado gravado. **Recusada por padrão.**
- **C:** gravar `1m` e agregar 3m/5m em SQL (`date_bin`/divisão inteira + `first/last` por janela). Uma assinatura por
  par serve 3 velas, mas 5× as linhas e a vela de 3 min deixa de ser a da Binance. Alternativa se o usuário quiser 1m.

**Fatos de código que pesam no desenho (levantados em 2026-10-16):**

- A lista `15m,1h,4h,1d` está repetida em `market-data-crypto/src/timeframe.constant.ts` (`TIMEFRAME`),
  `database/src/candles/candle.constant.ts` (`CANDLE_TIMEFRAMES`), `strategy-engine/src/engine.constant.ts`
  (`ENGINE_TIMEFRAME`), `database/src/runs/run.constant.ts` (`RUN_TIMEFRAMES`) e, no painel, `src/runs/run.constant.ts` e
  `src/runs/live-chart.ts`. `test/strategy-engine-boundary.contract.test.ts:147-164` exige `ENGINE_TIMEFRAME` ≡ `TIMEFRAME`
  e `test/timeframe-tables.contract.test.ts` exige banco ≡ mercado. **Logo, `3m` NÃO entra em `TIMEFRAME`**: nasce
  `DISPLAY_TIMEFRAME` (`1m`, `3m`, `5m`) e `MARKET_CANDLE_TIMEFRAME = TIMEFRAME ∪ DISPLAY_TIMEFRAME`, usado só por
  `klines-request.ts`, `resolve-stream-settings.ts`, `ticker/ticker-candle.schema.ts` (`i`), `CANDLE_TIMEFRAMES` e a rota
  de mercado. O teste de fronteira do motor fica como está (prova que o motor não ganhou 3m).
- O motor só lê velas pela sessão presa a `run.timeframe` (`worker live/create-live-run-database.ts:84-85,145-146`,
  `api backtest/create-backtest-database.ts:76-77`, `walk-forward/create-walk-forward-database.ts:71-74`) e a guarda
  `isCandleTimeframe` (`run-recording/src/market-mapping.ts:11`) usa `ENGINE_TIMEFRAME`. Falta um teste que prenda isso
  contra velas de exibição (RNF01).
- `GET /v1/markets/candles` (`apps/api-ativada/src/markets/`): `symbol`, `timeframe` (`z.enum(ENGINE_TIMEFRAME)` + lista do
  ambiente), `from`/`to` em ms, até `MAX_CANDLES_PER_RESPONSE = 5000`, balde `CANDLE_QUERY` 60/min. Sem `limit`/`before`.
- Painel: `CANDLE_PAGE_SIZE = 1000`, `MAX_CANDLES_IN_MEMORY = 20000`, `INITIAL_VISIBLE_BARS = 150`, página anterior
  `[primeira − 1000·tf, primeira)`; marcas já encaixam por `floor(t/tf)·tf` (`marker-series.ts:13-27`); níveis por tempo
  (`layer-series.ts:42-44`); linhas e placar por `layers.candleTimes` (abertura `t`, **muda para `t + d` na vela menor**);
  cone de `closedAt` a `horizonEndsAt` (`projection-cone.ts:24-25`); fora da vela da execução `useChartLayers`/
  `useLayerSurface` desligam linhas, placar, previsão e "esperou".
- Stream: o worker assina `MARKET_TIMEFRAMES` (`stream/create-worker.ts:146`) e só grava fechadas; a API assina
  `kline_<tf>` com `TICKER_KLINE_ENABLED` e agrega 1/s por (par, vela) (`candle-aggregator.ts`). Limite de 1.024 streams
  por conexão já validado.
- O cron não tem agendamento no repositório (é externo) nem expurgo de velas; tarefas em `src/cron.constant.ts:36-42`.

## D2 — Velas oferecidas

Exibição: `1m`, `3m`, `5m` (as três aceitas no `CHECK`; o env decide quais gravar, padrão só `3m`). Execução: `15m`, `1h`,
`4h`, `1d` (sem mudança). Regra pura `isDisplayCompatible({ displayTimeframe, runTimeframe })` = duração da exibição
divide a da execução (3m divide 15m, 1h, 4h e 1d; alinhamento UTC da Binance garante que fronteiras de 15 min são
fronteiras de 3 min). Camadas da estratégia aparecem quando é compatível; vela maior mantém o aviso da 009.

## D3 — Mapeamento 15 min → 3 min (puro, `display-mapping.ts` no painel)

- `bucketOf(instant, dDisplay) = instant − (instant mod dDisplay)`.
- Vela decidida `t` (abertura), `closedAt = t + d`, `horizonEndsAt = t + 2d` (P7 do ADR): opinião, placar, "esperou",
  tendência e linhas da estratégia ocupam `[t + d, t + 2d)` → `d ÷ dDisplay` velas (5 em 3m). Nas velas de 15 min nada
  muda (009 idêntica, prova por dourado).
- Preenchimento na abertura `t + d`: vela `bucketOf(t + d)`; preço = preço do preenchimento (`fills`).
- Saída por alvo/proteção/lacuna na vela de 15 min `k`: marca em `bucketOf(k)` com colchete até `k + d` (D4-A). Como o
  `fills` registra o instante **(conferir na T0.1: coluna de tempo do fill e se ela é a abertura da vela)**.
- Níveis: linhas horizontais de `bucketOf(entrada)` a `bucketOf(saída)` (posição aberta até a ponta).
- Previsão: horizonte `[t + d, t + 2d)`; o painel "Próxima vela de perto" desenha 5 vagas de 3 min.

## D4 — Stream

- Worker: assina também `<par>@kline_3m` no stream combinado e grava só `x === true` com `upsertCandles` (como 15m); a
  verificação de lacuna por janela (`STREAM_GAP_LOOKBACK_HOURS`, 168 h = 3.360 velas de 3 min = 4 pedidos por par) cobre
  3m, limitada à retenção. **(conferir na T0.1: como o worker monta a lista de streams a partir de `MARKET_TIMEFRAMES`.)**
- API (ticker): a assinatura `kline` passa a incluir as velas de exibição; a mensagem `candle` já leva `timeframe`;
  agregador 1/s por par **e vela** por socket (009 D9). Desligável por `TICKER_KLINE_ENABLED`.

## D5 — API e paginação

- `GET /v1/markets/candles` aceita as velas de exibição habilitadas (`MARKET_CANDLE_TIMEFRAME` + lista do ambiente),
  mesmo teto de 5.000 e balde `CANDLE_QUERY` (60/min; uma página de 1.000 velas de 3m = 1 pedido). Antes do corte da
  retenção devolve lista vazia; o corte vai ao painel por campo aditivo (`retentionStart`, decidir na T0.1).
- Painel: página inicial de 1.000 velas de 3m (50 h), paginação à esquerda pela R9 da 009 até `earliestTime` (corte da
  retenção) com o texto "Velas de 3 min só existem a partir de DD/MM"; teto de 20.000 na memória.
- `strategy-layers` (`RUN_CHART`, 30/min, até 1.000 velas de 15 min): em 3m a faixa pedida é a mesma em tempo, alinhada a
  15 min → **uma página de 3m (50 h) = 200 velas de 15 min = um pedido**; nunca mais pedidos por minuto que a vista de 15 min.
  Chave da consulta pelo intervalo de 15 min, para reaproveitar o cache ao trocar 15m ↔ 3m. Nenhuma rota nova.

## D6 — Painel

`useTimeframeChoice` com a vela padrão (D3), `TimeframeNotice` com a legenda "Gráfico em 3 min · opiniões a cada 15 min"
e a frase fixa, `marker-series`/`layer-series`/`score-series`/`projection-cone` recebendo o mapeamento puro de D3,
`composeCandles` (BigInt) para a legenda da vela de 15 min, `NextCandlePanel` com as 5 vagas. Escala do eixo X: a
biblioteca usa a vela da série; marcas de hora a cada 15 min em 3m.

## D7 — Provas

- Oráculo `bigint` `test/fixtures/display-candles/compose-oracle.ts` (sem importar `src`): 5×3m = 15m (OHLCV +
  `trade_count`) sobre o banco de teste preenchido pela Binance falsa e, em leitura, sobre o dev (`SELECT`, script em
  `scripts/`), com relatório de divergências.
- Propriedades do mapeamento (2.000 sorteios) e dourado: em 15m o resultado é idêntico ao da 009.
- Contratos com a superfície falsa (`fake-chart-surface.ts`): posições de marcas, faixas e degraus em 3m.
- Fronteira do motor (RNF01) + mutantes: filtro `timeframe = run.timeframe` removido; `3m` aceito no `POST /v1/runs`;
  expurgo sem filtro de vela; expurgo com `<=` no corte.
- `make backfill-test` e `make stream-test` com 3m; `make migration-test`; E2E no Edge.

## D8 — Pontos que exigem autorização

Migration do `CHECK` (T2.1), expurgo de dados (T2.3), backfill de 3m no ambiente dev (T2.4; o de 2 anos, se escolhido, à
parte), qualquer chamada externa nova (só na opção B). Nenhum deles é feito sem a resposta registrada em `evidence.md`.
