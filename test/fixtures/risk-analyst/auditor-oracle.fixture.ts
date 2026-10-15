// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ceilDivide, floorDivide, fromScaled } from '../live-status/scaled-decimal.fixture.js';

// Oráculo do auditor de acertos da regra `analyst-1` (ADR 0002, "Analista de risco (spec 007)", A6 a A8), independente do
// `src`: só `bigint`. Recebe a série de votos de UM especialista (ou da tendência da estratégia) já calculada e conta as
// previsões da janela como o `accuracy-auditor.ts` da T1.2 deve contar.

const RATE_PLACES = 4;
const WILSON_PLACES = 12;
const MINIMUM_COUNTED = 30;
// z = 1,96 → z² = 3,8416 = 2401/625.
const Z_SQUARED_NUMERATOR = 2401n;
const Z_SQUARED_DENOMINATOR = 625n;
// Escala da raiz: 10⁴⁰ dá folga de 28 casas sobre as 12 exibidas.
const ROOT_SCALE = 10n ** 40n;

export type AuditorVote = -1 | 0 | 1;

// `vote: null` = sem leitura (aquecimento): a vela existe, mas o especialista ainda não vota.
export type AuditorCandle = {
  readonly openTime: number;
  readonly close: string;
  readonly vote: AuditorVote | null;
};

export type AuditorWindow = {
  readonly decisionTime: number;
  readonly timeframeMilliseconds: number;
  readonly windowCandles: number;
};

export type AuditorVerdict = 'above' | 'even' | 'below' | 'too_few';

export type AuditorSummary = {
  readonly predictions: number;
  readonly unread: number;
  readonly noSide: number;
  readonly gap: number;
  readonly counted: number;
  readonly hits: number;
  readonly misses: number;
  readonly ties: number;
  readonly upMoves: number;
  readonly hitRate: string | null;
  readonly upRate: string | null;
  readonly verdict: AuditorVerdict;
  readonly lower: string | null;
  readonly upper: string | null;
  readonly weight: string;
};

function integerSquareRoot(value: bigint): bigint {
  if (value < 2n) return value;
  let current = value;
  let next = (current + 1n) / 2n;
  while (next < current) {
    current = next;
    next = (current + value / current) / 2n;
  }
  return current;
}

function ceilSquareRoot(value: bigint): bigint {
  const root = integerSquareRoot(value);
  return root * root === value ? root : root + 1n;
}

export function rateOf(part: number, total: number): string | null {
  if (total === 0) return null;
  return fromScaled(
    floorDivide(BigInt(part) * 10n ** BigInt(RATE_PLACES), BigInt(total)),
    RATE_PLACES,
  );
}

// Wilson 95%: inferior > 1/2 ⇔ 2k > n e n(2k − n)² > z²(4k(n − k) + z²n); superior < 1/2 com 2k < n. Inteiros exatos.
export function verdictOf(params: {
  readonly hits: number;
  readonly counted: number;
}): AuditorVerdict {
  if (params.counted < MINIMUM_COUNTED) return 'too_few';
  const k = BigInt(params.hits);
  const n = BigInt(params.counted);
  const left = Z_SQUARED_DENOMINATOR * Z_SQUARED_DENOMINATOR * n * (2n * k - n) ** 2n;
  const right =
    Z_SQUARED_NUMERATOR * (Z_SQUARED_DENOMINATOR * 4n * k * (n - k) + Z_SQUARED_NUMERATOR * n);
  if (left <= right) return 'even';
  return 2n * k > n ? 'above' : 'below';
}

function clampUnit(value: bigint, unit: bigint): bigint {
  if (value < 0n) return 0n;
  return value > unit ? unit : value;
}

// Limites de Wilson a 12 casas: o de baixo para baixo (raiz por cima) e o de cima para cima (raiz por baixo), em [0, 1].
export function wilsonLimitsOf(params: { readonly hits: number; readonly counted: number }): {
  readonly lower: string;
  readonly upper: string;
} {
  const k = BigInt(params.hits);
  const n = BigInt(params.counted);
  // ×10000: limite = (10000k + 19208 ∓ 196·√(Y/n)) ÷ (10000n + 38416), com Y = 10000·k(n − k) + 9604·n.
  const radicand = (10000n * k * (n - k) + 9604n * n) * ROOT_SCALE * ROOT_SCALE;
  const rootHigh = ceilSquareRoot(ceilDivide(radicand, n));
  const rootLow = integerSquareRoot(floorDivide(radicand, n));
  const centre = (10000n * k + 19208n) * ROOT_SCALE;
  const divisor = (10000n * n + 38416n) * ROOT_SCALE;
  const unit = 10n ** BigInt(WILSON_PLACES);
  const lowerSteps = floorDivide((centre - 196n * rootHigh) * unit, divisor);
  const upperSteps = ceilDivide((centre + 196n * rootLow) * unit, divisor);
  return {
    lower: fromScaled(clampUnit(lowerSteps, unit), WILSON_PLACES),
    upper: fromScaled(clampUnit(upperSteps, unit), WILSON_PLACES),
  };
}

// Peso = limite inferior − 0,5 só em `above` (D4-A); zero nos outros vereditos.
export function weightOf(verdict: AuditorVerdict, lower: string | null): string {
  if (verdict !== 'above' || lower === null) return '0';
  const unit = 10n ** BigInt(WILSON_PLACES);
  const [integer = '0', fraction = ''] = lower.split('.');
  const scaled = BigInt(integer) * unit + BigInt(fraction.padEnd(WILSON_PLACES, '0'));
  return fromScaled(scaled - unit / 2n, WILSON_PLACES);
}

type Tally = {
  predictions: number;
  unread: number;
  noSide: number;
  gap: number;
  hits: number;
  misses: number;
  ties: number;
  upMoves: number;
};

function scaleOf(text: string): bigint {
  const [integer = '0', fraction = ''] = text.split('.');
  return BigInt(integer + fraction.padEnd(16, '0'));
}

function tallyPrediction(tally: Tally, candle: AuditorCandle, nextClose: string | undefined): void {
  tally.predictions += 1;
  if (candle.vote === null) tally.unread += 1;
  else if (candle.vote === 0) tally.noSide += 1;
  else if (nextClose === undefined) tally.gap += 1;
  else {
    const move = scaleOf(nextClose) - scaleOf(candle.close);
    if (move === 0n) tally.ties += 1;
    else {
      if (move > 0n) tally.upMoves += 1;
      if (move > 0n === candle.vote > 0) tally.hits += 1;
      else tally.misses += 1;
    }
  }
}

// Previsão na vela `p` (voto ≠ 0) resolvida pelo fechamento da vela `p + d`; contam as `p` com
// `t − (W + 1)·d < p ≤ t − d`, isto é, as W previsões mais novas cujo resultado já fechou até a vela `t`.
export function summarizeAuditor(
  series: readonly AuditorCandle[],
  window: AuditorWindow,
): AuditorSummary {
  const { decisionTime, timeframeMilliseconds: d, windowCandles } = window;
  const closes = new Map(series.map((candle) => [candle.openTime, candle.close]));
  const tally: Tally = {
    predictions: 0,
    unread: 0,
    noSide: 0,
    gap: 0,
    hits: 0,
    misses: 0,
    ties: 0,
    upMoves: 0,
  };
  for (const candle of series) {
    const isInside =
      candle.openTime > decisionTime - (windowCandles + 1) * d &&
      candle.openTime <= decisionTime - d;
    if (isInside) tallyPrediction(tally, candle, closes.get(candle.openTime + d));
  }
  const counted = tally.hits + tally.misses;
  const verdict = verdictOf({ hits: tally.hits, counted });
  const limits =
    counted === 0 ? { lower: null, upper: null } : wilsonLimitsOf({ hits: tally.hits, counted });
  return {
    ...tally,
    counted,
    hitRate: rateOf(tally.hits, counted),
    upRate: rateOf(tally.upMoves, counted),
    verdict,
    ...limits,
    weight: weightOf(verdict, limits.lower),
  };
}
