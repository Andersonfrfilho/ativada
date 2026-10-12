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
import { scaledToText, toScaled } from '../goal/goal-oracle.fixture.js';

// O oráculo dos prazos: laço ingênuo que NÃO importa nada de `src/goal` nem de `src/horizon`. Cada janela refaz a
// carteira do zero no primeiro candle decidido e a anda até o fim do prazo com o `walletStep` do motor completo; o
// sinal sai do `step` completo. O retorno é aritmética inteira em BigInt (casas de 1e-8), arredondada para baixo.
const SCALE = 100_000_000n;
const DAY = 86_400_000n;

export type HorizonOracleParams = {
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  readonly candles: readonly EngineCandle[];
  readonly horizonDays: number;
  readonly sentiments?: readonly (SentimentObservation | undefined)[] | undefined;
};

export type HorizonOracleResult = {
  readonly returns: readonly string[];
  readonly benchmarkReturns: readonly string[];
};

function floorDivide(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const hasRemainder = numerator % denominator !== 0n;
  return hasRemainder && numerator < 0n !== denominator < 0n ? quotient - 1n : quotient;
}

function decideSignals(params: HorizonOracleParams): (SignalDecision | null)[] {
  const engine = createEngine();
  const { strategy, run } = params;
  let state = engine.createInitialState({ strategy, run });
  const signals: (SignalDecision | null)[] = [];
  for (const [index, candle] of params.candles.entries()) {
    const sentiment = params.sentiments?.[index];
    const result = engine.step({ strategy, run, state, candle, sentiment });
    state = result.state;
    signals.push(result.decisions.signal);
  }
  return signals;
}

type FinalPoint = { readonly equity: bigint; readonly benchmark: bigint };

function walkToHorizon(params: {
  readonly oracle: HorizonOracleParams;
  readonly signals: readonly (SignalDecision | null)[];
  readonly start: number;
  readonly horizon: number;
}): FinalPoint {
  const engine = createEngine();
  const { strategy, run, candles } = params.oracle;
  let state = createInitialWalletState({ strategy, run });
  let last: FinalPoint | undefined;
  for (let index = params.start; index < params.start + params.horizon; index += 1) {
    const candle = candles[index];
    if (candle === undefined) throw new Error('Janela fora da série.');
    const signal = params.signals[index] ?? null;
    const result = engine.walletStep({ strategy, run, state, candle, signal });
    state = result.state;
    const point = result.decisions.equityPoint;
    if (point === null) throw new Error('Sem ponto de patrimônio.');
    last = { equity: toScaled(point.equity), benchmark: toScaled(point.benchmark) };
  }
  if (last === undefined) throw new Error('Prazo sem candles.');
  return last;
}

export function runHorizonOracle(params: HorizonOracleParams): HorizonOracleResult {
  const { run, candles } = params;
  const duration = BigInt(ENGINE_TIMEFRAME_DURATION_MILLISECONDS[run.parameters.timeframe]);
  const horizon = Number((BigInt(params.horizonDays) * DAY) / duration);
  const initial = toScaled(run.parameters.initialBalance);
  const signals = decideSignals(params);
  const first = signals.findIndex((signal) => signal !== null);
  const toRate = (value: bigint): string =>
    scaledToText(floorDivide((value - initial) * SCALE, initial));
  const returns: string[] = [];
  const benchmarkReturns: string[] = [];
  const firstStart = first === -1 ? candles.length : first;
  for (let start = firstStart; start + horizon <= candles.length; start += 1) {
    const end = walkToHorizon({ oracle: params, signals, start, horizon });
    returns.push(toRate(end.equity));
    benchmarkReturns.push(toRate(end.benchmark));
  }
  return { returns, benchmarkReturns };
}
