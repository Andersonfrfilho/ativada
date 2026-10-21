// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, toEngineDecimal, type EngineDecimalValue } from '@ativada/strategy-engine';

const RATE_PLACES = 6;
const RATIO_PLACES = 1;
const ONE_ROUND_TRIP_SIDES = 2;

export type ManualMath = {
  readonly costRate: string;
  readonly netGainRate: string;
  readonly netLossRate: string;
  readonly netRatio: string | null;
  readonly breakEvenEntry: string | null;
};

export type ManualMathInput = {
  readonly entry: string;
  readonly target: string;
  readonly stop: string;
  readonly feeRate: string;
  readonly slippageRate: string;
  readonly tickSize: string;
};

function plain(value: EngineDecimalValue): string {
  return value.toFixed();
}

// Custo ida e volta: taxa e deslizamento da simulação, dos dois lados.
export function computeRoundTripCost(feeRate: string, slippageRate: string): EngineDecimalValue {
  return toEngineDecimal(feeRate).plus(slippageRate).times(ONE_ROUND_TRIP_SIDES);
}

// Ganho e perda depois do custo, sempre contra o usuário (o ganho desce, a perda cresce) e o equilíbrio para baixo no tick:
// (alvo + proteção) ÷ (2 + 2 × custo) é onde o ganho depois do custo iguala a perda; acima dele o ganho fica menor.
export function computeManualMath(input: ManualMathInput): ManualMath | undefined {
  const entry = toEngineDecimal(input.entry);
  if (!entry.isPositive()) return undefined;
  const target = toEngineDecimal(input.target);
  const stop = toEngineDecimal(input.stop);
  const cost = computeRoundTripCost(input.feeRate, input.slippageRate);
  const gain = target.minus(entry).dividedBy(entry).minus(cost);
  const loss = stop.minus(entry).dividedBy(entry).minus(cost);
  const gainDown = gain.toDecimalPlaces(RATE_PLACES, EngineDecimal.ROUND_FLOOR);
  const lossDown = loss.toDecimalPlaces(RATE_PLACES, EngineDecimal.ROUND_FLOOR);
  const ratio = lossDown.isZero()
    ? null
    : gainDown.dividedBy(lossDown.abs()).toDecimalPlaces(RATIO_PLACES, EngineDecimal.ROUND_FLOOR);
  const tick = toEngineDecimal(input.tickSize);
  const equilibrium = target
    .plus(stop)
    .dividedBy(cost.times(ONE_ROUND_TRIP_SIDES).plus(ONE_ROUND_TRIP_SIDES));
  return {
    costRate: plain(cost),
    netGainRate: plain(gainDown),
    netLossRate: plain(lossDown),
    netRatio: ratio === null ? null : plain(ratio),
    breakEvenEntry: tick.isPositive()
      ? plain(equilibrium.toNearest(tick, EngineDecimal.ROUND_FLOOR))
      : null,
  };
}
