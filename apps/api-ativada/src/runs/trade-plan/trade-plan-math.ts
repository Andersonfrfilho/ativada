// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  formatEngineDecimal,
  ROUNDING_DIRECTION,
  roundToIncrement,
  toEngineDecimal,
  type EngineDecimalValue,
  type RoundingDirection,
  type RunParameters,
} from '@ativada/strategy-engine';

import { roundMoneyDown, roundMoneyUp } from '../money-rounding.js';
import { TRADE_PLAN_RATE_DECIMAL_PLACES } from './trade-plan.constant.js';

const ONE = new EngineDecimal(1);

// As contas do preenchimento simulado, exatamente as do motor (`wallet-pricing.ts` e `money.ts`, ADR 0002 §e): preço de compra
// para cima no tick, de venda para baixo, débito para cima, crédito para baixo e taxa para cima, a 8 casas.
export type Pricing = Pick<RunParameters, 'feeRate' | 'slippageRate' | 'tickSize'>;

export function tickUp(value: EngineDecimalValue, pricing: Pricing): EngineDecimalValue {
  const increment = toEngineDecimal(pricing.tickSize);
  return roundToIncrement({ value, increment, direction: ROUNDING_DIRECTION.UP });
}

export function tickDown(value: EngineDecimalValue, pricing: Pricing): EngineDecimalValue {
  const increment = toEngineDecimal(pricing.tickSize);
  return roundToIncrement({ value, increment, direction: ROUNDING_DIRECTION.DOWN });
}

// Compra a mercado na abertura: abertura + deslizamento, tick para cima.
export function marketBuyFill(open: EngineDecimalValue, pricing: Pricing): EngineDecimalValue {
  return tickUp(open.times(ONE.plus(pricing.slippageRate)), pricing);
}

// Venda a mercado (sinal, comando ou stop sem gap): preço − deslizamento, tick para baixo.
export function marketSellFill(price: EngineDecimalValue, pricing: Pricing): EngineDecimalValue {
  return tickDown(price.times(ONE.minus(pricing.slippageRate)), pricing);
}

function tradeFee(notional: EngineDecimalValue, pricing: Pricing): EngineDecimalValue {
  return roundMoneyUp(notional.times(pricing.feeRate));
}

export type Leg = { readonly quantity: EngineDecimalValue; readonly price: EngineDecimalValue };

// O que a compra tira do caixa: o valor para cima mais a taxa para cima.
export function buyCost(leg: Leg, pricing: Pricing): EngineDecimalValue {
  const notional = leg.quantity.times(leg.price);
  return roundMoneyUp(notional).plus(tradeFee(notional, pricing));
}

// O que a venda devolve ao caixa: o valor para baixo menos a taxa para cima.
export function sellProceeds(leg: Leg, pricing: Pricing): EngineDecimalValue {
  const notional = leg.quantity.times(leg.price);
  return roundMoneyDown(notional).minus(tradeFee(notional, pricing));
}

export function roundRate(
  value: EngineDecimalValue,
  direction: RoundingDirection,
): EngineDecimalValue {
  const mode =
    direction === ROUNDING_DIRECTION.UP ? EngineDecimal.ROUND_CEIL : EngineDecimal.ROUND_FLOOR;
  return value.toDecimalPlaces(TRADE_PLAN_RATE_DECIMAL_PLACES, mode);
}

export type TradeResult = { readonly net: string; readonly rate: string };

export type ResultParams = {
  readonly quantity: EngineDecimalValue;
  readonly entryCost: EngineDecimalValue;
  readonly exitPrice: EngineDecimalValue;
};

// O líquido de sair a `exitPrice`: crédito da venda − débito da compra (o `net_profit` que o motor gravaria) e a taxa sobre o
// débito, para BAIXO (o ganho nunca aparece maior, a perda nunca aparece menor).
export function resultAt(params: ResultParams, pricing: Pricing): TradeResult {
  const proceeds = sellProceeds({ quantity: params.quantity, price: params.exitPrice }, pricing);
  const net = proceeds.minus(params.entryCost);
  return {
    net: formatEngineDecimal(net),
    rate: formatEngineDecimal(roundRate(net.dividedBy(params.entryCost), ROUNDING_DIRECTION.DOWN)),
  };
}

export type PriceDistance = { readonly value: string; readonly rate: string };

export type DistanceParams = {
  readonly from: EngineDecimalValue;
  readonly to: EngineDecimalValue;
  // A direção que pesa contra o usuário: para cima no que ele precisa alcançar, para baixo no que ele pode perder.
  readonly direction: RoundingDirection;
};

// A distância de `from` até `to`: o valor é exato (dois preços na grade do tick) e só a taxa arredonda, na direção dada.
export function distanceBetween(params: DistanceParams): PriceDistance {
  const value = params.to.minus(params.from);
  return {
    value: formatEngineDecimal(value),
    rate: formatEngineDecimal(roundRate(value.dividedBy(params.from), params.direction)),
  };
}
