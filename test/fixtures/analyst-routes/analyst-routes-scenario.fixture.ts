// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AnalystDecisionRecord,
  JsonContainer,
  JsonValue,
  RunRecord,
} from '../../../packages/database/src/index.js';
import {
  toDecidedRecord,
  toFailedRecord,
} from '../../../apps/worker-ativada/src/live/analyst-record.js';
import { ANALYST_GOLDEN } from '../risk-analyst/analyst-golden.fixture.js';
import type { RunsHarness } from '../api-routes/runs-harness.fixture.js';
import { HOUR, NOW } from '../api-routes/runs-harness.fixture.js';
import { buildReferenceRun } from '../strategy-engine/engine-scenarios.fixture.js';

// A simulação de 15 min começou há 50 h: a decisão `index` é da vela que abre em `at(index)` e fecha 15 min depois.
export const ANALYST_CANDLE = 900_000;
export const ANALYST_PERIOD_START = NOW - 50 * HOUR;
export const analystAt = (index: number): number =>
  ANALYST_PERIOD_START - ANALYST_CANDLE + index * ANALYST_CANDLE;
export const ANALYST_INITIAL_BALANCE = '1000';
export const ANALYST_SYMBOL = 'BTCUSDT';

export type GoldenCase = {
  readonly decision: Record<string, unknown>;
  readonly messages: {
    readonly postureLine: string;
    readonly offCadenceMessage: string | null;
    readonly cadenceLine: string | null;
    readonly reasonMessage: string;
    readonly lockLines: readonly string[];
    readonly specialists: readonly {
      readonly label: string;
      readonly vote: string;
      readonly accuracy: string;
      readonly situation: string;
      readonly weight: string;
    }[];
    readonly timeExitMessage: string | null;
    readonly disclaimer: string;
  };
};

export function readGoldenCase(name: string): GoldenCase {
  const text = ANALYST_GOLDEN[name];
  if (text === undefined) throw new Error(`caso dourado ausente: ${name}`);
  return JSON.parse(text) as GoldenCase;
}

function toJsonContainer(value: unknown): JsonContainer {
  return JSON.parse(JSON.stringify(value)) as JsonContainer;
}

export type AnalystRunOptions = {
  readonly subject: string;
  readonly status?: RunRecord['status'];
  readonly kind?: RunRecord['kind'];
  readonly hasAnalyst?: boolean;
  readonly mode?: string;
  readonly goal?: { targetRate: string; maxLossRate: string; horizonDays: number };
  readonly lastCandleIndex?: number | undefined;
};

// Uma simulação de 15 min do dono, rodando, com o analista em sombra (e, se pedido, a meta) gravados em `runs.request`.
export async function createAnalystRun(
  harness: RunsHarness,
  options: AnalystRunOptions,
): Promise<string> {
  const { versionId } = await harness.seedStrategy(
    options.subject,
    `analyst-${crypto.randomUUID()}`,
  );
  const parameters = buildReferenceRun({ symbol: ANALYST_SYMBOL, timeframe: '15m' }).parameters;
  const request = {
    ...(options.hasAnalyst === false
      ? {}
      : { analyst: { version: 'analyst-1', mode: options.mode ?? 'shadow' } }),
    ...(options.goal === undefined ? {} : { goal: options.goal }),
  };
  const created = await harness.runs.repository.createRun(harness.scopeOf(options.subject), {
    strategyVersionId: versionId,
    kind: options.kind ?? 'live_paper',
    symbol: ANALYST_SYMBOL,
    timeframe: '15m',
    runParameters: toJsonContainer({ ...parameters, initialBalance: ANALYST_INITIAL_BALANCE }),
    runHash: 'h'.repeat(64),
    engineVersion: 'engine-2',
    signalEngineVersion: 'signal-2',
    metricsVersion: 'metrics-1',
    periodStart: ANALYST_PERIOD_START,
    periodEnd: options.kind === undefined || options.kind === 'live_paper' ? undefined : NOW,
    migratedFromRunId: undefined,
    ...(Object.keys(request).length === 0 ? {} : { request }),
    ...(options.goal === undefined ? {} : { goalId: crypto.randomUUID() }),
  });
  if (created === undefined) throw new Error('execução semente não criada');
  harness.runs.updateRun(created.id, {
    status: options.status ?? 'running',
    startedAt: new Date(ANALYST_PERIOD_START + 1_800_000),
    ...(options.lastCandleIndex === undefined
      ? {}
      : { lastCandleTime: analystAt(options.lastCandleIndex) }),
  });
  return created.id;
}

function undefinedToNull<TValue>(value: TValue | undefined): TValue | null {
  return value === undefined ? null : value;
}

// A linha como a tabela a devolve: o que o worker grava (`toDecidedRecord`) com `undefined` virando `null`.
function toRecord(input: ReturnType<typeof toDecidedRecord>): AnalystDecisionRecord {
  return {
    runId: input.runId,
    candleTime: input.candleTime,
    version: input.version,
    mode: input.mode,
    status: input.status,
    posture: undefinedToNull(input.posture),
    reason: undefinedToNull(input.reason),
    cadenceMinutes: undefinedToNull(input.cadenceMinutes),
    entryGate: undefinedToNull(input.entryGate),
    riskScale: undefinedToNull(input.riskScale),
    isTimeExitDue: undefinedToNull(input.isTimeExitDue),
    forecast: input.forecast as JsonValue,
    readings: input.readings as JsonValue,
    specialists: input.specialists as JsonValue,
    locks: input.locks as JsonValue,
    commands: input.commands as JsonValue,
    message: undefinedToNull(input.message),
    failureCode: undefinedToNull(input.failureCode),
    createdAt: new Date(NOW),
  };
}

// Uma decisão REAL da regra (dourado analyst-1), com o instante dela, gravada como o worker grava.
export function goldenRecord(params: {
  readonly runId: string;
  readonly name: string;
}): AnalystDecisionRecord {
  const golden = readGoldenCase(params.name);
  return toRecord(
    toDecidedRecord({ runId: params.runId, decision: toJsonDecision(golden.decision) }),
  );
}

function toJsonDecision(
  decision: Record<string, unknown>,
): Parameters<typeof toDecidedRecord>[0]['decision'] {
  return decision as unknown as Parameters<typeof toDecidedRecord>[0]['decision'];
}

export function failedRecord(params: {
  readonly runId: string;
  readonly index: number;
}): AnalystDecisionRecord {
  return toRecord(
    toFailedRecord({
      runId: params.runId,
      candleTime: analystAt(params.index),
      failureCode: 'ANALYST_SERIES_UNAVAILABLE',
    }),
  );
}
