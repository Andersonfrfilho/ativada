// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { UserAssetRecord } from '@cryptoada/database';
import {
  EngineDecimal,
  formatEngineDecimal,
  ROUNDING_DIRECTION,
  roundMoney,
  type PlanLevels,
} from '@cryptoada/strategy-engine';

import type { AssetPrice } from './asset-price.js';
import type { AssetRule } from './asset-rule.js';
import { DECIMAL_PLACES } from './asset.constant.js';

export type AssetSummaryItem = {
  readonly symbol: string;
  readonly quantity: string;
  readonly averagePrice: string;
  readonly price: AssetPrice | null;
  readonly value: string | null;
  readonly cost: string;
  readonly result: string | null;
  readonly resultRate: string | null;
  readonly targetPrice: string;
  readonly stopPrice: string;
  readonly isTargetReached: boolean | null;
  readonly isStopReached: boolean | null;
  readonly rule: AssetRule | null;
};

export type AssetSummaryTotals = {
  readonly value: string;
  readonly cost: string;
  readonly result: string;
  readonly resultRate: string | null;
  readonly pricedAssets: number;
  readonly unpricedAssets: number;
};

export type BuildSummaryItemParams = {
  readonly asset: UserAssetRecord;
  readonly price: AssetPrice | null;
  readonly rule: AssetRule | null;
  readonly levels: PlanLevels;
};

// Contra o usuário: o valor atual arredonda para BAIXO, o custo para CIMA e a taxa de resultado para o lado de menos.
export function marketValue(quantity: string, price: string): string {
  const value = new EngineDecimal(quantity).times(price);
  return formatEngineDecimal(roundMoney({ value, direction: ROUNDING_DIRECTION.DOWN }));
}

export function costBasis(quantity: string, averagePrice: string): string {
  const value = new EngineDecimal(quantity).times(averagePrice);
  return formatEngineDecimal(roundMoney({ value, direction: ROUNDING_DIRECTION.UP }));
}

export function resultRateOf(result: string, cost: string): string | null {
  const base = new EngineDecimal(cost);
  if (base.isZero()) return null;
  const rate = new EngineDecimal(result)
    .dividedBy(base)
    .toDecimalPlaces(DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR);
  return formatEngineDecimal(rate);
}

export function buildSummaryItem(params: BuildSummaryItemParams): AssetSummaryItem {
  const { asset, price, levels } = params;
  const cost = costBasis(asset.quantity, asset.averagePrice);
  const value = price === null ? null : marketValue(asset.quantity, price.value);
  const result = value === null ? null : formatEngineDecimal(new EngineDecimal(value).minus(cost));
  const observed = price === null ? null : new EngineDecimal(price.value);
  return {
    symbol: asset.symbol,
    quantity: asset.quantity,
    averagePrice: asset.averagePrice,
    price,
    value,
    cost,
    result,
    resultRate: result === null ? null : resultRateOf(result, cost),
    targetPrice: levels.target.price,
    stopPrice: levels.stop.price,
    isTargetReached: observed === null ? null : observed.gte(levels.target.price),
    isStopReached: observed === null ? null : observed.lte(levels.stop.price),
    rule: params.rule,
  };
}

// O total soma só o que tem preço (custo e valor do mesmo conjunto); quem está sem preço é contado à parte.
export function buildTotals(items: readonly AssetSummaryItem[]): AssetSummaryTotals {
  let value = new EngineDecimal(0);
  let cost = new EngineDecimal(0);
  const priced = items.filter((item) => item.value !== null);
  for (const item of priced) {
    value = value.plus(item.value ?? 0);
    cost = cost.plus(item.cost);
  }
  const result = formatEngineDecimal(value.minus(cost));
  return {
    value: formatEngineDecimal(value),
    cost: formatEngineDecimal(cost),
    result,
    resultRate: resultRateOf(result, formatEngineDecimal(cost)),
    pricedAssets: priced.length,
    unpricedAssets: items.length - priced.length,
  };
}
