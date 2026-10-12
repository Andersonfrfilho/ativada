// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  divideFloor,
  multiplyDown,
  parseScaled,
  roundScaledHalfUp,
  toPlainText,
} from '../format/decimal.js';
import type { AssetItem } from './asset.validation.js';

// Tudo em BigInt escalado (8 casas): a mesma aritmética e o mesmo arredondamento do servidor (ADR 0002 "Seus ativos").
export type AssetNumbers = {
  readonly value: bigint | undefined;
  readonly cost: bigint;
  readonly result: bigint | undefined;
  readonly resultRate: bigint | undefined;
  readonly isTargetReached: boolean | undefined;
  readonly isStopReached: boolean | undefined;
};

const ZERO = 0n;

function scaledOrUndefined(text: string | null): bigint | undefined {
  return text === null ? undefined : parseScaled(text);
}

function fromSummary(item: AssetItem): AssetNumbers {
  return {
    value: scaledOrUndefined(item.value),
    cost: parseScaled(item.cost) ?? ZERO,
    result: scaledOrUndefined(item.result),
    resultRate: scaledOrUndefined(item.resultRate),
    isTargetReached: item.isTargetReached ?? undefined,
    isStopReached: item.isStopReached ?? undefined,
  };
}

// Com um tick vivo o painel refaz as contas do resumo no navegador; sem ele vale o que o servidor calculou.
export function computeAssetNumbers(item: AssetItem, livePrice: string | undefined): AssetNumbers {
  const price = livePrice === undefined ? undefined : parseScaled(livePrice);
  const quantity = parseScaled(item.quantity);
  if (price === undefined || quantity === undefined) return fromSummary(item);
  const value = multiplyDown(quantity, price);
  const cost = parseScaled(item.cost) ?? ZERO;
  const result = value - cost;
  const target = parseScaled(item.targetPrice);
  const stop = parseScaled(item.stopPrice);
  return {
    value,
    cost,
    result,
    resultRate: divideFloor(result, cost),
    isTargetReached: target === undefined ? undefined : price >= target,
    isStopReached: stop === undefined ? undefined : price <= stop,
  };
}

export type AssetTotals = {
  readonly value: bigint;
  readonly cost: bigint;
  readonly result: bigint;
  readonly resultRate: bigint | undefined;
  readonly pricedAssets: number;
  readonly unpricedAssets: number;
};

// Só soma o que tem preço (valor e custo do mesmo conjunto), como o resumo do servidor.
export function sumAssetNumbers(all: readonly AssetNumbers[]): AssetTotals {
  const priced = all.filter((numbers) => numbers.value !== undefined);
  const value = priced.reduce((sum, numbers) => sum + (numbers.value ?? ZERO), ZERO);
  const cost = priced.reduce((sum, numbers) => sum + numbers.cost, ZERO);
  const result = value - cost;
  return {
    value,
    cost,
    result,
    resultRate: divideFloor(result, cost),
    pricedAssets: priced.length,
    unpricedAssets: all.length - priced.length,
  };
}

// A cotação que o usuário digitou: aceita vírgula; vazio, zero ou inválido é "sem cotação".
export function parseRate(text: string): bigint | undefined {
  const rate = parseScaled(text.trim().replace(',', '.'));
  return rate !== undefined && rate > ZERO ? rate : undefined;
}

// Cada cartão e o total em R$ usam o MESMO arredondamento (centavos, meio para cima), então o total soma os cartões.
export function toReais(value: bigint, rate: bigint): bigint {
  return roundScaledHalfUp(multiplyDown(value, rate), 2);
}

export function toText(value: bigint): string {
  return toPlainText(value);
}
