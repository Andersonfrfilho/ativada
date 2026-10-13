// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatSignedScaledPercent, parseScaled } from '../format/decimal.js';
import { formatPrice, formatQuantity } from '../format/format.js';
import { formatInZone } from '../format/zoned-time.js';
import {
  formatDirectedMoney,
  formatDirectedResult,
  type RoundingDirection,
} from './directed-money.js';
import { exitReasonText } from './run.constant.js';
import type { Trade } from './run.validation.js';

export const OPEN_TRADE_TEXT = 'aberta';
const MISSING_TEXT = '—';

export type ResultTone = 'gain' | 'loss' | 'none';

// O texto de cada coluna da tabela de operações; dinheiro e quantidade saem do texto decimal do servidor, sem `Number`.
export type TradeRowText = {
  readonly opened: string;
  readonly closed: string;
  readonly entryPrice: string;
  readonly exitPrice: string;
  readonly quantity: string;
  readonly paid: string;
  readonly received: string;
  readonly fees: string;
  readonly result: string;
  readonly resultTone: ResultTone;
  readonly reason: string;
};

export type TradeRowParams = { readonly trade: Trade; readonly timeZone: string };

function moneyOrMissing(text: string | undefined, direction: RoundingDirection): string {
  return text === undefined ? MISSING_TEXT : formatDirectedMoney(text, direction);
}

type Outcome = { readonly text: string; readonly tone: ResultTone };

// "+94,20 (+1,57%)": o resultado em USDT e, quando o servidor mandou, a taxa sobre o valor pago.
function describeOutcome(trade: Trade): Outcome {
  const profit = trade.netProfit === undefined ? undefined : parseScaled(trade.netProfit);
  if (profit === undefined) return { text: MISSING_TEXT, tone: 'none' };
  const rate = trade.netProfitRate === undefined ? undefined : parseScaled(trade.netProfitRate);
  const percent = rate === undefined ? '' : ` (${formatSignedScaledPercent(rate)})`;
  return {
    text: `${formatDirectedResult(profit)}${percent}`,
    tone: profit >= 0n ? 'gain' : 'loss',
  };
}

export function describeTradeRow(params: TradeRowParams): TradeRowText {
  const { trade, timeZone } = params;
  const outcome = describeOutcome(trade);
  return {
    opened: formatInZone(trade.openedCandleTime, timeZone),
    closed:
      trade.closedCandleTime === undefined
        ? OPEN_TRADE_TEXT
        : formatInZone(trade.closedCandleTime, timeZone),
    entryPrice: formatPrice(trade.entryPrice),
    exitPrice: trade.exitPrice === undefined ? MISSING_TEXT : formatPrice(trade.exitPrice),
    quantity: formatQuantity(trade.quantity),
    paid: moneyOrMissing(trade.paid, 'up'),
    received: moneyOrMissing(trade.received, 'down'),
    fees: moneyOrMissing(trade.fees, 'up'),
    result: outcome.text,
    resultTone: outcome.tone,
    reason: trade.exitReason === undefined ? MISSING_TEXT : exitReasonText(trade.exitReason),
  };
}
