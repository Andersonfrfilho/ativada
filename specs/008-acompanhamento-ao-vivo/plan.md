# Plano — Spec 008

Fatos conferidos em 2026-10-14 (não repetir a busca):

- `signals` (migration 0008, `packages/database/src/schema/signals.schema.ts`): `id`, `user_id`, `run_id`, `candle_time`
  (abertura, ms), `action` (`BUY`/`SELL`/`HOLD`), `score` numeric, `regime` (`trending`/`ranging`/`none`), `votes` jsonb
  (`[{ ruleId, family, vote: -1|0|1, weight, isMissing }]`, **sem nome da regra**), `indicators` jsonb
  (`Record<string, number|null>`, chaves `rule:<id>`, `risk:atr`, `regime:adx`, multi-saída achatada como
  `rule:macd-12-26-9.signal`), `sentiment_observation`, `reason` text (frase técnica de `buildSignalReason`). Único
  `(run_id, candle_time)`, índice `(user_id, run_id)`. **Uma linha por vela, HOLD incluído.**
- `equity_points`: PK `(run_id, candle_time)`, `equity`, `equity_at_low`, `benchmark` (comprar e segurar: `buyBenchmark`
  em `wallet/wallet-valuation.ts`, compra tudo na abertura depois do primeiro sinal). `positions` tem `stop_price` e
  `target_price`.
- Limiares em `config.thresholds = { buy, sell }` (`strategy-config.schema.ts`); placar em `scoreboard.ts`: `score >= buy`
  → BUY, `score <= sell` → SELL. Exportados do motor: `ruleLabel`, `computeNextTriggers`, `ScoreboardReadings`
  (`{ rules: Record<id, { current, previous }>, atr, adx }`), `STRATEGY_CONFIG_SCHEMA`, `computeProtectivePrices`.
- `computeNextTriggers({ config, readings, close, closeTime, sentiment, sentimentSource, state })` é puro;
  `NextTriggers = { version 'trigger-1', state, action, score, scoreThreshold, scoreGap, rules: RuleTrigger[] }` com
  `{ ruleId, kind, family, vote, weight, isMet, metric, direction, basis, current, threshold, distance, distanceRate }`.
  Hoje só `computeLatestTriggers` o chama, **reexecutando `signalStep` sobre a série** (caro); usado na avaliação da meta e
  no resumo de ativos. Nenhuma rota de `runs` o usa.
- `runs.request.goal = { targetRate, maxLossRate, horizonDays }` (`parseGoalSpec`). `GET /v1/runs/:id` traz `goalId`,
  `goalOutcome`, `survival`, `waitingForData`, `stalledSince`, `lastCandleTime`, `timeframe`, `runParameters`; **não** traz
  progresso da meta. O painel calcula em `src/goals/goal-progress.ts` (`Number`), usado pelo `ActiveGoalCard`.
- Rotas de série em `apps/api-ativada/src/runs/run-series.routes.ts` (`/signals` com `cursor`, `limit` ≤ 100, `order`; não
  esconde HOLD); `/chart` em `runs/chart/run-chart.route.ts` (marcadores só de `fills`, teto 500, política `RUN_CHART`).
  Harness `loadApiApp()` (`test/fixtures/api-routes/api-app.fixture.ts`), mutantes de dono em `scripts/api-runs-mutants.ts`,
  `test/api-routes-mutants.contract.test.ts` e `test/api-run-chart-mutants.contract.test.ts`.
- Painel: detalhe = `BacktestDetailPage` (`src/backtests/BacktestDetailPage.page.tsx`) → `RunHeader`, `ActiveRun`
  (`RunProgressCard` com `LiveRunStatus`, depois `TradeChartCard` só em `live_paper` rodando). `SignalsCard` só na Visão
  geral, esconde HOLD. Marcadores do gráfico: `chartMarkerSchema` só `buy`/`sell`. Glossário com seis termos (sharpe,
  sortino, profitFactor, maxDrawdown, winRate, slippage).
- WebSocket: cada passo dá `pg_notify` `signal` (HOLD também), `trade` e `balance`; `useLiveStream` invalida toda a raiz
  `runs` em qualquer evento. Última migration: `0023_run_stall`.

## D1. Onde mora cada peça

| Peça | Lugar | Por quê |
|---|---|---|
| Leituras | `packages/database/src/run-results/run-live-status.ts`: `readLatestEquityPoint`, `listDecisionRows({ userId, runId, cursor, limit })`, `readOpenPosition`, `listDecisionMarkers({ userId, runId, from, to, limit })`; `userId` no tipo | Filtro de dono num lugar; mutantes de Postgres entram ali |
| Contas puras (API) | `apps/api-ativada/src/runs/live-status/`: `live-balance.ts` (saldo, resultado, comprar e segurar, diferença em p.p.), `live-goal-progress.ts` (alvo, prazo, falta, perda que cabe), `stored-readings.ts` (leituras gravadas → `ScoreboardReadings`) | Testáveis sem banco, oráculo à mão |
| Frases | `decision-messages.ts` (motivo por vela, catálogo fechado por `metric` e voto), `trigger-messages.ts` (o que falta), `live-status-messages.ts` (saldo, meta, comparação) | Mesmo padrão de `horizon-messages.ts` e `trade-summary-message.ts` |
| Rotas | `live-status.route.ts`, `run-decisions.route.ts`, `*.docs.ts`, `live-status.schema.ts` (Zod de saída); `/chart` ganha `decisions` em `run-chart.route.ts` | Rotas declaram `access` + `documentation` |
| Painel: dados | `src/runs/live-tracking/live-status.validation.ts`, `live-status.query.ts` (chave `['runs', runId, 'live-status']` e `['runs', runId, 'decisions']`) | Aviso do stream refaz sozinho |
| Painel: cartão | `src/runs/live-tracking/`: `LiveTrackingCard`, `LiveBalanceBlock`, `LiveGoalBlock`, `DecisionsTable` + `DecisionRow` + `DecisionVotes`, `NextTriggersBlock`, `LiveTrackingNotices`, `decision-text.ts` (formatação local da hora e dos números) | Um conceito por arquivo; ≤ 200 linhas |
| Painel: gráfico | `price-chart-markers.ts` ganha o tipo `decision` (pontinho); `ChartLevels.component.tsx` (linhas de alvo/stop/compra) e a caixa "Mostrar níveis" em `TradeChartCard` | Reusa escala e foco da spec 005 |
| Glossário | `glossary.constant.ts`: `candle`, `score`, `threshold`, `buyAndHold`, `stopPrice`, `targetPrice` | `Term` exige entrada no catálogo fechado |

## D2. Contrato das rotas (fechar na T0.1)

`GET /v1/runs/:runId/live-status` → `200 { data }`:

```text
run: { id, status, symbol, timeframe, startedAt, lastCandleTime, nextDecisionAt }
balance: { initial, current, result, resultRate, observedAt | null, message }
buyAndHold: { value, resultRate, differencePoints, comparison: above|below|even, message } | null
goal: { targetRate, targetAmount, remainingAmount, remainingRate, deadlineAt, remainingMilliseconds,
        maxLossRate, floorAmount, lossRoomAmount, outcome | null, message } | null
openPosition: { entryPrice, quantity, targetPrice, stopPrice, openedAtCandleTime } | null
triggers: { state: awaiting_entry|holding, score, scoreThreshold, scoreGap, message,
            rules: [{ ruleId, label, metric, direction, basis, current, threshold, distance, distanceRate, isMet, message }] }
          | { unavailable: no_candle|not_running|warming_up, message }
decisions: { items: Decision[], nextCursor | null }
Decision = { candleTime, closedAt, close, action, outcome: waited|bought|sold|warming_up, score, threshold,
             regime, message, technicalReason, votes: [{ ruleId, label, vote, weight, isMissing, reading | null }] }
```

- `GET /v1/runs/:runId/decisions?cursor=&limit=` → `{ data: Decision[], pagination: { nextCursor, perPage } }`; cursor =
  `candle_time` (decrescente), `limit` padrão 24, teto 100.
- `/chart`: `decisions: [{ candleTime, action, score }] | null` (só `live_paper`; `null` acima de 500 velas na faixa ou em
  outros tipos).
- Erros: `404 RUN_NOT_FOUND` (alheia, inexistente, id malformado); `409 RUN_NOT_LIVE`; `400` com todos os erros, sem eco.
- `close` de cada decisão vem de `candles` (join pela chave `(symbol, timeframe, open_time)`, já indexada); conferir o nome
  do índice na T0.1.

## D3. Gatilhos sem recalcular o motor

1. Ler as **duas** últimas linhas de `signals` (a última fechada e a anterior) e a versão da estratégia (`config`).
2. `stored-readings.ts` monta `ScoreboardReadings`: `rules[id].current` = `indicators['rule:<id>']` da última (multi-saída
   remontada das chaves `rule:<id>.<campo>`), `previous` = o mesmo da anterior; `atr` = `risk:atr`; `adx` = `regime:adx`.
   Sentimento = `sentiment_observation` da última linha.
3. `state` = `holding` se há posição aberta, senão `awaiting_entry`; `close` = fechamento da última vela.
4. `computeNextTriggers(...)`. **Paridade obrigatória (T0.1):** em todas as velas dos dois conjuntos reais, o resultado é
   igual ao de `computeLatestTriggers` sobre a série. Se não bater, a T0.1 registra o motivo e a execução **para e
   pergunta** antes de cair na alternativa (pool de threads + cache por `(runId, lastCandleTime)`).

## D4. Frases (catálogo fechado)

- **Por vela:** decisão + pontuação × limiar + a regra que mais pesou. Esperou com `score < buy`: "Faltou N ponto(s):
  <regra contra ou neutra de maior peso> <condição em palavras>". Comprou: "Comprou: N de M regras a favor (<nomes>)."
  Vendeu: análogo. Comprada e esperou: "Esperou: já está comprada; a venda pede pontuação −2 e está em 0." `isMissing`:
  "Sem dado suficiente: <regra> ainda está aquecendo." Regime filtrado: "O filtro de tendência (ADX) deixou a regra de fora."
- **Condição por `metric`:** `close_price` ("o preço precisa fechar acima de X"), `rsi` ("o RSI precisa ficar abaixo de
  X"), `macd_gap` ("o MACD ainda está negativo/positivo"), `obv_gap`, `fear_greed_index`. Nome da regra por `ruleLabel`.
- **Comparação:** diferença em pontos percentuais arredondada a 2 casas, "acima"/"abaixo"/"empatada" (|dif| < 0,01).
- Toda frase tem teste com o texto literal esperado.

## D5. Contas de dinheiro (fechar na T0.1)

- `result = current − initial`; `resultRate = result ÷ initial` (12 casas, exibido a 2 na direção contra o usuário).
- Meta: `targetAmount = ceil8(initial × (1 + targetRate))`; `remainingAmount = max(0, targetAmount − current)` para cima;
  `floorAmount = ceil8(initial × (1 − maxLossRate))`; `lossRoomAmount = max(0, current − floorAmount)` para baixo;
  `deadlineAt = startedAt + horizonDays × 86.400.000` (o mesmo instante que `judgeGoalStep` usa: conferir na T0.1).
- Painel recebe texto e formata com `formatScaled`/`roundScaledDirected` na mesma direção; nunca `Number`.

## D6. Painel

- `ActiveRun` vira: `LiveTrackingCard` (só `live_paper`) → `RunProgressCard` → `TradeChartCard` (agora também em
  `live_paper` parada ou concluída).
- Tabela: `<table>` com `<caption>` e cabeçalho com o fuso; abaixo de 600 px vira lista (`<ul>`) com os mesmos rótulos.
  Linha expansível por `<button aria-expanded>`; votos com sinal e texto.
- Pontinho de "esperou": círculo de 3 px, cor `--muted-strong` com contraste ≥ 3:1; parte da mesma parada de Tab das setas
  (←/→ passam por eles), dica pelo `MarkerTooltip` existente.
- `BalanceCard`: uma linha com `decisions.items[0].message` e link para `/backtests/:runId#acompanhamento`.
- `ActiveGoalCard`: lê `goal` do `live-status`; `goal-progress.ts` e o teste dele saem.

## D7. Testes e mutantes

- Puros: `live-balance`, `live-goal-progress`, `stored-readings` (paridade), `decision-messages`, `trigger-messages` com
  contas à mão e propriedades (arredondamento sempre contra o usuário; `remainingAmount ≥ 0`; `lossRoomAmount ≥ 0`).
- Rotas (`loadApiApp()`): feliz, 404 entre usuários nas três, 409 em backtest, 400 com todos os erros, simulação sem vela,
  aquecendo, comprada, com e sem meta, desfecho gravado; `api-openapi` verde.
- Mutantes: `test/api-run-live-status-mutants.contract.test.ts` (filtro de dono, `409`, teto de 500, arredondamento,
  frase do limiar) e `scripts/api-runs-mutants.ts` (+4 filtros de dono no Postgres das leituras novas).
- Painel: contratos `test/live-tracking*.contract.tsx` (fixture com e sem compra, aviso do stream acrescenta linha,
  teclado, 375 px por classe, contraste em `test/contrast.contract.ts`) na lista explícita do `package.json`.
- E2E (`make panel-e2e`): simulação ao vivo com o servidor de controle gravando um sinal HOLD + ponto de patrimônio → linha
  "Esperou" aparece e o saldo atualiza.

## D8. Gates

Como nas specs anteriores: `bun run typecheck` + `bun run lint` + testes (`make check`, o script `test` do painel com os
arquivos novos na lista explícita, e o alvo `make` da task) + commit isolado. **Rodar no Linux/WSL**, num espelho em disco
Linux (spec 003 plan D6: caminhos `/C:/...` quebram fixtures no Windows). Contratos de rota usam `loadApiApp()`.
