// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  divideFloor,
  formatScaled,
  multiplyDown,
  parseScaled,
  roundScaledDirected,
  toPlainText,
} from '../format/decimal.js';
import { priceDecimals } from './symbol-filters.js';

const ZERO = 0n;
const MAXIMUM_BALANCE = 1_000_000_000_000n * 100_000_000n;

// A quantidade proporcional ao saldo da pessoa (D12-A): quantidade × meu saldo ÷ saldo da simulação, para BAIXO no passo
// do par. Tudo em BigInt de escala 8; é a única conta do painel além do desenho da régua.
export function computeProportionalQuantity(params: {
  readonly quantity: string;
  readonly runBalance: string;
  readonly myBalance: string;
  readonly quantityStep: string;
}): string | undefined {
  const quantity = parseScaled(params.quantity);
  const runBalance = parseScaled(params.runBalance);
  const myBalance = parseScaled(params.myBalance);
  const step = parseScaled(params.quantityStep);
  if (quantity === undefined || runBalance === undefined || myBalance === undefined)
    return undefined;
  if (step === undefined || step <= ZERO || myBalance <= ZERO) return undefined;
  const proportional = divideFloor(multiplyDown(quantity, myBalance), runBalance);
  if (proportional === undefined) return undefined;
  return toPlainText((proportional / step) * step);
}

// "Meu saldo" digitado: aceita vírgula ou ponto, até 8 casas; vazio, zero, negativo ou lixo não vale.
export function normalizeBalanceInput(text: string): string | undefined {
  const dotted = text.trim().replace(',', '.');
  const scaled = parseScaled(dotted);
  if (scaled === undefined || scaled <= ZERO || scaled > MAXIMUM_BALANCE) return undefined;
  return dotted;
}

// O texto que vai para a corretora: ponto decimal, sem milhar e nas casas do par.
export function toPlainAtPlaces(text: string, places: number): string {
  const scaled = parseScaled(text);
  if (scaled === undefined) return text;
  const rounded = roundScaledDirected(scaled, places, 'up');
  return formatScaled(rounded, { minimumFraction: places, maximumFraction: places })
    .replaceAll('.', '')
    .replace(',', '.');
}

export function toPlainPrice(symbol: string, text: string): string {
  return toPlainAtPlaces(text, priceDecimals(symbol));
}

export function toPlainQuantity(text: string, quantityStep: string): string {
  const places = quantityStep.split('.')[1]?.length ?? 0;
  const scaled = parseScaled(text);
  if (scaled === undefined) return text;
  const floored = roundScaledDirected(scaled, places, 'down');
  return formatScaled(floored, { minimumFraction: places, maximumFraction: places })
    .replaceAll('.', '')
    .replace(',', '.');
}

export type CopyTexts = {
  readonly price: string;
  readonly quantity: string | undefined;
  readonly target: string;
  readonly stop: string;
  readonly all: string;
};

export function buildCopyTexts(params: {
  readonly symbol: string;
  readonly referencePrice: string;
  readonly targetPrice: string;
  readonly stopPrice: string;
  readonly quantity: string | undefined;
  readonly quantityStep: string | null;
}): CopyTexts {
  const { symbol } = params;
  const price = toPlainPrice(symbol, params.referencePrice);
  const target = toPlainPrice(symbol, params.targetPrice);
  const stop = toPlainPrice(symbol, params.stopPrice);
  const quantity =
    params.quantity === undefined || params.quantityStep === null
      ? undefined
      : toPlainQuantity(params.quantity, params.quantityStep);
  const lines = [
    `Entrada: ${price}${quantity === undefined ? '' : ` · quantidade ${quantity}`}`,
    `Alvo (venda limitada): ${target}`,
    `Proteção: ${stop}`,
  ];
  return { price, quantity, target, stop, all: lines.join('\n') };
}
