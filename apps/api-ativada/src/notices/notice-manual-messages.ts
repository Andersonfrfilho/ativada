// Copyright (c) 2026 Ada Technology. All rights reserved.
import { NOTICE_SOURCE, type NoticeSourceRow } from '@ativada/database';
import { EngineDecimal, ROUNDING_DIRECTION, toEngineDecimal } from '@ativada/strategy-engine';

import {
  formatAmount,
  formatExactPercent,
  formatRatePercent,
} from '../runs/live-status/live-number-format.js';
import { NOTICE_TIME_TOKEN } from './notice-messages.js';
import type { ManualMath } from './notice-manual-math.js';
import { formatNoticePrice } from './notice-price-format.js';
import { formatPair } from './notice-trade-messages.js';

const { UP, DOWN } = ROUNDING_DIRECTION;
const QUOTE_ASSET = 'USDT';

export const MANUAL_HONESTY =
  'A simulação executa sem atraso e sem a oscilação de preço real. À mão haverá diferença (deslizamento e atraso) e você pode perder dinheiro. O AtivAdA não envia ordens e não tem chave da sua corretora.';

export type ManualTexts = {
  readonly how: string | null;
  readonly quantityText: string | null;
  readonly costText: string | null;
  readonly netText: string | null;
  readonly giveUpText: string | null;
  readonly historyText: string;
  readonly honesty: string;
};

type TextParams = {
  readonly row: NoticeSourceRow;
  readonly reference: string;
  readonly math: ManualMath | undefined;
  readonly isLimit: boolean;
  readonly history: { readonly days: number; readonly netReturnRate: string } | null;
};

function baseAsset(symbol: string): string {
  return symbol.endsWith(QUOTE_ASSET) ? symbol.slice(0, -QUOTE_ASSET.length) : symbol;
}

function formatQuantityStep(quantity: string, quantityStep: string | undefined): string {
  const places = quantityStep?.split('.')[1]?.length ?? 0;
  const fixed = toEngineDecimal(quantity)
    .toDecimalPlaces(places, EngineDecimal.ROUND_FLOOR)
    .toFixed(places);
  const [whole = '0', fraction] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return fraction === undefined ? grouped : `${grouped},${fraction}`;
}

function describeHow(params: TextParams): string | null {
  const { row, reference, isLimit } = params;
  if (row.source !== NOTICE_SOURCE.ENTRY_ORDER) return null;
  const price = formatNoticePrice(row.symbol, reference);
  const { DECIDED, CONFIRMED } = NOTICE_TIME_TOKEN;
  if (isLimit) {
    return `Ordem limitada em ${price}. Decidiu no fechamento das ${DECIDED}; executou quando o preço chegou ao limite (confirmado às ${CONFIRMED}). Preço de referência: ${price}.`;
  }
  return `Ordem a mercado. Decidiu no fechamento das ${DECIDED} e comprou pelo preço de abertura da vela das ${DECIDED} (confirmado às ${CONFIRMED}). Preço de referência: ${price}.`;
}

function describeQuantity(params: TextParams): string | null {
  const { row, reference } = params;
  if (row.source !== NOTICE_SOURCE.ENTRY_ORDER || row.quantity === undefined) return null;
  const notional = row.notional ?? toEngineDecimal(row.quantity).times(reference).toFixed();
  const balance =
    row.initialBalance === undefined
      ? ''
      : ` com saldo de ${formatAmount(row.initialBalance, DOWN)} ${QUOTE_ASSET}`;
  return `A simulação comprou ${formatQuantityStep(row.quantity, row.quantityStep)} ${baseAsset(row.symbol)} (≈ ${formatAmount(notional, DOWN)} ${QUOTE_ASSET})${balance}. A quantidade real depende do seu saldo e da sua corretora.`;
}

function describeCost(params: TextParams): string | null {
  const { row, math } = params;
  if (math === undefined || row.feeRate === undefined || row.slippageRate === undefined)
    return null;
  return `Custo estimado ida e volta: ${formatRatePercent(math.costRate, UP)}% (taxa ${formatExactPercent(row.feeRate)}% + deslizamento ${formatExactPercent(row.slippageRate)}% por lado, os da simulação).`;
}

function describeNet(math: ManualMath | undefined): string | null {
  if (math === undefined) return null;
  const gain = `+${formatRatePercent(math.netGainRate, DOWN)}%`;
  const loss = `${formatRatePercent(math.netLossRate, DOWN)}%`;
  const ratio =
    math.netRatio === null ? '' : ` · ganho ÷ perda ${math.netRatio.replace('.', ',')} : 1`;
  return `Ganho possível depois do custo: ${gain} · perda possível depois do custo: ${loss}${ratio}.`;
}

function describeGiveUp(params: TextParams): string | null {
  const { row, math, reference } = params;
  if (math?.breakEvenEntry === null || math === undefined) return null;
  const isBelow = toEngineDecimal(reference).lessThanOrEqualTo(math.breakEvenEntry);
  const price = formatNoticePrice(row.symbol, math.breakEvenEntry);
  const where = isBelow ? 'abaixo' : 'acima';
  return `A simulação compra a mercado e não desiste pelo preço. Para quem opera à mão: acima de ${price} o ganho depois do custo já fica menor que a perda (este sinal entrou ${where} disso). Não é regra da simulação.`;
}

// "15m" -> "15 min", "1h" -> "1 h", "1d" -> "1 dia".
function formatTimeframe(timeframe: string | undefined): string {
  if (timeframe === undefined) return '';
  const amount = timeframe.slice(0, -1);
  const unit = timeframe.slice(-1);
  if (unit === 'm') return `${amount} min`;
  if (unit === 'h') return `${amount} h`;
  return unit === 'd' ? `${amount} ${amount === '1' ? 'dia' : 'dias'}` : timeframe;
}

function describeHistory(params: TextParams): string {
  const { history, row } = params;
  if (history === null) return 'Sem histórico deste par. Rode um backtest em Backtests.';
  const rate = formatRatePercent(history.netReturnRate, DOWN);
  const pair = `${formatPair(row.symbol)} ${formatTimeframe(row.timeframe)}`.trim();
  return `Últimos ${history.days} dias, ${pair}, com taxas: ${rate}%.`;
}

export function buildManualTexts(params: TextParams): ManualTexts {
  return {
    how: describeHow(params),
    quantityText: describeQuantity(params),
    costText: describeCost(params),
    netText: describeNet(params.math),
    giveUpText: describeGiveUp(params),
    historyText: describeHistory(params),
    honesty: MANUAL_HONESTY,
  };
}
