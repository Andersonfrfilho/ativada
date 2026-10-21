// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, formatEngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { HORIZON_RATE_DECIMAL_PLACES, HORIZON_RECOMMENDATION_RULES } from './horizon.constant.js';
import type {
  HorizonDistribution,
  HorizonSummary,
  SummarizeHorizonParams,
} from './horizon.types.js';

const ZERO = new EngineDecimal(0);
const TWO = new EngineDecimal(2);
const DECILE_DIVISOR = 10;

function floorText(value: EngineDecimalValue): string {
  return formatEngineDecimal(
    value.toDecimalPlaces(HORIZON_RATE_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR),
  );
}

function sortAscending(values: readonly EngineDecimalValue[]): EngineDecimalValue[] {
  return [...values].sort((left, right) => left.comparedTo(right));
}

// Ímpar: o do meio; par: a média dos dois do meio. Exata, sem arredondar.
function medianOf(sorted: readonly EngineDecimalValue[]): EngineDecimalValue | undefined {
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) return undefined;
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[middle - 1];
  return lower === undefined ? undefined : lower.plus(upper).dividedBy(TWO);
}

// Pior 10% por posto mais próximo: o elemento de posição ceil(n ÷ 10) na ordem crescente.
function worstDecileOf(sorted: readonly EngineDecimalValue[]): EngineDecimalValue | undefined {
  return sorted[Math.ceil(sorted.length / DECILE_DIVISOR) - 1];
}

function distributionOf(returns: readonly EngineDecimalValue[]): HorizonDistribution {
  const sorted = sortAscending(returns);
  const median = medianOf(sorted);
  const worstDecile = worstDecileOf(sorted);
  const positiveCount = sorted.filter((value) => value.greaterThan(ZERO)).length;
  return {
    median: median === undefined ? null : floorText(median),
    positiveRate:
      sorted.length === 0
        ? null
        : floorText(new EngineDecimal(positiveCount).dividedBy(sorted.length)),
    worstDecile: worstDecile === undefined ? null : floorText(worstDecile),
  };
}

// Mediana, % de janelas positivas e pior 10% do retorno por prazo. Arredonda para baixo (contra o usuário) UMA vez, no fim.
export function summarizeHorizon(params: SummarizeHorizonParams): HorizonSummary {
  const { returns, benchmarkReturns } = params.windows;
  return {
    horizonDays: params.horizonDays,
    windowCount: returns.length,
    positiveCount: returns.filter((value) => value.greaterThan(ZERO)).length,
    ...distributionOf(returns),
    isShortHistory: returns.length < HORIZON_RECOMMENDATION_RULES.minimumWindows,
    benchmark: distributionOf(benchmarkReturns),
  };
}
