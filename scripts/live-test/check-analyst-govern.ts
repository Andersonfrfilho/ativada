// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createRunBatchRepository,
  createRunRepository,
  RUN_KIND,
} from '../../packages/database/src/index.js';
import {
  appendDecisions,
  createBatchBuffer,
  createPositionTracker,
  parseJsonContainer,
  toRunResultRows,
} from '../../packages/run-recording/src/index.js';
import {
  createRunSetup,
  createStrategyVersion,
  ENGINE_VERSION,
  METRICS_VERSION,
  SIGNAL_ENGINE_VERSION,
} from '../../packages/strategy-engine/src/index.js';
import {
  ANALYST_GOVERN_REQUEST,
  ANALYST_REAL_DATASET,
} from '../../test/fixtures/live/analyst-real-data.fixture.js';
import {
  loadClassicRunParameters,
  loadClassicScoreboard,
} from '../../test/fixtures/strategy-engine/engine-scenarios.fixture.js';
import { simulate } from '../analyst-counterfactual/simulation.js';
import { resultRowsDigest } from './check-analyst.js';
import {
  assertCondition,
  cancelRun,
  createLiveRun,
  createLiveUser,
  createProductionEvaluator,
  errorsOf,
  LEAD_IN_CANDLES,
  readProgress,
  reportLine,
  seedCandles,
  tickUntilQuiet,
  type LiveTestContext,
  type LiveUser,
} from './live-test-context.js';

// T4.2c da spec 007 (ADR 0002 A21): o analista GOVERNANDO a simulação ao vivo contra o Postgres e o worker de produção. As
// velas chegam UMA POR VEZ (entregues todas de uma vez, toda vela vira `late_candle`, pausa por atraso) e as linhas que a
// simulação deixa (sinais, ordens, preenchimentos, posições, patrimônio e comandos) são IDÊNTICAS às do laço em memória da T4.2a,
// o mesmo que o contrafactual usa, gravadas pelo mesmo repositório.

const SYMBOL = 'ETHUSDT';
const TIMEFRAME = '15m';
const CRASH_AFTER_COMMITS = 1_500;
// O teto de 50 ms (p95) do analista é provado em `test/live-analyst-performance.contract.test.ts`; aqui a ronda inteira com o banco é
// medida e só reprovada acima de um teto folgado, porque o relógio de uma máquina ocupada não é contrato.
const BUDGET_MILLISECONDS = 150;
const PERCENTILE = 0.95;
const RETRIES_AFTER_A_DROP = 3;
// Com o custo do exemplo a regra pausa em toda vela do recorte; com taxas mínimas ela libera a cautela de 1/4.
const COSTS = { feeRate: '0.00001', slippageRate: '0.00001' };
const GOVERN_REQUEST = parseJsonContainer(JSON.stringify({ analyst: ANALYST_GOVERN_REQUEST }));

type CountRow = { readonly total: string };

function crashOnce(afterCommits: number): (runId: string) => Promise<void> {
  let commits = 0;
  let isCrashed = false;
  return () => {
    commits += 1;
    if (commits > afterCommits && !isCrashed) {
      isCrashed = true;
      return Promise.reject(Object.assign(new Error('conexão perdida'), { code: '08006' }));
    }
    return Promise.resolve();
  };
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)] ?? 0;
}

async function count(context: LiveTestContext, sql: string, runId: string): Promise<number> {
  const rows: unknown = await context.client.unsafe(sql, [runId]);
  return Number((rows as readonly CountRow[])[0]?.total ?? 0);
}

// A simulação ao vivo de produção, uma vela por vez; uma queda de conexão no meio é retentada na ronda seguinte.
async function runDeliveringOneByOne(
  context: LiveTestContext,
  user: LiveUser,
): Promise<{ readonly runId: string; readonly durations: readonly number[] }> {
  const first = ANALYST_REAL_DATASET.candles[LEAD_IN_CANDLES];
  if (first === undefined) throw new Error('sem vela de partida');
  // O aquecimento precisa estar no banco para a simulação nascer; cada ronda processa UMA vela (`maxStepsPerPass: 1`).
  await seedCandles(context, ANALYST_REAL_DATASET.candles.slice(0, LEAD_IN_CANDLES), {
    symbol: SYMBOL,
  });
  const run = await createLiveRun(context, {
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    periodStart: first.openTime,
    user,
    request: GOVERN_REQUEST,
    costs: COSTS,
  });
  const { evaluator, entries } = createProductionEvaluator(context, {
    instanceId: 'analyst-govern',
    maxStepsPerPass: 1,
    beforeCommit: crashOnce(CRASH_AFTER_COMMITS),
  });
  const durations: number[] = [];
  for (const [index, candle] of ANALYST_REAL_DATASET.candles.entries()) {
    if (index >= LEAD_IN_CANDLES) await seedCandles(context, [candle], { symbol: SYMBOL });
    for (let attempt = 0; attempt < RETRIES_AFTER_A_DROP; attempt += 1) {
      const started = performance.now();
      const summary = await evaluator.tick();
      if (summary.failed > 0) {
        const progress = await readProgress(context, run.id);
        throw new Error(
          `a simulação falhou: ${progress.errorCode ?? 'sem código'} na vela ${candle.openTime}`,
        );
      }
      if (summary.steps === 0) continue;
      durations.push(performance.now() - started);
      break;
    }
  }
  await tickUntilQuiet(evaluator);
  assertCondition(
    errorsOf(entries).length === 0,
    `o avaliador registrou erro: ${errorsOf(entries).slice(0, 3).join(' | ')}`,
  );
  await cancelRun(context, { runId: run.id, user });
  return { runId: run.id, durations };
}

// O laço em memória da T4.2a (o do contrafactual) sobre as mesmas velas e o mesmo custo, gravado como a produção grava.
async function recordInMemoryReference(context: LiveTestContext, user: LiveUser): Promise<string> {
  const setup = createRunSetup({
    ...loadClassicRunParameters(),
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    ...COSTS,
  });
  const candles = ANALYST_REAL_DATASET.candles.map((candle) => ({ ...candle, symbol: SYMBOL }));
  const buffer = createBatchBuffer();
  const tracker = createPositionTracker(null);
  await simulate({
    strategy: createStrategyVersion(loadClassicScoreboard()),
    setup,
    pair: { market: { ...ANALYST_REAL_DATASET.market, symbol: SYMBOL }, candles, observations: [] },
    firstIndex: 0,
    withAnalyst: true,
    onStep: (result) => appendDecisions({ buffer, decisions: result.decisions, tracker }),
  });
  const last = candles.at(-1);
  const run = await createRunRepository(context.handle).createRun(user.scope, {
    strategyVersionId: user.versionId,
    kind: RUN_KIND.BACKTEST,
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    runParameters: parseJsonContainer(JSON.stringify(setup.parameters)),
    runHash: setup.runHash,
    engineVersion: ENGINE_VERSION,
    signalEngineVersion: SIGNAL_ENGINE_VERSION,
    metricsVersion: METRICS_VERSION,
    periodStart: candles[0]?.openTime ?? 0,
    periodEnd: (last?.closeTime ?? 0) + 1,
    migratedFromRunId: undefined,
  });
  if (run === undefined) throw new Error('execução de referência não foi criada');
  const rows = toRunResultRows(buffer);
  await createRunBatchRepository(context.handle).runInBatch(user.scope, run.id, (writer) =>
    writer.appendResults(rows),
  );
  return run.id;
}

export async function checkAnalystGovern(context: LiveTestContext): Promise<void> {
  const user = await createLiveUser(context, 'analyst-govern');
  const live = await runDeliveringOneByOne(context, user);
  const referenceRunId = await recordInMemoryReference(context, user);
  const total = ANALYST_REAL_DATASET.candles.length;
  const decisions = await count(
    context,
    "SELECT count(*)::text AS total FROM analyst_decisions WHERE run_id = $1 AND mode = 'govern' AND status = 'decided'",
    live.runId,
  );
  assertCondition(decisions === total, `${decisions} decisões govern, esperado ${total}`);
  const late = await count(
    context,
    "SELECT count(*)::text AS total FROM analyst_decisions WHERE run_id = $1 AND message LIKE '%atrasada%'",
    live.runId,
  );
  assertCondition(late === 0, `${late} velas entregues em atraso: a entrega não foi vela por vela`);
  const scaled = await count(
    context,
    'SELECT count(*)::text AS total FROM analyst_decisions WHERE run_id = $1 AND risk_scale = 0.25',
    live.runId,
  );
  const timeouts = await count(
    context,
    "SELECT count(*)::text AS total FROM run_commands WHERE run_id = $1 AND reason = 'analyst_timeout'",
    live.runId,
  );
  const entries = await count(
    context,
    "SELECT count(*)::text AS total FROM orders WHERE run_id = $1 AND purpose = 'entry'",
    live.runId,
  );
  assertCondition(
    scaled > 0 && timeouts > 0 && entries > 0,
    `o recorte não exercitou o governar (tamanho 1/4: ${scaled}, saídas por tempo: ${timeouts}, entradas: ${entries})`,
  );
  const liveDigest = await resultRowsDigest(context, live.runId);
  assertCondition(
    liveDigest === (await resultRowsDigest(context, referenceRunId)),
    'as linhas do ao vivo (sinais, ordens, preenchimentos, posições, patrimônio, comandos) diferem do laço em memória',
  );
  const p50 = percentile(live.durations, 0.5);
  const p95 = percentile(live.durations, PERCENTILE);
  assertCondition(
    p95 <= BUDGET_MILLISECONDS,
    `a ronda de uma simulação custou ${p95.toFixed(1)} ms (p95), teto ${BUDGET_MILLISECONDS} ms`,
  );
  reportLine(
    `(T4.2c) analista GOVERNANDO: ${total} velas de 15 min entregues UMA POR VEZ (nenhuma em atraso), ${decisions} decisões em modo govern (${scaled} com tamanho 1/4, ${entries} entradas, ${timeouts} saídas por tempo) e uma queda de conexão na vela ${CRASH_AFTER_COMMITS}; sinais, ordens, preenchimentos, posições, patrimônio e comandos IDÊNTICOS ao laço em memória da T4.2a, byte a byte (digest ${liveDigest.slice(0, 16)}); ronda de uma simulação com Postgres de verdade: p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms (a ronda inteira; o teto de 50 ms do analista é do contrato de desempenho)`,
  );
}
