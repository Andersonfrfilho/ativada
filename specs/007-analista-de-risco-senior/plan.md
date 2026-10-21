# Plano — Spec 007

Fatos conferidos em 2026-10-15 (não repetir a busca):

- **Famílias de regra** (`packages/strategy-engine/src/engine-vocabulary.constant.ts`, `RULE_FAMILY`): `ema_cross`, `macd`,
  `donchian_breakout` → `trend`; `rsi`, `bollinger` → `reversion`; `obv_trend` → `volume`; `fear_greed` → `sentiment`. O
  regime ADX pesa as famílias (`trending`/`ranging`, `FAMILY_WEIGHTS_SCHEMA`). Exportados do motor: `signalStep`,
  `walletStep`, `createEngine`, `castRuleVote`, `computePositionSize`, `computeProtectivePrices`, `ATR_INDICATOR`,
  `compute-indicator-series`, `CLASSIC_SCOREBOARD_STRATEGY` (EMA 9×21, MACD 12/26/9, RSI 14 30/70, OBV EMA 20, ADX 14/25,
  limiar ±2, risco: ATR 14, stop 2×, alvo 3×, `riskPerTrade` 0,01, `maxExposureRate` 1).
- **Tamanho**: `wallet/entry-order.ts` usa `cash × config.risk.riskPerTrade` (configuração com hash, `configHash`). Não há
  como mudar o tamanho por fora sem mudar o motor.
- **Comandos** (`EngineCommand = { commandId, issuedAt, kind, reason }`): `COMMAND_KIND` = `exit_position`, `halt`,
  `resume`; `COMMAND_REASON` = `goal_reached`, `goal_max_loss`, `goal_expired`, `user_stop`, `kill_switch`, `window_end`,
  `user_resume`. `halt` suprime entradas; saídas protetoras continuam. `advanceCandle` (`@ativada/run-recording`) aceita
  `commands` e grava `run_commands`, cuja migration 0008 tem `CHECK` fechado em `kind` e `reason`: **motivo novo = migration
  + vocabulário do motor**.
- **Timeframes do motor**: `ENGINE_TIMEFRAME` = 15m, 1h, 4h, 1d (sem 5m). `MARKET_TIMEFRAMES` padrão `15m,1h,4h,1d`.
- **Vela**: `candles` tem `open/high/low/close numeric(24,8)` e `volume numeric(32,8)`. O parser do kline
  (`market-data-crypto/src/kline.schema.ts`, `kline-stream.schema.ts`) lê `tradeCount` (`n`) e **descarta** ao gravar; o
  volume comprador agressor (`V`) **não é lido**.
- **Custo padrão** (`run-parameters.schema.ts`): `feeRate` 0,001, `slippageRate` 0,0005 por lado.
- **Evidência de 15 min** (spec 003, `evidence.md` T1.4): LINKUSDT 371 operações, −28,84%, taxas 2.310,68 sobre 10.000;
  BNBUSDT −2,88%; fixtures `test/fixtures/strategy-engine/horizon/intraday-metrics-{bnbusdt,linkusdt}-15m.json`.
- **Ao vivo** (spec 001 T4.1, spec 006): só o worker avalia (`apps/worker-ativada/src/live/`: `live-step.ts`,
  `evaluate-live-run.ts`, `load-live-context.ts`); um passo por vela fechada = UMA transação; estado só do checkpoint;
  `runs.request` guarda `goal` e `survival`; `POST /v1/runs` aceita `timeframe` (spec 006).
- **Acerto da tendência**: spec 009 (em execução por outro executor) define `projection-1` e o veredito de Wilson em
  `apps/api-ativada/src/runs/projections/projection-rule.ts` (T1.1 da 009, ainda não feita em 2026-10-15).
- Última migration: `0023_run_stall` (conferir o número livre em `main` na hora; as specs 008/009 podem ter criado outra).

## D1. Onde mora cada peça

| Peça | Lugar | Por quê |
|---|---|---|
| Regra `analyst-1` (pura) | **Pacote novo** `packages/risk-analyst/src/`: `market-readings.ts`, `specialist-team.ts`, `accuracy-auditor.ts`, `wilson-interval.ts` (ou import do lugar único, D3), `team-forecast.ts`, `risk-locks.ts`, `posture-policy.ts`, `analyst-decision.ts` (composição), `analyst-messages.ts`, `analyst.constant.ts` (`ANALYST_RULES`, `ANALYST_VERSION = 'analyst-1'`) | Puro como o motor (sem relógio, I/O, aleatoriedade, locale); usado pelo worker e pelo contrafactual; o teste de fronteira varre o `src` como no motor |
| Passo ao vivo | `apps/worker-ativada/src/live/analyst-step.ts` + leitura `load-analyst-context.ts` | Só o worker avalia (regra do repo) |
| Registro | `packages/database/src/analyst/analyst-decisions.ts` (`userId` no tipo) + schema + migration | Filtro de dono num lugar; mutantes entram ali |
| Rotas | `apps/api-ativada/src/runs/analyst/` (`analyst.route.ts`, `analyst-decisions.route.ts`, `*.docs.ts`, Zod) | Mesmo padrão das rotas de `runs` |
| Contrafactual | `scripts/analyst-counterfactual.ts` + `packages/risk-analyst/test-support/` | Medição, não produto: fora do `src`, pode imprimir |
| Painel | `apps/frontend-ativada/src/runs/analyst/` (`AnalystCard`, `AnalystTeamTable`, `AnalystLocks`, `AnalystHistory`, `analyst.validation.ts`, `analyst.query.ts`) | Ao lado do acompanhamento da spec 008 |

O pacote depende só de `@ativada/strategy-engine` (indicadores e `signalStep`), `decimal.js` e `zod` exatos.

## D2. Especialistas (fechar na T0.1)

- Um especialista = uma **estratégia de uma família só**, validada por `STRATEGY_CONFIG_SCHEMA`, regime `none`, limiar
  `buy: 1, sell: -1`, rodada pelo `signalStep` de produção sobre a série de 15 min do par. Voto = sinal do placar
  (`score > 0` → +1, `< 0` → −1, `0` → 0). Nenhum indicador reimplementado.
- Catálogo `analyst-1` (spec D9): Tendência = EMA 9×21 + MACD 12/26/9 + Donchian 20; Reversão = RSI 14 30/70 + Bollinger
  20/2; Volume = OBV EMA 20; Sentimento = Fear & Greed 25/75 (lido como o motor lê, `observedAt` = disponibilidade).
- A tendência **da estratégia da simulação** entra no auditor como quinto item (`projection-1` da spec 009: lado = sinal
  do placar gravado em `signals.score`), sem peso na equipe (ela é quem pede a entrada; o analista só decide se deixa).
- Série: as últimas **2.880 velas** (30 dias) + o aquecimento do maior período (≤ 200 velas), **uma** leitura por par por
  ronda do worker, compartilhada entre as simulações daquele par. Velas com lacuna: o especialista não vota na vela da
  lacuna (neutro) e a previsão não conta.

## D3. Auditor e Wilson

- Previsão em `t` com voto ≠ 0; resultado com o fechamento de `t+1` (D13): `hit` se andou para o lado, `miss` no
  contrário, `tie` igual (não conta). Janela: previsões com `t+1 ≤` última vela fechada, nos últimos 30 dias.
- Wilson 95% (z = 1,96, decimal com 12 casas, `EngineDecimal`): `too_few` < 30 contadas; `above` se inferior > 0,5;
  `below` se superior < 0,5; senão `even`. Taxas com 2 casas para baixo. "Sempre sobe" = fração de `close(t+1) > close(t)`.
- Peso = `inferior − 0,5` só em `above`, senão 0 (D4-A); D4-B = `too_few` com metade do peso médio dos aprovados.
- **Um só Wilson no repo**: se a T1.1 da spec 009 já existir, mover a função para `packages/risk-analyst/src/wilson-interval.ts`
  **não** é desta spec (não tocar nos arquivos da 009): importar dela ou criar aqui e registrar no ADR qual é o lugar único,
  para a 009 importar depois. A T0.1 decide e registra.

## D4. Regra `analyst-1` (números em `ANALYST_RULES`, dourado literal)

Entrada pura: `{ candles (≤ t), sentiment, runParameters, strategyRisk, wallet: { cash, position, closedPositionsLast24h,
openedCandleTime }, goal, lastPosture, candleTime }`. Saída: `AnalystDecision` (D6).

| Etapa | Regra |
|---|---|
| 1. Dado | Lacuna, aquecimento, espera por dado (`waitingForData`) ou vela atrasada → `pause`, motivo `no_data` |
| 2. Travas (D7-A) | perda realizada + não realizada em 24 h ≥ 1% do inicial; 3 perdas seguidas (pausa de 4 velas desde a última); 8 entradas em 24 h; `lossRoom < 2 × riskPerTrade × saldo`; `ATR% ÷ custo < 2` → `pause` com o motivo da primeira trava, nesta ordem |
| 3. Ritmo | volume relativo (vela ÷ média de 96): `< 0,4` → `pause` (`quiet_market`); `< 0,7` → 4 h; `< 1,5` → 1 h; senão 15 min. Entrada só em vela cujo fechamento (`t + 15 min`, UTC) é múltiplo do ritmo |
| 4. Equipe | soma ponderada; "sem previsão" pelos motivos da RF06 (`no_proven_specialist`, `split_team`, `too_volatile` com ATR% > p95, `no_data`) |
| 5. Postura | equipe contra → `pause` (`team_against`); sem previsão → `caution` (¼); a favor fraca → `normal` (½); a favor firme + volume ≥ 1 + ATR% ≤ p90 → `confident` (1) |
| 6. Saída por tempo | posição aberta há 4 velas (aberta em `t−3` ou antes) → `exit_position` (`analyst_time_exit`) |
| 7. Comandos | `pause` ou vela fora do ritmo → `halt` (se não estava); dentro do ritmo e postura ≠ `pause` → `resume` (se estava); `scale_risk` com a fração (D2-A); `commandId = analyst:<runId>:<candleTime>:<kind>` (idempotente) |

Percentis por posição (nearest-rank) sobre os ATR% das 2.880 velas; comparações em decimal pelo texto arredondado a 12
casas. Nenhum comando de entrada: o analista nunca compra.

## D5. Passo ao vivo (sombra e governar)

- No `live-step`, **antes** do `advanceCandle` da vela `t` de uma simulação com `runs.request.analyst`: carregar o contexto
  (velas do par da ronda, `equity_points`/`positions` das últimas 24 h, meta), calcular `AnalystDecision` e gravar a linha
  em `analyst_decisions` **na mesma transação** do passo. Retomada: `(run_id, candle_time)` único; a vela já decidida é
  lida, não recalculada.
- **Sombra** (`mode: shadow`): os comandos ficam em `wouldCommands`, nada vai ao `advanceCandle`. Falha do analista grava
  `status: failed` com o código estável e o passo segue (a simulação nunca para por causa da sombra).
- **Governar** (`mode: govern`, só com a §9 autorizada): os comandos entram em `advanceCandle({ commands })`; falha do
  analista → decisão `pause` com motivo `analyst_failed` (falha segura) e o passo segue.
- Evento `pg_notify` `analyst` na transação (aviso `runs` invalida a raiz no painel; sem polling).

## D6. Registro (`analyst_decisions`, migration aditiva — exige autorização, D3-A)

`id uuid`, `user_id`, `run_id` (FK composta `(run_id, user_id)` RESTRICT), `candle_time bigint`, `version text`
(`analyst-1`), `mode text` (`shadow`/`govern`, VARCHAR com CHECK, sem ENUM), `status` (`decided`/`failed`), `posture`,
`cadence_minutes int`, `risk_scale numeric`, `forecast jsonb` (lado, força, motivo de "sem previsão"), `readings jsonb`,
`specialists jsonb` (`[{ key, vote, counted, hits, hitRate, lower, upper, verdict, weight }]`), `locks jsonb`, `commands
jsonb` (dados ou que daria), `message text`, `failure_code text null`, `created_at`. Único `(run_id, candle_time)`, índice
`(user_id, run_id, candle_time DESC)`. Entra em `ownership-registry`, exportação e purga LGPD (antes de `runs`).

## D7. Contrato das rotas (fechar na T0.1)

`GET /v1/runs/:runId/analyst` → `200 { data }`: `{ version, mode, current: AnalystDecisionView | { unavailable:
not_running|no_candle|warming_up, message }, goalProgress: { targetRate, summedRate, remainingRate, trades, message } |
null, locks: [{ key, current, limit, isActive, message }] }`. `GET /v1/runs/:runId/analyst/decisions?cursor=&limit=` →
`{ data: AnalystDecisionView[], pagination: { nextCursor, perPage } }` (24, teto 100, cursor `encodeTimeCursor`).
`AnalystDecisionView = { candleTime, closedAt, posture, cadenceMinutes, riskScale, maxTradeMinutes, forecast,
specialists, readings, commands, isShadow, message }`, decimais em texto, instantes em ms UTC, frases sem hora (o painel
monta a hora no fuso, spec 008 L9). Erros: `404 RUN_NOT_FOUND` (alheia, inexistente, malformada, apagada); `409
RUN_NOT_LIVE` (outro tipo); `409 ANALYST_NOT_ENABLED` (sem analista); `400` com todos os erros, sem eco. Política
`RUN_LIVE_STATUS` (60/min, o mesmo balde da spec 008). ≤ 4 consultas por chave com `LIMIT`.

## D8. Governar: a mudança no motor (só com autorização — T4.1)

- `COMMAND_REASON` ganha `analyst_pause`, `analyst_resume`, `analyst_time_exit`; com D2-A, `COMMAND_KIND` ganha
  `scale_risk` e `EngineCommand` um campo opcional `riskScale` (texto decimal ∈ {0, 0,25, 0,5, 1}); o `entry-order` usa
  `cash × riskPerTrade × riskScale` (estado da carteira guarda o último `riskScale`, padrão 1). Versão nova do motor
  (`ENGINE_VERSION`), dourado regravado, harness de 21 verificações, diferencial contra a referência, mutantes.
- Migration aditiva: `run_commands_kind_check` e `run_commands_reason_check` com os valores novos (+ `.rollback.sql`).
- Backtest: o contrafactual e (fora do escopo pela tela) o backtest chamam o MESMO `packages/risk-analyst` antes do
  `advanceCandle`; `make live-test` ganha a paridade backtest × ao vivo com o analista.

## D9. Contrafactual (RF12)

Script em memória (sem gravar `runs`, como a linha de 15 min da spec 003): para cada par (LINK, BNB, BTC, ETH), 6 meses de
15 min do banco de desenvolvimento, Placar clássico e "Momentum rápido" (as estratégias de 15 min já medidas na spec 003):
(a) estratégia sozinha; (b) com o analista usando os comandos que o motor **já tem** (`halt`/`resume`/`exit_position`
com um motivo qualquer, porque nada é gravado); (c) com D2-A só se o motor já tiver o comando. Mede líquido, taxas,
operações, maior queda pelo vale, % do tempo em pausa e o veredito D11 sobre janelas de 7 dias. Resultado literal em
`evidence.md`; nenhuma afirmação além do veredito.

## D10. Fase 2 (cada fonte = especialista novo, que começa com peso 0 até o auditor aprovar)

| Fonte | Dado | Custo | Autorização |
|---|---|---|---|
| Hora do dia | `candle_time` | nenhum | não |
| Correlação com BTC | velas de BTCUSDT 15m (já backfill) | leitura extra por ronda | não |
| Número de transações, lado agressor | kline `n` e `V` | migration em `candles` (`trade_count int null`, `taker_buy_base_volume numeric(32,8) null`) + parser + backfill que preenche só o que falta | **migration** |
| Livro de ofertas | stream `<par>@depth20@100ms` | conexão nova, fotos por vela (`order_book_snapshots`), retenção | **migration + retenção** |
| Funding, open interest | API de futuros da Binance | domínio/contrato novo | **fonte externa** |
| Dominância do BTC, notícias | fonte externa (a escolher) | chave, contrato, licença | **fonte externa + chave** |

Velas antigas sem `trade_count` ficam `null` (especialista neutro); nenhuma fonte externa é chamada em teste (dublê local
como a Binance falsa).

## D11. Testes e mutantes

- Puros (`packages/risk-analyst`): contas à mão por etapa da D4; Wilson nas bordas; propriedades (2.000 sorteios: tamanho
  ≤ 1; equipe contra nunca dá entrada; trava ativa sempre dá `pause`; saída nunca bloqueada; corte da série no meio dá a
  mesma decisão; mesma entrada → mesma saída); dourado literal (os conjuntos reais do motor, `btcusdt-1h-500` e
  `ethusdt-1d-400`, não são de 15 min: o dourado usa um recorte real de 15 min gravado na T0.2 em
  `test/fixtures/risk-analyst/` e um sintético de 3.000 velas; o analista também roda nos dois conjuntos reais tratando a
  vela deles como base, só para o oráculo do auditor); oráculo do auditor em
  `test/fixtures/risk-analyst/` (TS puro, sem importar `src`); teste de fronteira (sem `Date`, `Math.random`, `console`).
- Mutantes `test/risk-analyst-mutants.contract.test.ts` (≥ 20): limiar 30 → 29, `>` → `≥` no Wilson, peso de `even`
  ≠ 0, trava ignorada, ordem das travas, tamanho > 1, volume relativo com a vela atual na média (lookahead), saída por
  tempo na 4ª vela, equipe contra virando `caution`, percentil por interpolação, `t+1` trocado por `t`.
- Banco (`make database-test`): isolamento, único por vela, FK composta, LGPD (`make lgpd-test`).
- Worker (`loadLiveApi()`/fixture nova `loadAnalystLiveParts()`): sombra não muda `fills` (comparação byte a byte com a
  simulação sem analista nos conjuntos reais), retomada sem duplicar, falha da sombra não para o passo.
- Rotas (`loadApiApp()`): feliz, `404` entre usuários, `409` dos dois tipos, `400` sem eco, ≤ 4 consultas; `api-openapi`;
  mutantes do filtro de dono em `scripts/api-runs-mutants.ts` (+2).
- Painel: contratos com fixture (estados, frases literais, tabela da equipe, 375 px por classe, contraste); E2E.

## D12. Gates

Como nas specs anteriores: `bun run typecheck` + `bun run lint` + testes (`make check`, o script `test` do painel com os
arquivos novos na lista explícita, o alvo `make` da task) + commit isolado. **Rodar no Linux/WSL** num espelho em disco
Linux (spec 003 plan D6). Pacote novo entra nos workspaces, no `tsconfig` da raiz e na regra de tamanho do lint
(`packages/*/src`). Nenhuma dependência nova além das já usadas (`decimal.js@10.6.0`, `zod@4.6.5`, exatas).
