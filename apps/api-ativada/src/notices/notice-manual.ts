// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  NOTICE_SOURCE,
  ORDER_TYPE,
  type NoticeHistory,
  type NoticeSourceRow,
} from '@ativada/database';
import { toEngineDecimal } from '@ativada/strategy-engine';

import { NOTICE_STATE } from './notice.constant.js';
import { computeManualMath, type ManualMath } from './notice-manual-math.js';
import { buildManualTexts, type ManualTexts } from './notice-manual-messages.js';
import { addDuration } from './notice-timing.js';

const MILLISECONDS_PER_DAY = 86_400_000;

export type NoticeManual = ManualTexts & {
  readonly orderType: string | null;
  readonly decidedAt: string | null;
  readonly referencePrice: string;
  readonly quantity: string | null;
  readonly runBalance: string | null;
  readonly notional: string | null;
  readonly targetPrice: string;
  readonly stopPrice: string;
  readonly tickSize: string | null;
  readonly quantityStep: string | null;
  readonly costRate: string | null;
  readonly netGainRate: string | null;
  readonly netLossRate: string | null;
  readonly netRatio: string | null;
  readonly breakEvenEntry: string | null;
  readonly history: { readonly days: number; readonly netReturnRate: string } | null;
};

// "Operar à mão" só existe para a compra executada e para a venda: é o que a pessoa copia para a corretora.
export function hasManual(row: NoticeSourceRow): boolean {
  const isFilledEntry =
    row.source === NOTICE_SOURCE.ENTRY_ORDER && row.state === NOTICE_STATE.FILLED;
  const isExit = row.source === NOTICE_SOURCE.EXIT_POSITION;
  return (isFilledEntry || isExit) && row.targetPrice !== undefined && row.stopPrice !== undefined;
}

function toHistory(history: NoticeHistory | undefined): NoticeManual['history'] {
  if (history === undefined) return null;
  const days = Math.round(history.elapsedMilliseconds / MILLISECONDS_PER_DAY);
  return { days, netReturnRate: history.totalReturn };
}

function readMath(row: NoticeSourceRow, entry: string): ManualMath | undefined {
  const { feeRate, slippageRate, tickSize, targetPrice, stopPrice } = row;
  if (
    feeRate === undefined ||
    slippageRate === undefined ||
    tickSize === undefined ||
    targetPrice === undefined ||
    stopPrice === undefined
  ) {
    return undefined;
  }
  return computeManualMath({
    entry,
    target: targetPrice,
    stop: stopPrice,
    feeRate,
    slippageRate,
    tickSize,
  });
}

function computeNotional(row: NoticeSourceRow, reference: string): string | null {
  if (row.notional !== undefined) return row.notional;
  if (row.quantity === undefined) return null;
  return toEngineDecimal(row.quantity).times(reference).toFixed();
}

// O bloco "Operar à mão" (RF27 a RF33): só o que a simulação gravou, com as contas contra o usuário e as frases do catálogo.
export function buildNoticeManual(
  row: NoticeSourceRow,
  history: NoticeHistory | undefined,
): NoticeManual | undefined {
  const { targetPrice, stopPrice } = row;
  const reference = row.entryPrice ?? row.price;
  if (
    !hasManual(row) ||
    reference === undefined ||
    targetPrice === undefined ||
    stopPrice === undefined
  ) {
    return undefined;
  }
  const math = readMath(row, reference);
  const notional = computeNotional(row, reference);
  const base = {
    orderType: row.orderType ?? null,
    decidedAt: addDuration(row.createdCandleTime, row.timeframe) ?? null,
    referencePrice: reference,
    quantity: row.quantity ?? null,
    runBalance: row.initialBalance ?? null,
    notional,
    targetPrice,
    stopPrice,
    tickSize: row.tickSize ?? null,
    quantityStep: row.quantityStep ?? null,
    costRate: math?.costRate ?? null,
    netGainRate: math?.netGainRate ?? null,
    netLossRate: math?.netLossRate ?? null,
    netRatio: math?.netRatio ?? null,
    breakEvenEntry: math?.breakEvenEntry ?? null,
    history: toHistory(history),
  };
  const isLimit = row.orderType === ORDER_TYPE.LIMIT;
  return { ...base, ...buildManualTexts({ row, reference, math, isLimit, history: base.history }) };
}
