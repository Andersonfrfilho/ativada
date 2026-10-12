// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { UserAssetDecision, UserAssetRecord } from '@ativada/database';
import { USER_ASSET_DECISION_KIND } from '@ativada/database';
import {
  EngineDecimal,
  formatEngineDecimal,
  type EngineDecimalValue,
} from '@ativada/strategy-engine';

import { ASSET_REFUSAL, DECIMAL_PLACES } from './asset.constant.js';

const ZERO = new EngineDecimal(0);

function save(quantity: EngineDecimalValue, averagePrice: EngineDecimalValue): UserAssetDecision {
  return {
    kind: USER_ASSET_DECISION_KIND.SAVE,
    quantity: formatEngineDecimal(quantity),
    averagePrice: formatEngineDecimal(averagePrice),
  };
}

export type BuyParams = {
  readonly current: UserAssetRecord | undefined;
  readonly quantity: string;
  readonly price: string;
};

// Compra: o preço médio é PONDERADO pela quantidade, `(q₀·p₀ + q·p) / (q₀ + q)`, arredondado para CIMA a 8 casas (contra o
// usuário: o custo médio mais alto mostra um resultado menor). Sem posição, ou com a quantidade zerada, vale o preço pago.
export function decideBuy(params: BuyParams): UserAssetDecision {
  const bought = new EngineDecimal(params.quantity);
  const price = new EngineDecimal(params.price);
  const held = new EngineDecimal(params.current?.quantity ?? ZERO);
  const heldPrice = new EngineDecimal(params.current?.averagePrice ?? ZERO);
  const total = held.plus(bought);
  const average = held
    .times(heldPrice)
    .plus(bought.times(price))
    .dividedBy(total)
    .toDecimalPlaces(DECIMAL_PLACES, EngineDecimal.ROUND_CEIL);
  return save(total, average);
}

export type SellParams = {
  readonly current: UserAssetRecord | undefined;
  readonly quantity: string;
};

// Venda: nunca passa do que há; o preço médio não muda (vender não altera o custo do que sobra).
export function decideSell(params: SellParams): UserAssetDecision {
  const { current } = params;
  if (current === undefined) {
    return { kind: USER_ASSET_DECISION_KIND.REFUSE, reason: ASSET_REFUSAL.NOT_FOUND };
  }
  const held = new EngineDecimal(current.quantity);
  const sold = new EngineDecimal(params.quantity);
  if (sold.greaterThan(held)) {
    return { kind: USER_ASSET_DECISION_KIND.REFUSE, reason: ASSET_REFUSAL.INSUFFICIENT_QUANTITY };
  }
  return save(held.minus(sold), new EngineDecimal(current.averagePrice));
}

export type ReplaceParams = { readonly quantity: string; readonly averagePrice: string };

// PUT: a posição como o usuário a digitou, sem conta nenhuma.
export function decideReplace(params: ReplaceParams): UserAssetDecision {
  return save(new EngineDecimal(params.quantity), new EngineDecimal(params.averagePrice));
}
