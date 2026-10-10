// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  formatEngineDecimal,
  toEngineDecimal,
  type EngineDecimalValue,
} from '../engine-decimal.js';
import type { OrderEvent } from '../engine-decision.types.js';
import type { PendingOrderState } from '../engine-state.types.js';
import {
  EXIT_REASON,
  ORDER_SIDE,
  ORDER_STATUS,
  ORDER_TYPE,
  type ExitReason,
} from '../engine-vocabulary.constant.js';
import { StrategyEngineError } from '../strategy-engine.error.js';
import { buildOrderEvent, buildProtectiveExitEvents, takeKey } from './wallet-orders.js';
import { buyDebit, marketSellPrice, sellCredit, tradeFee } from './wallet-pricing.js';
import type { WalletContext, WalletDraft } from './wallet.types.js';

export type ExitFill = {
  readonly price: EngineDecimalValue;
  readonly reason: ExitReason;
  readonly events: (quantity: string) => OrderEvent[];
};

// Fecha a posição inteira: crédito = valor para baixo − taxa; lucro líquido = crédito − custo da entrada.
export function closePosition(draft: WalletDraft, exit: ExitFill, context: WalletContext): void {
  const { parameters, candle } = context;
  const position = draft.state.position;
  if (position === null) throw new StrategyEngineError('Saída sem posição aberta.');
  const quantity = toEngineDecimal(position.quantity);
  const notional = quantity.times(exit.price);
  const exitFee = tradeFee(notional, parameters);
  const credit = sellCredit(notional, parameters);
  const entryCost = buyDebit(quantity.times(toEngineDecimal(position.entryPrice)), parameters);
  const events = exit.events(position.quantity);
  draft.orders.push(...events);
  draft.fills.push({
    orderKey: events.at(-1)?.orderKey ?? '',
    positionKey: position.positionKey,
    candleOpenTime: candle.openTime,
    side: ORDER_SIDE.SELL,
    price: formatEngineDecimal(exit.price),
    quantity: position.quantity,
    notional: formatEngineDecimal(notional),
    fee: formatEngineDecimal(exitFee),
  });
  draft.closedPositions.push({
    positionKey: position.positionKey,
    openedCandleOpenTime: position.openedCandleOpenTime,
    candleOpenTime: candle.openTime,
    entryPrice: position.entryPrice,
    exitPrice: formatEngineDecimal(exit.price),
    quantity: position.quantity,
    entryFee: position.entryFee,
    exitFee: formatEngineDecimal(exitFee),
    netProfit: formatEngineDecimal(credit.minus(entryCost)),
    exitReason: exit.reason,
  });
  const cash = toEngineDecimal(draft.state.cash).plus(credit);
  draft.state = { ...draft.state, cash: formatEngineDecimal(cash), position: null };
}

// Venda pendente (sinal ou comando): a mercado, na abertura de `t+1`, com slippage contra o usuário.
export function executePendingExit(
  draft: WalletDraft,
  order: PendingOrderState,
  context: WalletContext,
): void {
  draft.state = { ...draft.state, pendingOrder: null };
  const price = marketSellPrice(toEngineDecimal(context.candle.open), context.parameters);
  closePosition(
    draft,
    {
      price,
      reason: order.exitReason ?? EXIT_REASON.SIGNAL,
      events: (quantity) => [
        buildOrderEvent({
          order,
          candleOpenTime: context.candle.openTime,
          status: ORDER_STATUS.FILLED,
          price: formatEngineDecimal(price),
          quantity,
        }),
      ],
    },
    context,
  );
}

export type ProtectiveClose = {
  readonly price: EngineDecimalValue;
  readonly reason: ExitReason;
  readonly trigger: string;
};

// Stop ou alvo: a ordem nasce e preenche no mesmo candle (`created` + `filled`, com `triggerPrice`).
export function closeProtective(
  draft: WalletDraft,
  context: WalletContext,
  exit: ProtectiveClose,
): void {
  const orderKey = takeKey(draft, 'order');
  const type = exit.reason === EXIT_REASON.STOP ? ORDER_TYPE.STOP : ORDER_TYPE.TARGET;
  const price = formatEngineDecimal(exit.price);
  closePosition(
    draft,
    {
      price: exit.price,
      reason: exit.reason,
      events: (quantity) =>
        buildProtectiveExitEvents({
          orderKey,
          candleOpenTime: context.candle.openTime,
          type,
          triggerPrice: exit.trigger,
          price,
          quantity,
        }),
    },
    context,
  );
}
