// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { FillInput, PositionInput } from '@ativada/database';
import {
  EngineDecimal,
  formatEngineDecimal,
  type EngineDecimalValue,
} from '@ativada/strategy-engine';

import { formatOptionalDecimal, roundMoneyDown, roundMoneyUp } from '../money-rounding.js';

export type TradeAmounts = {
  readonly entryNotional: string | undefined;
  readonly exitNotional: string | undefined;
  readonly paid: string | undefined;
  readonly received: string | undefined;
  readonly fees: string;
  readonly netProfitRate: string | undefined;
};

export type TradeAmountsParams = {
  readonly position: PositionInput;
  readonly entryFill: FillInput | undefined;
  readonly exitFill: FillInput | undefined;
};

// A conta do caixa do motor: a compra debita `ceil8(notional) + taxa`, a venda credita `floor8(notional) - taxa`,
// então `received - paid` é exatamente o `net_profit` da posição.
function computePaid(params: TradeAmountsParams): EngineDecimalValue | undefined {
  if (params.entryFill === undefined) return undefined;
  return roundMoneyUp(new EngineDecimal(params.entryFill.notional)).plus(params.position.entryFee);
}

function computeReceived(params: TradeAmountsParams): EngineDecimalValue | undefined {
  const { position, exitFill } = params;
  if (exitFill === undefined || position.exitFee === undefined) return undefined;
  return roundMoneyDown(new EngineDecimal(exitFill.notional)).minus(position.exitFee);
}

// Piso para -infinito a 8 casas: o prejuízo nunca aparece menor do que é.
function computeRate(
  netProfit: string | undefined,
  paid: EngineDecimalValue | undefined,
): EngineDecimalValue | undefined {
  if (netProfit === undefined || paid === undefined || paid.isZero()) return undefined;
  return roundMoneyDown(new EngineDecimal(netProfit).dividedBy(paid));
}

export function computeTradeAmounts(params: TradeAmountsParams): TradeAmounts {
  const { position } = params;
  const paid = computePaid(params);
  return {
    entryNotional: params.entryFill?.notional,
    exitNotional: params.exitFill?.notional,
    paid: formatOptionalDecimal(paid),
    received: formatOptionalDecimal(computeReceived(params)),
    fees: formatEngineDecimal(new EngineDecimal(position.entryFee).plus(position.exitFee ?? 0)),
    netProfitRate: formatOptionalDecimal(computeRate(position.netProfit, paid)),
  };
}
