// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createEngine,
  createInitialWalletState,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  type EngineCandle,
  type RunSetup,
  type SentimentObservation,
  type SignalDecision,
  type StrategyVersion,
} from '../../../../packages/strategy-engine/src/index.js';

// O oráculo das metas: um laço ingênuo que NÃO importa nada do `src/goal`. Cada janela refaz a carteira do zero a
// cada candle (sem trajetória compartilhada, sem atalho de carteira parada), o sinal sai do motor COMPLETO
// (`step`) e toda a estatística é aritmética inteira em BigInt (casas de 1e-8), sem decimal.js.
const SCALE = 100_000_000n;
const PLACES = 8;
const DAY = 86_400_000n;

export type OracleGoal = {
  readonly targetRate: string;
  readonly maxLossRate: string;
  readonly horizonDays: number;
};

export type OracleParams = {
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  readonly candles: readonly EngineCandle[];
  readonly goal: OracleGoal;
  readonly sentiments?: readonly (SentimentObservation | undefined)[] | undefined;
};

export type OracleEvaluation = {
  readonly horizonCandles: number;
  readonly levels: { readonly target: string; readonly stop: string };
  readonly windowCount: number;
  readonly firstWindowOpenTime: number | null;
  readonly lastWindowOpenTime: number | null;
  readonly reachedCount: number;
  readonly stoppedCount: number;
  readonly expiredCount: number;
  readonly reachRate: string | null;
  readonly stopRate: string | null;
  readonly expiredRate: string | null;
  readonly medianCandlesToTarget: string | null;
  readonly medianDaysToTarget: string | null;
  readonly netReturn: { readonly mean: string | null; readonly median: string | null };
  readonly benchmark: {
    readonly reachedCount: number;
    readonly stoppedCount: number;
    readonly reachRate: string | null;
    readonly stopRate: string | null;
  };
  readonly verdict: OracleVerdict;
};

export function toScaled(text: string): bigint {
  const negative = text.startsWith('-');
  const [whole = '0', fraction = ''] = text.replace('-', '').split('.');
  const scaled = BigInt(whole) * SCALE + BigInt(fraction.padEnd(PLACES, '0').slice(0, PLACES));
  return negative ? -scaled : scaled;
}

function floorDivide(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const hasRemainder = numerator % denominator !== 0n;
  return hasRemainder && numerator < 0n !== denominator < 0n ? quotient - 1n : quotient;
}

function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  return -floorDivide(-numerator, denominator);
}

export function scaledToText(value: bigint, places = PLACES): string {
  const unit = 10n ** BigInt(places);
  const sign = value < 0n ? '-' : '';
  const magnitude = value < 0n ? -value : value;
  const whole = magnitude / unit;
  const fraction = (magnitude % unit).toString().padStart(places, '0').replace(/0+$/, '');
  return `${sign}${whole}${fraction === '' ? '' : `.${fraction}`}`;
}

export type OracleVerdict = 'COMPRAR' | 'SEGURAR' | 'EVITAR';

type Point = { readonly equity: bigint; readonly equityAtLow: bigint; readonly benchmark: bigint };
type Outcome = 'reached' | 'stopped' | 'expired';
type Result = { readonly outcome: Outcome; readonly elapsed: number; readonly finalValue: bigint };

function decideSignals(params: OracleParams): (SignalDecision | null)[] {
  const engine = createEngine();
  const { strategy, run } = params;
  let state = engine.createInitialState({ strategy, run });
  const signals: (SignalDecision | null)[] = [];
  for (const [index, candle] of params.candles.entries()) {
    const result = engine.step({
      strategy,
      run,
      state,
      candle,
      sentiment: params.sentiments?.[index],
    });
    state = result.state;
    signals.push(result.decisions.signal);
  }
  return signals;
}

function walkWindow(params: {
  readonly oracle: OracleParams;
  readonly signals: readonly (SignalDecision | null)[];
  readonly start: number;
  readonly horizon: number;
}): Point[] {
  const engine = createEngine();
  const { strategy, run, candles } = params.oracle;
  let state = createInitialWalletState({ strategy, run });
  const points: Point[] = [];
  for (let index = params.start; index < params.start + params.horizon; index += 1) {
    const candle = candles[index];
    if (candle === undefined) throw new Error('Janela fora da série.');
    const result = engine.walletStep({
      strategy,
      run,
      state,
      candle,
      signal: params.signals[index] ?? null,
    });
    state = result.state;
    const point = result.decisions.equityPoint;
    if (point === null) throw new Error('Sem ponto de patrimônio.');
    points.push({
      equity: toScaled(point.equity),
      equityAtLow: toScaled(point.equityAtLow),
      benchmark: toScaled(point.benchmark),
    });
  }
  return points;
}

type Levels = { readonly target: bigint; readonly stop: bigint };

function judge(params: {
  readonly points: readonly { readonly low: bigint; readonly close: bigint }[];
  readonly levels: Levels;
}): Result {
  const { points, levels } = params;
  for (const [offset, point] of points.entries()) {
    if (point.low <= levels.stop) {
      return { outcome: 'stopped', elapsed: offset + 1, finalValue: point.low };
    }
    if (point.close >= levels.target) {
      return { outcome: 'reached', elapsed: offset + 1, finalValue: point.close };
    }
  }
  const last = points.at(-1);
  return { outcome: 'expired', elapsed: points.length, finalValue: last?.close ?? 0n };
}

function rateText(numerator: number, windows: number, roundUp: boolean): string | null {
  if (windows === 0) return null;
  const scaled = BigInt(numerator) * SCALE;
  const divisor = BigInt(windows);
  return scaledToText(roundUp ? ceilDivide(scaled, divisor) : floorDivide(scaled, divisor));
}

function sortedBigints(values: readonly bigint[]): bigint[] {
  return [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

// Mediana como soma dobrada (evita meia casa): par dos dois do meio, ímpar do meio duas vezes.
function doubledMedian(values: readonly bigint[]): bigint | undefined {
  const sorted = sortedBigints(values);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) return undefined;
  const lower = sorted.length % 2 === 1 ? upper : sorted[middle - 1];
  return lower === undefined ? undefined : lower + upper;
}

function judgeVerdict(counts: {
  readonly windows: number;
  readonly reached: number;
  readonly stopped: number;
}): OracleVerdict {
  const { windows, reached, stopped } = counts;
  if (windows < 20) return 'SEGURAR';
  if (stopped * 100 >= 40 * windows || reached * 100 <= 15 * windows) return 'EVITAR';
  if (reached * 100 >= 50 * windows && stopped * 100 <= 25 * windows) return 'COMPRAR';
  return 'SEGURAR';
}

function summarizeStatistics(params: {
  readonly results: readonly Result[];
  readonly initial: bigint;
  readonly duration: bigint;
}): Pick<OracleEvaluation, 'medianCandlesToTarget' | 'medianDaysToTarget' | 'netReturn'> {
  const { results, initial, duration } = params;
  const reached = results.filter((result) => result.outcome === 'reached');
  const doubledTime = doubledMedian(reached.map((result) => BigInt(result.elapsed)));
  const gains = results.map((result) => result.finalValue - initial);
  const doubledGain = doubledMedian(gains);
  const total = gains.reduce((sum, gain) => sum + gain, 0n);
  return {
    medianCandlesToTarget:
      doubledTime === undefined ? null : scaledToText(ceilDivide(doubledTime * 100n, 2n), 2),
    medianDaysToTarget:
      doubledTime === undefined
        ? null
        : scaledToText(ceilDivide(doubledTime * duration * 100n, 2n * DAY), 2),
    netReturn: {
      mean:
        results.length === 0
          ? null
          : scaledToText(floorDivide(total * SCALE, initial * BigInt(results.length))),
      median:
        doubledGain === undefined
          ? null
          : scaledToText(floorDivide(doubledGain * SCALE, 2n * initial)),
    },
  };
}

export function runGoalOracle(params: OracleParams): OracleEvaluation {
  const { run, candles, goal } = params;
  const duration = BigInt(ENGINE_TIMEFRAME_DURATION_MILLISECONDS[run.parameters.timeframe]);
  const horizon = Number((BigInt(goal.horizonDays) * DAY) / duration);
  const initial = toScaled(run.parameters.initialBalance);
  const levels: Levels = {
    target: ceilDivide(initial * (SCALE + toScaled(goal.targetRate)), SCALE),
    stop: ceilDivide(initial * (SCALE - toScaled(goal.maxLossRate)), SCALE),
  };
  const signals = decideSignals(params);
  const first = signals.findIndex((signal) => signal !== null);
  const results: Result[] = [];
  const benchmarks: Result[] = [];
  const starts: number[] = [];
  for (
    let start = first === -1 ? candles.length : first;
    start + horizon <= candles.length;
    start += 1
  ) {
    const points = walkWindow({ oracle: params, signals, start, horizon });
    results.push(
      judge({ points: points.map((p) => ({ low: p.equityAtLow, close: p.equity })), levels }),
    );
    benchmarks.push(
      judge({ points: points.map((p) => ({ low: p.benchmark, close: p.benchmark })), levels }),
    );
    starts.push(start);
  }
  const count = (list: readonly Result[], outcome: Outcome): number =>
    list.filter((result) => result.outcome === outcome).length;
  const windows = results.length;
  const reached = count(results, 'reached');
  const stopped = count(results, 'stopped');
  const firstStart = starts[0];
  const lastStart = starts.at(-1);
  return {
    horizonCandles: horizon,
    levels: { target: scaledToText(levels.target), stop: scaledToText(levels.stop) },
    windowCount: windows,
    firstWindowOpenTime: firstStart === undefined ? null : (candles[firstStart]?.openTime ?? null),
    lastWindowOpenTime: lastStart === undefined ? null : (candles[lastStart]?.openTime ?? null),
    reachedCount: reached,
    stoppedCount: stopped,
    expiredCount: count(results, 'expired'),
    reachRate: rateText(reached, windows, false),
    stopRate: rateText(stopped, windows, true),
    expiredRate: rateText(count(results, 'expired'), windows, false),
    ...summarizeStatistics({ results, initial, duration }),
    benchmark: {
      reachedCount: count(benchmarks, 'reached'),
      stoppedCount: count(benchmarks, 'stopped'),
      reachRate: rateText(count(benchmarks, 'reached'), windows, false),
      stopRate: rateText(count(benchmarks, 'stopped'), windows, true),
    },
    verdict: judgeVerdict({ windows, reached, stopped }),
  };
}
