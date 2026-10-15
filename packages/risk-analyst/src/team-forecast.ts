// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatEngineDecimal, type EngineDecimalValue } from '@ativada/strategy-engine';

import {
  ANALYST_RULES,
  FORECAST_SIDE,
  FORECAST_STRENGTH,
  NO_FORECAST_REASON,
  STRATEGY_AUDIT_KEY,
  type NoForecastReason,
} from './analyst.constant.js';
import { decimalOf, sumTexts } from './analyst-decimal.js';
import type { SpecialistView } from './analyst.types.js';
import type { TeamForecast } from './analyst-decision.types.js';

export type ForecastTeamParams = {
  readonly specialists: readonly SpecialistView[];
  readonly atrRate: string | null;
  readonly atrPercentile95: string | null;
  // Falso quando a etapa de dado (A10) já barrou: a equipe não tem o que ler.
  readonly hasData: boolean;
};

type Weights = {
  readonly forWeight: EngineDecimalValue;
  readonly againstWeight: EngineDecimalValue;
  readonly proven: EngineDecimalValue;
};

// Soma dos pesos (A7) dos quatro especialistas: a favor, contra e todo o peso aprovado (os neutros que provaram entram).
// A tendência da estratégia não vota nem pesa.
function sumWeights(specialists: readonly SpecialistView[]): Weights {
  const team = specialists.filter((view) => view.key !== STRATEGY_AUDIT_KEY);
  const sumOf = (isIncluded: (view: SpecialistView) => boolean): EngineDecimalValue =>
    sumTexts(team.filter(isIncluded).map((view) => view.weight));
  return {
    forWeight: sumOf((view) => view.vote === 1),
    againstWeight: sumOf((view) => view.vote === -1),
    proven: sumOf(() => true),
  };
}

// Os dois lados têm peso e o vencedor fica abaixo de 2/3 do peso de quem votou: 3 × maior < 2 × (a favor + contra).
function isSplitTeam(weights: Weights): boolean {
  const { numerator, denominator } = ANALYST_RULES.teamShare;
  const { forWeight, againstWeight } = weights;
  if (!forWeight.gt(0) || !againstWeight.gt(0)) return false;
  const winner = forWeight.gt(againstWeight) ? forWeight : againstWeight;
  return winner.times(denominator).lt(forWeight.plus(againstWeight).times(numerator));
}

// "Sem previsão" nesta precedência (A12): sem dado, mercado agitado demais, ninguém provou valor, os que provaram
// estão neutros, ou se dividem. Contas sem dividir.
function findNoForecastReason(
  params: ForecastTeamParams,
  weights: Weights,
): NoForecastReason | null {
  const { atrRate, atrPercentile95 } = params;
  if (!params.hasData) return NO_FORECAST_REASON.NO_DATA;
  const isTooVolatile =
    atrRate !== null && atrPercentile95 !== null && decimalOf(atrRate).gt(atrPercentile95);
  if (isTooVolatile) return NO_FORECAST_REASON.TOO_VOLATILE;
  if (weights.proven.isZero()) return NO_FORECAST_REASON.NO_PROVEN_SPECIALIST;
  if (weights.forWeight.isZero() && weights.againstWeight.isZero()) {
    return NO_FORECAST_REASON.PROVEN_NEUTRAL;
  }
  return isSplitTeam(weights) ? NO_FORECAST_REASON.SPLIT_TEAM : null;
}

function describeWeights(
  weights: Weights,
): Pick<TeamForecast, 'forWeight' | 'againstWeight' | 'provenWeight'> {
  return {
    forWeight: formatEngineDecimal(weights.forWeight),
    againstWeight: formatEngineDecimal(weights.againstWeight),
    provenWeight: formatEngineDecimal(weights.proven),
  };
}

export function forecastTeam(params: ForecastTeamParams): TeamForecast {
  const weights = sumWeights(params.specialists);
  const reason = findNoForecastReason(params, weights);
  if (reason !== null) {
    return {
      side: null,
      strength: null,
      noForecastReason: reason,
      ...describeWeights(weights),
    };
  }
  const { numerator, denominator } = ANALYST_RULES.teamShare;
  const isUp = weights.forWeight.gt(weights.againstWeight);
  const winner = isUp ? weights.forWeight : weights.againstWeight;
  // Força firme: o lado vencedor tem 2/3 ou mais do peso aprovado inteiro.
  const isFirm = winner.times(denominator).gte(weights.proven.times(numerator));
  return {
    side: isUp ? FORECAST_SIDE.UP : FORECAST_SIDE.DOWN,
    strength: isFirm ? FORECAST_STRENGTH.FIRM : FORECAST_STRENGTH.WEAK,
    noForecastReason: null,
    ...describeWeights(weights),
  };
}
