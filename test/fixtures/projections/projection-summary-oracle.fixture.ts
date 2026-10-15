// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ceilDivide,
  floorDivide,
  fromScaled,
  toScaled,
} from '../live-status/scaled-decimal.fixture.js';

// Oráculo da regra `projection-1` (ADR 0002, "Gráfico estilo Binance (spec 009)", P3 a P8), independente do `src`: só
// `bigint` em escala fixa. Recebe as previsões já resolvidas (fechamento da vela seguinte, se houver) e conta como a
// consulta única do resumo deve contar.

const SCALE = 30;
const MONEY_PLACES = 8;
const RATE_PLACES = 4;
const MINIMUM_COUNTED = 30;
// z = 1,96 → z² = 3,8416 = 2401/625.
const Z_SQUARED_NUMERATOR = 2401n;
const Z_SQUARED_DENOMINATOR = 625n;

export type OraclePrediction = {
  readonly candleTime: number;
  readonly score: string;
  readonly close: string;
  readonly atr: string | null;
  readonly nextClose: string | undefined;
  readonly buyThreshold: string;
  readonly sellThreshold: string;
};

export type OracleStrength = 'weak' | 'strong' | 'decided';
export type OracleVerdict = 'above' | 'even' | 'below' | 'too_few';

export type OracleSummary = {
  readonly predictions: number;
  readonly noSide: number;
  readonly pending: number;
  readonly counted: number;
  readonly hits: number;
  readonly misses: number;
  readonly ties: number;
  readonly upMoves: number;
  readonly banded: number;
  readonly inside: number;
  readonly hitRate: string | null;
  readonly upRate: string | null;
  readonly insideRate: string | null;
  readonly byStrength: Readonly<
    Record<OracleStrength, { readonly counted: number; readonly hits: number }>
  >;
  readonly verdict: OracleVerdict;
};

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export function strengthOf(params: {
  readonly score: string;
  readonly threshold: string;
}): OracleStrength {
  const score = absolute(toScaled(params.score, SCALE));
  const threshold = absolute(toScaled(params.threshold, SCALE));
  if (score * 2n <= threshold) return 'weak';
  return score < threshold ? 'strong' : 'decided';
}

function roundToMoney(value: bigint, direction: 'down' | 'up'): bigint {
  const unit = 10n ** BigInt(SCALE - MONEY_PLACES);
  const steps = direction === 'down' ? floorDivide(value, unit) : ceilDivide(value, unit);
  return steps * unit;
}

// Faixa = fechamento ± ATR, a borda de baixo para baixo e a de cima para cima a 8 casas: nunca encolhe.
export function isInsideBand(params: {
  readonly close: string;
  readonly atr: string;
  readonly nextClose: string;
}): boolean {
  const close = toScaled(params.close, SCALE);
  const atr = toScaled(params.atr, SCALE);
  const next = toScaled(params.nextClose, SCALE);
  return next >= roundToMoney(close - atr, 'down') && next <= roundToMoney(close + atr, 'up');
}

export function rateOf(part: number, total: number): string | null {
  if (total === 0) return null;
  const steps = floorDivide(BigInt(part) * 10n ** BigInt(RATE_PLACES), BigInt(total));
  return fromScaled(steps, RATE_PLACES);
}

// Wilson 95%: inferior > 1/2 ⇔ 2k > n e n(2k − n)² > z²(4k(n − k) + z²n); superior < 1/2 ⇔ 2k < n e a mesma
// desigualdade. Em inteiros, com z² = 2401/625: nada de raiz nem arredondamento.
export function verdictOf(params: {
  readonly hits: number;
  readonly counted: number;
}): OracleVerdict {
  const k = BigInt(params.hits);
  const n = BigInt(params.counted);
  if (params.counted < MINIMUM_COUNTED) return 'too_few';
  const left = Z_SQUARED_DENOMINATOR * Z_SQUARED_DENOMINATOR * n * (2n * k - n) ** 2n;
  const right =
    Z_SQUARED_NUMERATOR * (Z_SQUARED_DENOMINATOR * 4n * k * (n - k) + Z_SQUARED_NUMERATOR * n);
  if (left <= right) return 'even';
  return 2n * k > n ? 'above' : 'below';
}

type Tally = {
  predictions: number;
  noSide: number;
  pending: number;
  hits: number;
  misses: number;
  ties: number;
  upMoves: number;
  banded: number;
  inside: number;
  byStrength: Record<OracleStrength, { counted: number; hits: number }>;
};

function tallyResolved(tally: Tally, prediction: OraclePrediction, nextClose: string): void {
  const score = toScaled(prediction.score, SCALE);
  const move = toScaled(nextClose, SCALE) - toScaled(prediction.close, SCALE);
  if (prediction.atr !== null) {
    tally.banded += 1;
    if (isInsideBand({ close: prediction.close, atr: prediction.atr, nextClose }))
      tally.inside += 1;
  }
  if (move === 0n) {
    tally.ties += 1;
    return;
  }
  const isHit = score > 0n === move > 0n;
  const threshold = score > 0n ? prediction.buyThreshold : prediction.sellThreshold;
  const strength = tally.byStrength[strengthOf({ score: prediction.score, threshold })];
  strength.counted += 1;
  if (move > 0n) tally.upMoves += 1;
  if (isHit) {
    tally.hits += 1;
    strength.hits += 1;
  } else {
    tally.misses += 1;
  }
}

function emptyTally(): Tally {
  return {
    predictions: 0,
    noSide: 0,
    pending: 0,
    hits: 0,
    misses: 0,
    ties: 0,
    upMoves: 0,
    banded: 0,
    inside: 0,
    byStrength: {
      weak: { counted: 0, hits: 0 },
      strong: { counted: 0, hits: 0 },
      decided: { counted: 0, hits: 0 },
    },
  };
}

export function summarizeOracle(predictions: readonly OraclePrediction[]): OracleSummary {
  const tally = emptyTally();
  for (const prediction of predictions) {
    tally.predictions += 1;
    if (toScaled(prediction.score, SCALE) === 0n) tally.noSide += 1;
    else if (prediction.nextClose === undefined) tally.pending += 1;
    else tallyResolved(tally, prediction, prediction.nextClose);
  }
  const counted = tally.hits + tally.misses;
  return {
    ...tally,
    counted,
    hitRate: rateOf(tally.hits, counted),
    upRate: rateOf(tally.upMoves, counted),
    insideRate: rateOf(tally.inside, tally.banded),
    verdict: verdictOf({ hits: tally.hits, counted }),
  };
}
