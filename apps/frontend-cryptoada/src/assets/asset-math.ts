// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AssetItem } from './asset.validation.js';

export type AssetNumbers = {
  readonly value: number | undefined;
  readonly result: number | undefined;
  readonly resultRate: number | undefined;
  readonly isTargetReached: boolean | undefined;
  readonly isStopReached: boolean | undefined;
};

function fromSummary(item: AssetItem): AssetNumbers {
  return {
    value: item.value === null ? undefined : Number(item.value),
    result: item.result === null ? undefined : Number(item.result),
    resultRate: item.resultRate === null ? undefined : Number(item.resultRate),
    isTargetReached: item.isTargetReached ?? undefined,
    isStopReached: item.isStopReached ?? undefined,
  };
}

// Com um tick vivo o painel refaz as contas do resumo no navegador; sem ele vale o que o servidor calculou.
export function computeAssetNumbers(item: AssetItem, livePrice: string | undefined): AssetNumbers {
  if (livePrice === undefined) return fromSummary(item);
  const price = Number(livePrice);
  const value = Number(item.quantity) * price;
  const cost = Number(item.cost);
  const result = value - cost;
  return {
    value,
    result,
    resultRate: cost === 0 ? undefined : result / cost,
    isTargetReached: price >= Number(item.targetPrice),
    isStopReached: price <= Number(item.stopPrice),
  };
}

// A cotação que o usuário digitou: aceita vírgula; texto vazio ou inválido é "sem cotação".
export function parseRate(text: string): number | undefined {
  const rate = Number(text.trim().replace(',', '.'));
  return Number.isFinite(rate) && rate > 0 ? rate : undefined;
}
