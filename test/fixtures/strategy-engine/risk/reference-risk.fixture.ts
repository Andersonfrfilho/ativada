// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  formatEngineDecimal,
  type ComputeProtectivePricesParams,
  type EngineDecimalValue,
  type PositionSizeParams,
  type PositionSizeResult,
  type ProtectivePricesResult,
  type RunParameters,
} from '../../../../packages/strategy-engine/src/index.js';
import {
  lossAtStop,
  marketSellPrice,
  stepDown,
  tickDown,
  tickUp,
  toEngineDecimal,
} from '../reference-pricing.fixture.js';

// ORÁCULO do risco: escrito do ADR 0002 §c, independente de `packages/strategy-engine/src/risk`
// (importa só as primitivas de arredondamento e a aritmética de referência já provadas).
const ONE = new EngineDecimal(1);
const ZERO_RESULT = { quantity: '0', notional: '0', estimatedStopLoss: '0' } as const;

type Bound = readonly [label: PositionSizeResult['constraint'], quantity: EngineDecimalValue];

export function runOf(
  params: Pick<PositionSizeParams, 'feeRate' | 'slippageRate' | 'tickSize' | 'quantityStep'> &
    Partial<Pick<PositionSizeParams, 'minNotional'>>,
): RunParameters {
  return {
    schemaVersion: 1,
    symbol: 'BTCUSDT',
    timeframe: '1h',
    sentimentSource: 'reference',
    initialBalance: '10000',
    feeRate: params.feeRate,
    slippageRate: params.slippageRate,
    tickSize: params.tickSize,
    quantityStep: params.quantityStep,
    minNotional: params.minNotional ?? '0',
    maxVolumeShare: '0.01',
  };
}

export function referenceProtectivePrices(
  params: ComputeProtectivePricesParams,
): ProtectivePricesResult {
  const run = runOf({ ...params, feeRate: '0', quantityStep: '1' });
  const entry = toEngineDecimal(params.entryPrice);
  const atr = toEngineDecimal(params.atr);
  if (atr.lte(0)) return { kind: 'refused', reason: 'zero_atr' };
  const stopDistance = atr.times(params.stopAtrMultiple);
  const targetDistance = atr.times(params.targetAtrMultiple);
  const rawStop = entry.minus(stopDistance);
  if (rawStop.lte(0)) return { kind: 'refused', reason: 'invalid_stop' };
  const stop = tickDown(rawStop, run);
  if (stop.isZero()) return { kind: 'refused', reason: 'stop_below_tick' };
  if (stop.gte(entry.times(ONE.minus(params.slippageRate)))) {
    return { kind: 'refused', reason: 'invalid_stop' };
  }
  return {
    kind: 'priced',
    stopPrice: formatEngineDecimal(stop),
    targetPrice: formatEngineDecimal(tickUp(entry.plus(targetDistance), run)),
    stopDistance: formatEngineDecimal(stopDistance),
    targetDistance: formatEngineDecimal(targetDistance),
  };
}

function refused(constraint: PositionSizeResult['constraint']): PositionSizeResult {
  return { ...ZERO_RESULT, constraint };
}

// Folga de arredondamento do dinheiro: o débito soma 2 arredondamentos para cima (valor e taxa) e a
// perda soma 4 (os dois do débito, o do valor da saída para baixo e o da taxa de saída para cima),
// cada um de até 1e-8. Descontar a folga ANTES de dividir garante perda < risco e débito < caixa.
const MONEY_UNIT = new EngineDecimal('0.00000001');
const DEBIT_SLACK = MONEY_UNIT.times(2);
const LOSS_SLACK = MONEY_UNIT.times(4);

function floorQuantity(value: EngineDecimalValue, params: PositionSizeParams): EngineDecimalValue {
  return stepDown(EngineDecimal.max(value, 0), runOf(params));
}

function boundsOf(params: PositionSizeParams, risk: EngineDecimalValue): readonly Bound[] {
  const run = runOf(params);
  const entry = toEngineDecimal(params.entryPrice);
  const exit = marketSellPrice(params.stopPrice, run);
  const fee = toEngineDecimal(params.feeRate);
  const perUnit = entry.minus(exit).plus(entry.times(fee)).plus(exit.times(fee));
  const exposure = toEngineDecimal(params.equity).times(params.maxExposureRate);
  const affordable = toEngineDecimal(params.cash).minus(DEBIT_SLACK).dividedBy(ONE.plus(fee));
  const volume = toEngineDecimal(params.candleVolume).times(params.maxVolumeShare);
  return [
    ['none', floorQuantity(risk.minus(LOSS_SLACK).dividedBy(perUnit), params)],
    ['exposure_capped', floorQuantity(exposure.dividedBy(entry), params)],
    ['cash_capped', floorQuantity(affordable.dividedBy(entry), params)],
    ['volume_capped', floorQuantity(volume, params)],
  ];
}

function smallestBound(bounds: readonly Bound[]): Bound {
  let best = bounds[0] ?? (['none', new EngineDecimal(0)] as const);
  for (const bound of bounds) if (bound[1].lessThan(best[1])) best = bound;
  return best;
}

export function referencePositionSize(params: PositionSizeParams): PositionSizeResult {
  const risk = toEngineDecimal(params.riskAmount);
  if (risk.lte(0)) return refused('zero_risk');
  const entry = toEngineDecimal(params.entryPrice);
  const stop = toEngineDecimal(params.stopPrice);
  if (stop.lte(0) || stop.gte(entry.times(ONE.minus(params.slippageRate)))) {
    return refused('invalid_stop');
  }
  const [constraint, quantity] = smallestBound(boundsOf(params, risk));
  const notional = quantity.times(entry);
  if (quantity.lte(0) || notional.lessThan(params.minNotional))
    return refused('below_min_notional');
  const run = runOf(params);
  const stopExit = marketSellPrice(params.stopPrice, run);
  return {
    quantity: formatEngineDecimal(quantity),
    notional: formatEngineDecimal(notional),
    estimatedStopLoss: formatEngineDecimal(
      lossAtStop({ quantity, entryPrice: entry, stopExit, run }),
    ),
    constraint,
  };
}
