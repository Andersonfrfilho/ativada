# Evidência — Spec 008

## T0.1 🧠 — Contrato e paridade das leituras gravadas (opus, 2026-10-14)

Decisões registradas no ADR 0002, seção "Acompanhamento ao vivo (spec 008)" (L1 a L20, mais os contratos de teste por
rota). Motor (`packages/strategy-engine`) e `packages/run-recording` intocados (RNF03).

**Conferido no código (lido, não suposto).**

- `signals`: `indicators` = `collectIndicators` do placar (`rule:<id>`, `rule:<id>.<saída>` em ordem alfabética,
  `risk:atr`, `regime:adx.<saída>` só com ADX; Fear & Greed = índice da observação usada ou `null`);
  `sentiment_observation` = `{ value, observedAt, source }` usada, só com Fear & Greed. Uma linha por vela processada
  depois do aquecimento; o aquecimento não grava linha. No ao vivo a primeira linha é a vela `period_start − d`.
- Índices: `signals_run_id_candle_time_unique`, `signals_user_id_run_id_idx`, `equity_points_run_id_candle_time_pk`,
  `equity_points_user_id_run_id_idx`, `positions_run_id_engine_key_unique`, `positions_user_id_run_id_idx`,
  `candles_exchange_symbol_timeframe_open_time_pk`. **Nenhum índice faltando; nenhuma migration.**
- `equity_points.benchmark` = `benchmarkValue` (saldo inicial até o primeiro sinal); `positions.stop_price`/`target_price`
  NOT NULL.
- `computeNextTriggers` chama `evaluateScoreboard`, cujo voto do Donchian lê `previous` e lança sem ele.
- Prazo da meta: `decideGoalStep` vence no candle que fecha em `period_start + horizonDays × 86.400.000`. **Correção do
  plan D5:** a base é `period_start`, não `startedAt`.
- `candles.close` volta com zeros à direita (`numeric(24,8)`) e `close_time` = abertura + d − 1; o gatilho usa esse
  `close_time` (o mesmo que o motor recebeu), não `candle_time + d`.
- O servidor não sabe o fuso: frases sem data/hora (L9); o painel monta as horas.

**Paridade (plan D3) — passou.**

- Código: `apps/api-ativada/src/runs/live-status/stored-readings.ts` (`buildStoredReadings`, puro, 117 linhas) e
  `test/live-stored-readings-parity.contract.test.ts`.
- Método: cada decisão gravada como `mapSignal` grava e lida como o Postgres devolve `jsonb` (número pelo texto `numeric`,
  sem expoente); `computeNextTriggers` sobre as leituras da última linha + anterior × `computeLatestTriggers` sobre o
  prefixo inteiro da série, `toStrictEqual`, estados `awaiting_entry` e `holding`, em TODAS as velas decididas.
- Conjuntos: `btcusdt-1h-500` e `ethusdt-1d-400`. Estratégias (5, cobrindo as 7 regras): Placar clássico (EMA, MACD, RSI,
  OBV, ADX); EMA 3×8 + RSI 7; Donchian 20 + Bollinger 20 sem regime; Fear & Greed + EMA 5×13 + MACD com ADX; as sete com
  ADX. Sentimento sorteado (semente 2026) com observações ausentes, velhas (> 48 h) e de outra fonte.
- **Resultado: 3.054 velas decididas, 6.100 comparações, 0 divergências.** As 4 velas restantes são a primeira decisão
  das duas estratégias com Donchian em cada conjunto: sem a linha anterior o canal anterior não existe gravado, e o
  contrato responde `warming_up` (ADR L2) em vez de inventar.
- Mutantes da remontagem, aplicados à mão no espelho e revertidos: canal anterior trocado pelo atual (morto), sentimento
  descartado (morto), ADX descartado (morto).

```text
bun test ./test/live-stored-readings-parity.contract.test.ts   (WSL, ~/gates/ativada-spec8)
paridade: 3054 velas decididas, 6100 comparações, 4 sem a linha anterior
 12 pass, 0 fail, 12228 expect() calls, 18.04s
```

**Gates (WSL, espelho `~/gates/ativada-spec8`).** `bun run typecheck` verde; `bun run lint` verde; `prettier --check`
verde nos arquivos desta task (o único aviso é `apps/frontend-ativada/e2e/flows/goals.flow.ts`, alterado por outra
sessão e fora deste commit); `bun test` da paridade, `strategy-engine-boundary`, `code-size-limits`,
`app-import-boundary` e `next-trigger-latest`: 73 pass, 0 fail.

**[NEEDS CLARIFICATION]:** nenhum. A paridade bateu e não falta índice: o plano D3 vale, sem pool de threads nem cache.

## T1.1 — Contas puras do acompanhamento (sonnet, 2026-10-14)

- `apps/api-ativada/src/runs/live-status/live-balance.ts` (`computeLiveBalance`, `computeBuyAndHold`),
  `live-goal-progress.ts` (`computeLiveGoalProgress`), `live-status.constant.ts` e a conclusão de `stored-readings.ts`
  (`computeStoredTriggers`: remonta as leituras gravadas e chama `computeNextTriggers`; `needs_previous` na primeira decisão
  com Donchian). Motor e `run-recording` intocados.
- Contas à mão (ganho, perda, sem vela, 1/3 e −1/3 arredondados contra o usuário, empate em ±0,009 e ±0,01, o exemplo da spec
  de 1.023,40) e propriedades de 2.000 sorteios contra um oráculo `bigint` independente (`test/fixtures/live-status/scaled-decimal.fixture.ts`):
  taxa e diferença sempre o piso de 12 casas, `remainingAmount ≥ 0` (para cima), `lossRoomAmount ≥ 0` (para baixo),
  `targetAmount`/`floorAmount` iguais a `computeGoalLevels`.
- Prazo da meta: em 15m, 1h, 4h e 1d o candle em que `decideGoalStep` (worker) devolve `expired` fecha exatamente em
  `deadlineAt = period_start + horizonDays × 86.400.000`.
- Testes novos (carregam o módulo por `loadApiApp()`, então os mutantes entram): `test/live-balance.contract.test.ts`,
  `test/live-goal-progress.contract.test.ts`, `test/live-stored-readings.contract.test.ts` (linha anterior entregue pelo
  chamador mesmo com lacuna, valores não numéricos como ausência).

```text
WSL ~/gates/ativada-spec8: typecheck verde · lint verde · format:check verde
bun test (3 arquivos novos): 38 pass, 0 fail
vizinhos (live-stored-readings-parity, api-openapi, ownership-registry, strategy-engine-boundary, code-size-limits,
app-import-boundary, api-run-trade-summary, api-runs): 193 pass, 0 fail
```
