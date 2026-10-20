// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  computePositionSize,
  formatEngineDecimal,
  ROUNDING_DIRECTION,
  toEngineDecimal,
  type EngineDecimalValue,
  type RunParameters,
  type StrategyConfig,
} from '@ativada/strategy-engine';

import { roundMoneyDown } from '../money-rounding.js';
import {
  buyCost,
  distanceBetween,
  marketSellFill,
  resultAt,
  roundRate,
  type PriceDistance,
} from './trade-plan-math.js';
import type { ProtectiveLevelView, SizingView } from './trade-plan-view.js';

const { UP, DOWN } = ROUNDING_DIRECTION;

// O que a vela decidida e a carteira oferecem às contas: o caixa (o patrimônio sem posição), o fechamento e o volume dela.
export type PlanBasis = {
  readonly config: StrategyConfig;
  readonly parameters: RunParameters;
  readonly cash: string;
  readonly currentPrice: EngineDecimalValue;
  readonly decisionVolume: string;
};

export type LevelParams = {
  readonly basis: PlanBasis;
  readonly quantity: EngineDecimalValue;
  readonly entryPrice: EngineDecimalValue;
  readonly entryCost: EngineDecimalValue;
};

export function distanceFromCurrent(
  basis: PlanBasis,
  price: EngineDecimalValue,
  direction: typeof UP | typeof DOWN,
): PriceDistance {
  return distanceBetween({ from: basis.currentPrice, to: price, direction });
}

function levelView(
  params: LevelParams,
  level: { readonly price: EngineDecimalValue; readonly exitPrice: EngineDecimalValue },
  direction: typeof UP | typeof DOWN,
): ProtectiveLevelView {
  const { basis, quantity, entryPrice, entryCost } = params;
  const fromEntry = level.price.dividedBy(entryPrice).minus(1);
  return {
    price: formatEngineDecimal(level.price),
    exitPrice: formatEngineDecimal(level.exitPrice),
    fromEntryRate: formatEngineDecimal(roundRate(fromEntry, direction)),
    distance: distanceFromCurrent(basis, level.price, direction),
    result: quantity.isZero()
      ? null
      : resultAt({ quantity, entryCost, exitPrice: level.exitPrice }, basis.parameters),
  };
}

// O alvo é uma ordem no livro: sai ao PREÇO DO ALVO. A taxa até ele sobe (fica mais difícil de alcançar).
export function targetView(params: LevelParams, target: EngineDecimalValue): ProtectiveLevelView {
  return levelView(params, { price: target, exitPrice: target }, UP);
}

// O stop sem gap sai a mercado sobre o stop, com deslizamento e tick para baixo. A taxa até ele desce (a queda nunca é menor).
export function stopView(params: LevelParams, stop: EngineDecimalValue): ProtectiveLevelView {
  const exitPrice = marketSellFill(stop, params.basis.parameters);
  return levelView(params, { price: stop, exitPrice }, DOWN);
}

export type SizedEntry = { readonly sizing: SizingView; readonly levels: LevelParams };

// O dimensionamento ÚNICO do produto (`computePositionSize`), com o valor em risco que o motor guardaria na ordem (caixa ×
// `riskPerTrade`, para baixo) e o volume da vela de decisão. Escala do analista não entra: é a entrada cheia.
export function sizeEntry(
  basis: PlanBasis,
  prices: { readonly entryPrice: EngineDecimalValue; readonly stop: EngineDecimalValue },
): SizedEntry {
  const { parameters, config } = basis;
  const riskAmount = roundMoneyDown(toEngineDecimal(basis.cash).times(config.risk.riskPerTrade));
  const size = computePositionSize({
    riskAmount: formatEngineDecimal(riskAmount),
    entryPrice: formatEngineDecimal(prices.entryPrice),
    stopPrice: formatEngineDecimal(prices.stop),
    feeRate: parameters.feeRate,
    slippageRate: parameters.slippageRate,
    cash: basis.cash,
    equity: basis.cash,
    maxExposureRate: config.risk.maxExposureRate,
    candleVolume: basis.decisionVolume,
    maxVolumeShare: parameters.maxVolumeShare,
    quantityStep: parameters.quantityStep,
    tickSize: parameters.tickSize,
    minNotional: parameters.minNotional,
  });
  const quantity = toEngineDecimal(size.quantity);
  const entryCost = buyCost({ quantity, price: prices.entryPrice }, parameters);
  return {
    sizing: {
      riskAmount: formatEngineDecimal(riskAmount),
      quantity: size.quantity,
      notional: size.notional,
      entryCost: formatEngineDecimal(entryCost),
      constraint: size.constraint,
    },
    levels: { basis, quantity, entryPrice: prices.entryPrice, entryCost },
  };
}
