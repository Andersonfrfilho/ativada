// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DECIMAL_SCALE, parseScaled } from '../../format/decimal.js';

const SCALE_FACTOR = 10n ** BigInt(DECIMAL_SCALE);
const MINIMUM_LIMIT = 4n;
const BASIS_POINTS = 10_000n;
const BASIS_POINTS_PER_PERCENT = 100;
const ZERO = 0n;

export type ScoreScale = {
  // A régua vai de -limit a +limit (em pontos do placar).
  readonly limit: number;
  readonly scorePercent: number;
  readonly thresholdPercent: number;
};

export type ScoreScaleParams = {
  readonly score: string;
  readonly threshold: string;
  readonly weights: readonly string[];
};

function magnitude(value: bigint): bigint {
  return value < ZERO ? -value : value;
}

function toPercent(value: bigint, limit: bigint): number {
  const fraction = ((value + limit) * BASIS_POINTS) / (2n * limit);
  const clamped = fraction < ZERO ? ZERO : fraction > BASIS_POINTS ? BASIS_POINTS : fraction;
  return Number(clamped) / BASIS_POINTS_PER_PERCENT;
}

// A régua do placar: da menor à maior soma possível dos votos (soma dos pesos, no mínimo 4), com a nota e o limiar em %.
export function buildScoreScale(params: ScoreScaleParams): ScoreScale | undefined {
  const score = parseScaled(params.score);
  const threshold = parseScaled(params.threshold);
  if (score === undefined || threshold === undefined) return undefined;
  const weightTotal = params.weights.reduce(
    (sum, text) => sum + magnitude(parseScaled(text) ?? ZERO),
    ZERO,
  );
  const largest = [magnitude(score), magnitude(threshold), weightTotal].reduce((a, b) =>
    a > b ? a : b,
  );
  const roundedUp = (largest + SCALE_FACTOR - 1n) / SCALE_FACTOR;
  const limitPoints = roundedUp > MINIMUM_LIMIT ? roundedUp : MINIMUM_LIMIT;
  const limit = limitPoints * SCALE_FACTOR;
  return {
    limit: Number(limitPoints),
    scorePercent: toPercent(score, limit),
    thresholdPercent: toPercent(threshold, limit),
  };
}
