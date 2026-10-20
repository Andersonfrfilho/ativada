// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ceilDivide,
  floorDivide,
  fromScaled,
  toScaled,
} from '../live-status/scaled-decimal.fixture.js';

// Oráculo `bigint` do plano de operação, sem importar o `src` nem o `decimal.js`: preço, quantidade e dinheiro a 8 casas,
// produtos a 16, taxa a 24, taxas de retorno a 12. Cada arredondamento tem a direção escrita aqui, à mão.
const SCALE = 8;
const UNIT = 10n ** 8n;
const RATE_UNIT = 10n ** 12n;

const scaled = (text: string): bigint => toScaled(text, SCALE);
const text = (value: bigint): string => fromScaled(value, SCALE);

export type OracleFees = { readonly feeRate: string; readonly slippageRate: string };

// `valor × (1 ± fração)` no tick: para cima na compra, para baixo na venda.
export function tickUpTimes(params: {
  readonly price: string;
  readonly factor: string;
  readonly tick: string;
}): string {
  const product = scaled(params.price) * scaled(params.factor);
  const tick = scaled(params.tick) * UNIT;
  return text(ceilDivide(product, tick) * scaled(params.tick));
}

export function tickDownTimes(params: {
  readonly price: string;
  readonly factor: string;
  readonly tick: string;
}): string {
  const product = scaled(params.price) * scaled(params.factor);
  const tick = scaled(params.tick) * UNIT;
  return text(floorDivide(product, tick) * scaled(params.tick));
}

function fee(notional16: bigint, feeRate: string): bigint {
  return ceilDivide(notional16 * scaled(feeRate), UNIT * UNIT);
}

// Débito da compra: valor para cima + taxa para cima.
export function oracleBuyCost(quantity: string, price: string, feeRate: string): string {
  const notional = scaled(quantity) * scaled(price);
  return text(ceilDivide(notional, UNIT) + fee(notional, feeRate));
}

// Crédito da venda: valor para baixo − taxa para cima.
export function oracleSellProceeds(quantity: string, price: string, feeRate: string): string {
  const notional = scaled(quantity) * scaled(price);
  return text(floorDivide(notional, UNIT) - fee(notional, feeRate));
}

export function oracleRate(params: {
  readonly numerator: string;
  readonly denominator: string;
  readonly direction: 'up' | 'down';
}): string {
  const numerator = scaled(params.numerator) * RATE_UNIT;
  const denominator = scaled(params.denominator);
  const value =
    params.direction === 'up'
      ? ceilDivide(numerator, denominator)
      : floorDivide(numerator, denominator);
  return fromScaled(value, 12);
}

export function oracleMinus(left: string, right: string): string {
  return text(scaled(left) - scaled(right));
}

// O líquido de comprar `quantity` a `entry` e vender a `exit`, e a taxa sobre o débito, para baixo.
export function oracleResult(params: {
  readonly quantity: string;
  readonly entry: string;
  readonly exit: string;
  readonly feeRate: string;
}): { readonly net: string; readonly rate: string } {
  const cost = oracleBuyCost(params.quantity, params.entry, params.feeRate);
  const net = oracleMinus(oracleSellProceeds(params.quantity, params.exit, params.feeRate), cost);
  return { net, rate: oracleRate({ numerator: net, denominator: cost, direction: 'down' }) };
}

// `(para − de) ÷ de`, a 12 casas, na direção dada.
export function oracleMoveRate(from: string, to: string, direction: 'up' | 'down'): string {
  return oracleRate({ numerator: oracleMinus(to, from), denominator: from, direction });
}

// Produto exato de quantidade e preço (16 casas, sem arredondar).
export function oracleTimes(quantity: string, price: string): string {
  return fromScaled(scaled(quantity) * scaled(price), 2 * SCALE);
}
