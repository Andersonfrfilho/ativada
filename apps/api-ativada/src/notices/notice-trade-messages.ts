// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ROUNDING_DIRECTION } from '@ativada/strategy-engine';

import {
  formatPrice,
  formatRatePercent,
  MINUS_SIGN,
} from '../runs/live-status/live-number-format.js';
import { formatNoticePrice } from './notice-price-format.js';
import {
  NOTICE_CODE,
  NOTICE_TIME_TOKEN,
  type NoticeCode,
  type NoticeText,
} from './notice-messages.js';

const QUOTE_ASSET = 'USDT';
const FEE_UNIT = QUOTE_ASSET;

// "LINKUSDT" vira "LINK/USDT"; símbolo fora do padrão segue como veio.
export function formatPair(symbol: string): string {
  if (!symbol.endsWith(QUOTE_ASSET) || symbol.length === QUOTE_ASSET.length) return symbol;
  return `${symbol.slice(0, -QUOTE_ASSET.length)}/${QUOTE_ASSET}`;
}

export type EntryFilledParams = {
  readonly symbol: string;
  readonly price: string;
  readonly targetPrice: string | undefined;
  readonly stopPrice: string | undefined;
  readonly fee: string | undefined;
};

// RF17: o verbo é do SINAL da estratégia, nunca da pessoa; sempre com o preço.
export function buildEntryFilledText(params: EntryFilledParams): NoticeText {
  const { symbol, price, targetPrice, stopPrice, fee } = params;
  const pair = formatPair(symbol);
  const levels =
    targetPrice === undefined || stopPrice === undefined
      ? ''
      : ` · vender no alvo ${formatNoticePrice(symbol, targetPrice)} · sair se cair a ${formatNoticePrice(symbol, stopPrice)}`;
  const feeText = fee === undefined ? '' : ` · taxa ${formatPrice(fee)} ${FEE_UNIT}`;
  return {
    title: 'Sinal de compra · executada',
    message: `Sinal de compra: ${pair} a ${formatNoticePrice(symbol, price)}${levels}.`,
    detail: `Executada às ${NOTICE_TIME_TOKEN.AT}${feeText}.`,
  };
}

const EXIT_TEXT: Readonly<Record<string, { readonly title: string; readonly reason: string }>> = {
  [NOTICE_CODE.EXIT_TARGET]: { title: 'Sinal de venda · alvo', reason: 'Chegou ao alvo de lucro.' },
  [NOTICE_CODE.EXIT_SIGNAL]: { title: 'Sinal de venda', reason: 'A estratégia virou para vender.' },
  [NOTICE_CODE.EXIT_COMMAND]: { title: 'Sinal de venda · meta', reason: 'A meta chegou ao fim.' },
  [NOTICE_CODE.EXIT_GAP]: { title: 'Sinal de venda · dados', reason: 'Faltaram dados do mercado.' },
};

export type ExitParams = {
  readonly code: NoticeCode;
  readonly symbol: string;
  readonly price: string;
  readonly stopPrice: string | undefined;
  readonly resultRate: string | undefined;
  readonly fee: string | undefined;
};

function exitReason(params: ExitParams): { readonly title: string; readonly reason: string } {
  if (params.code === NOTICE_CODE.EXIT_STOP) {
    const stop =
      params.stopPrice === undefined
        ? ''
        : ` (${formatNoticePrice(params.symbol, params.stopPrice)})`;
    return { title: 'Sinal de venda · proteção', reason: `Caiu até a saída de proteção${stop}.` };
  }
  const found = EXIT_TEXT[params.code];
  if (found === undefined) throw new Error(`Código de saída desconhecido: ${params.code}`);
  return found;
}

// Resultado com sinal e a base dita: positivo "+", negativo "−", zero "=" (nunca só cor).
export function formatResultOnBalance(resultRate: string): string {
  const percent = formatRatePercent(resultRate, ROUNDING_DIRECTION.DOWN);
  if (percent.startsWith(MINUS_SIGN)) return percent;
  return percent === '0,00' ? `= ${percent}` : `+${percent}`;
}

export function buildExitText(params: ExitParams): NoticeText {
  const { title, reason } = exitReason(params);
  const result =
    params.resultRate === undefined
      ? undefined
      : `Resultado: ${formatResultOnBalance(params.resultRate)}% do saldo inicial da simulação`;
  const feeText = params.fee === undefined ? '' : ` · taxa ${formatPrice(params.fee)} ${FEE_UNIT}`;
  return {
    title,
    message: `Sinal de venda: sair a ${formatNoticePrice(params.symbol, params.price)}. ${reason}`,
    detail: result === undefined ? null : `${result}${feeText}.`,
  };
}

export function buildPriceAlertText(params: {
  readonly symbol: string;
  readonly price: string;
  readonly isAbove: boolean;
}): NoticeText {
  const verb = params.isAbove ? 'passou de' : 'caiu abaixo de';
  return {
    title: 'Alerta de preço',
    message: `${formatPair(params.symbol)} ${verb} ${formatNoticePrice(params.symbol, params.price)}.`,
    detail: null,
  };
}
