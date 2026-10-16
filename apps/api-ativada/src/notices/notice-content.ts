// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EXIT_REASON,
  GOAL_RUN_OUTCOME,
  NOTICE_SOURCE,
  ORDER_REASON,
  ORDER_STATUS,
  ORDER_TYPE,
  type NoticeSourceRow,
} from '@ativada/database';
import { EngineDecimal, toEngineDecimal } from '@ativada/strategy-engine';

import { formatNoticePrice } from './notice-price-format.js';
import {
  buildLimitExpiredText,
  buildLimitOrderText,
  NOTICE_CODE,
  staticNoticeText,
  type NoticeCode,
  type NoticeText,
} from './notice-messages.js';
import {
  buildEntryFilledText,
  buildExitText,
  buildPriceAlertText,
} from './notice-trade-messages.js';

export type NoticeContent = {
  readonly code: NoticeCode;
  readonly text: NoticeText;
  readonly price: string | undefined;
  readonly resultRate: string | undefined;
};

const RATE_DECIMAL_PLACES = 12;

// Resultado da saída sobre o saldo inicial da simulação, para baixo (nunca a favor do usuário); sem base, sem taxa.
export function computeResultRate(row: NoticeSourceRow): string | undefined {
  if (row.netProfit === undefined || row.initialBalance === undefined) return undefined;
  const balance = toEngineDecimal(row.initialBalance);
  if (!balance.isPositive()) return undefined;
  return toEngineDecimal(row.netProfit)
    .dividedBy(balance)
    .toDecimalPlaces(RATE_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR)
    .toFixed();
}

const CANCELLED_CODE: Readonly<Record<string, NoticeCode>> = {
  [ORDER_REASON.COMMAND]: NOTICE_CODE.CANCEL_COMMAND,
  [ORDER_REASON.GAP]: NOTICE_CODE.EXPIRE_GAP,
};

const REJECTED_CODE: Readonly<Record<string, NoticeCode>> = {
  [ORDER_REASON.ZERO_ATR]: NOTICE_CODE.REJECT_ZERO_ATR,
  [ORDER_REASON.BELOW_MIN_NOTIONAL]: NOTICE_CODE.REJECT_BELOW_MIN_NOTIONAL,
  [ORDER_REASON.INVALID_STOP]: NOTICE_CODE.REJECT_INVALID_STOP,
};

function resolveEntryCode(row: NoticeSourceRow): NoticeCode {
  const reason = row.reason ?? '';
  switch (row.state) {
    case ORDER_STATUS.CREATED:
      return row.orderType === ORDER_TYPE.LIMIT
        ? NOTICE_CODE.ENTRY_CREATED_LIMIT
        : NOTICE_CODE.ENTRY_CREATED;
    case ORDER_STATUS.FILLED:
      return NOTICE_CODE.ENTRY_FILLED;
    case ORDER_STATUS.CANCELLED:
      return CANCELLED_CODE[reason] ?? NOTICE_CODE.CANCEL_OPPOSITE_SIGNAL;
    case ORDER_STATUS.EXPIRED:
      return reason === ORDER_REASON.GAP ? NOTICE_CODE.EXPIRE_GAP : NOTICE_CODE.EXPIRE_LIMIT;
    default:
      return REJECTED_CODE[reason] ?? NOTICE_CODE.REJECT_OTHER;
  }
}

function entryText(code: NoticeCode, limit: string): NoticeText {
  if (code === NOTICE_CODE.ENTRY_CREATED_LIMIT) return buildLimitOrderText(limit);
  if (code === NOTICE_CODE.EXPIRE_LIMIT) return buildLimitExpiredText(limit);
  return staticNoticeText(code);
}

function entryContent(row: NoticeSourceRow): NoticeContent {
  const code = resolveEntryCode(row);
  if (code === NOTICE_CODE.ENTRY_FILLED && row.price !== undefined) {
    const text = buildEntryFilledText({
      symbol: row.symbol,
      price: row.price,
      targetPrice: row.targetPrice,
      stopPrice: row.stopPrice,
      fee: row.fee,
    });
    return { code, text, price: row.price, resultRate: undefined };
  }
  const limit = row.limitPrice === undefined ? '' : formatNoticePrice(row.symbol, row.limitPrice);
  return { code, text: entryText(code, limit), price: undefined, resultRate: undefined };
}

const EXIT_CODE: Readonly<Record<string, NoticeCode>> = {
  [EXIT_REASON.TARGET]: NOTICE_CODE.EXIT_TARGET,
  [EXIT_REASON.STOP]: NOTICE_CODE.EXIT_STOP,
  [EXIT_REASON.SIGNAL]: NOTICE_CODE.EXIT_SIGNAL,
  [EXIT_REASON.COMMAND]: NOTICE_CODE.EXIT_COMMAND,
  [EXIT_REASON.GAP]: NOTICE_CODE.EXIT_GAP,
};

function exitContent(row: NoticeSourceRow): NoticeContent {
  const code = EXIT_CODE[row.reason ?? ''];
  if (code === undefined || row.price === undefined) {
    throw new Error('Saída gravada sem motivo ou preço.');
  }
  const resultRate = computeResultRate(row);
  const text = buildExitText({
    code,
    symbol: row.symbol,
    price: row.price,
    stopPrice: row.stopPrice,
    resultRate,
    fee: row.fee,
  });
  return { code, text, price: row.price, resultRate };
}

const GOAL_CODE: Readonly<Record<string, NoticeCode>> = {
  [GOAL_RUN_OUTCOME.REACHED]: NOTICE_CODE.GOAL_REACHED,
  [GOAL_RUN_OUTCOME.STOPPED]: NOTICE_CODE.GOAL_STOPPED,
  [GOAL_RUN_OUTCOME.EXPIRED]: NOTICE_CODE.GOAL_EXPIRED,
};

function plainContent(code: NoticeCode): NoticeContent {
  return { code, text: staticNoticeText(code), price: undefined, resultRate: undefined };
}

function priceAlertContent(row: NoticeSourceRow): NoticeContent {
  const isAbove = row.reason === 'above';
  const code = isAbove ? NOTICE_CODE.PRICE_ALERT_ABOVE : NOTICE_CODE.PRICE_ALERT_BELOW;
  const price = row.price ?? '0';
  const text = buildPriceAlertText({ symbol: row.symbol, price, isAbove });
  return { code, text, price, resultRate: undefined };
}

export function resolveNoticeContent(row: NoticeSourceRow): NoticeContent {
  switch (row.source) {
    case NOTICE_SOURCE.ENTRY_ORDER:
      return entryContent(row);
    case NOTICE_SOURCE.EXIT_POSITION:
      return exitContent(row);
    case NOTICE_SOURCE.RUN_STALLED:
      return plainContent(NOTICE_CODE.RUN_STALLED);
    case NOTICE_SOURCE.RUN_RESUMED:
      return plainContent(NOTICE_CODE.RUN_RESUMED);
    case NOTICE_SOURCE.RUN_WAITING:
      return plainContent(NOTICE_CODE.RUN_WAITING);
    case NOTICE_SOURCE.RUN_GOAL:
      return plainContent(GOAL_CODE[row.state ?? ''] ?? NOTICE_CODE.GOAL_EXPIRED);
    default:
      return priceAlertContent(row);
  }
}
