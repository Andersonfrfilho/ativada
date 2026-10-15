// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  EquityPointInput,
  JsonContainer,
  PositionInput,
  RunRecord,
  SignalInput,
} from '../../../packages/database/src/index.js';
import {
  buildHourlyCandles,
  HOUR,
  NOW,
  type RunsHarness,
} from '../api-routes/runs-harness.fixture.js';
import { buildReferenceRun } from '../strategy-engine/engine-scenarios.fixture.js';

// A linha do tempo dos contratos do acompanhamento: a simulação começou há 50 h, então a vela `at(0)` (a primeira decisão,
// `period_start − d`) abriu 51 h antes de `NOW` e a decisão `index` fecha em `at(index) + HOUR`.
export const PERIOD_START = NOW - 50 * HOUR;
export const at = (index: number): number => PERIOD_START - HOUR + index * HOUR;
export const INITIAL_BALANCE = '1000';
export const SYMBOL = 'BTCUSDT';

export type Vote = -1 | 0 | 1;
export type ClassicVotes = readonly [ema: Vote, macd: Vote, rsi: Vote, obv: Vote];

// Pesos da família no regime lateral (ADX 20 < 25) do Placar clássico do harness, na ordem das regras.
const RANGING_WEIGHTS = ['0.5', '0.5', '1.5', '1'] as const;
const RULE_IDS = ['ema-9-21', 'macd-12-26-9', 'rsi-14', 'obv-ema-20'] as const;
const FAMILIES = ['trend', 'trend', 'reversion', 'volume'] as const;

export const CLASSIC_CANDLES = buildHourlyCandles({
  symbol: SYMBOL,
  count: 60,
  firstOpenTime: at(0),
});

// O que cada regra leu naquela vela, de modo que o voto reproduzido pelo motor seja exatamente `votes`.
function classicIndicators(votes: ClassicVotes): Record<string, number | null> {
  const [ema, macd, rsi, obv] = votes;
  return {
    'rule:ema-9-21.fast': 11 + ema,
    'rule:ema-9-21.slow': 11,
    'rule:macd-12-26-9.macd': macd === 0 ? 0.2 : 0.5 * macd,
    'rule:macd-12-26-9.signal': 0.2 * (macd === -1 ? -1 : 1),
    'rule:rsi-14': 55 - 30 * rsi,
    'rule:obv-ema-20.obv': 100 + 10 * obv,
    'rule:obv-ema-20.ema': 100,
    'risk:atr': 1.5,
    'regime:adx.adx': 20,
  };
}

export function decisionRow(index: number, votes: ClassicVotes): SignalInput {
  const score = votes.reduce<number>(
    (sum, vote, position) => sum + vote * Number(RANGING_WEIGHTS[position]),
    0,
  );
  const action = score >= 2 ? 'BUY' : score <= -2 ? 'SELL' : 'HOLD';
  return {
    candleTime: at(index),
    action,
    score: String(score),
    regime: 'ranging',
    votes: votes.map((vote, position) => ({
      ruleId: RULE_IDS[position] ?? '',
      family: FAMILIES[position] ?? 'trend',
      vote,
      weight: RANGING_WEIGHTS[position] ?? '1',
      isMissing: false,
    })),
    indicators: classicIndicators(votes),
    sentimentObservation: undefined,
    reason: `Técnico ${index} · pontuação ${score}`,
  };
}

export function equityRow(index: number, equity: string, benchmark: string): EquityPointInput {
  return { candleTime: at(index), equity, equityAtLow: equity, benchmark };
}

export function positionRow(params: {
  readonly key: string;
  readonly openedIndex: number;
  readonly closedIndex: number | undefined;
  readonly exitReason?: PositionInput['exitReason'];
}): PositionInput {
  const isClosed = params.closedIndex !== undefined;
  return {
    engineKey: params.key,
    status: isClosed ? 'closed' : 'open',
    entryPrice: '30000.50000000',
    quantity: '0.03300000',
    stopPrice: '29000.00000000',
    targetPrice: '31500.00000000',
    entryFee: '0.99000000',
    exitPrice: isClosed ? '30500' : undefined,
    exitFee: isClosed ? '1.00' : undefined,
    netProfit: isClosed ? '14.00' : undefined,
    exitReason: isClosed ? (params.exitReason ?? 'signal') : undefined,
    openedCandleTime: at(params.openedIndex),
    closedCandleTime: params.closedIndex === undefined ? undefined : at(params.closedIndex),
  };
}

function toJsonContainer(value: unknown): JsonContainer {
  return JSON.parse(JSON.stringify(value)) as JsonContainer;
}

export type LiveRunOptions = {
  readonly subject: string;
  readonly status?: RunRecord['status'];
  readonly kind?: RunRecord['kind'];
  readonly goal?: { targetRate: string; maxLossRate: string; horizonDays: number };
  readonly versionId?: string;
};

// Uma execução do dono, rodando por padrão, com o saldo inicial de 1.000 e a vela de 1 hora.
export async function createLiveRun(
  harness: RunsHarness,
  options: LiveRunOptions,
): Promise<string> {
  const versionId =
    options.versionId ??
    (await harness.seedStrategy(options.subject, `live-${crypto.randomUUID()}`)).versionId;
  const parameters = { ...buildReferenceRun({ symbol: SYMBOL, timeframe: '1h' }).parameters };
  const created = await harness.runs.repository.createRun(harness.scopeOf(options.subject), {
    strategyVersionId: versionId,
    kind: options.kind ?? 'live_paper',
    symbol: SYMBOL,
    timeframe: '1h',
    runParameters: toJsonContainer({ ...parameters, initialBalance: INITIAL_BALANCE }),
    runHash: 'h'.repeat(64),
    engineVersion: 'engine-2',
    signalEngineVersion: 'signal-2',
    metricsVersion: 'metrics-1',
    periodStart: PERIOD_START,
    periodEnd: options.kind === undefined || options.kind === 'live_paper' ? undefined : NOW,
    migratedFromRunId: undefined,
    ...(options.goal === undefined
      ? {}
      : { request: { goal: options.goal }, goalId: crypto.randomUUID() }),
  });
  if (created === undefined) throw new Error('execução semente não criada');
  harness.runs.updateRun(created.id, {
    status: options.status ?? 'running',
    startedAt: new Date(PERIOD_START + 1_800_000),
  });
  return created.id;
}

export function seedDecisions(
  harness: RunsHarness,
  runId: string,
  rows: readonly { readonly signal: SignalInput; readonly equity: EquityPointInput }[],
): void {
  harness.runs.seed(
    runId,
    'signals',
    rows.map((row) => row.signal),
  );
  harness.runs.seed(
    runId,
    'equity',
    rows.map((row) => row.equity),
  );
  const last = rows.at(-1);
  if (last !== undefined) harness.runs.updateRun(runId, { lastCandleTime: last.signal.candleTime });
}
