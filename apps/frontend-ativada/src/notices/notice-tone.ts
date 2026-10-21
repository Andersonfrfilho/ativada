// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ROUTE_PATH } from '../app/app.constant.js';
import type { IconName } from '../layout/Icon.component.js';
import { NOTICE_KIND, NOTICE_STATE } from './notice.constant.js';
import type { Notice } from './notice.validation.js';

export const TONE = {
  BUY: 'buy',
  SELL: 'sell',
  CANCEL: 'cancel',
  PENDING: 'pending',
  WARN: 'warn',
  INFO: 'info',
} as const;
export type Tone = (typeof TONE)[keyof typeof TONE];

export type NoticeTone = { readonly tone: Tone; readonly word: string; readonly icon: IconName };

const ORDER_END: Readonly<Record<string, NoticeTone>> = {
  [NOTICE_STATE.CANCELLED]: { tone: TONE.CANCEL, word: 'Cancelada', icon: 'cancelled' },
  [NOTICE_STATE.EXPIRED]: { tone: TONE.CANCEL, word: 'Expirada', icon: 'cancelled' },
  [NOTICE_STATE.REJECTED]: { tone: TONE.CANCEL, word: 'Recusada', icon: 'cancelled' },
};

const RUN_TONE: Readonly<Record<string, NoticeTone>> = {
  'run.stalled': { tone: TONE.WARN, word: 'Parada', icon: 'pause' },
  'run.resumed': { tone: TONE.BUY, word: 'Voltou', icon: 'check' },
  'run.waiting': { tone: TONE.WARN, word: 'Aguardando', icon: 'pause' },
};

function entryTone(notice: Notice): NoticeTone {
  if (notice.state === NOTICE_STATE.CREATED) {
    return { tone: TONE.PENDING, word: 'Pedida', icon: 'horizons' };
  }
  if (notice.state === NOTICE_STATE.FILLED) {
    return { tone: TONE.BUY, word: 'Compra', icon: 'arrowUp' };
  }
  return ORDER_END[notice.state] ?? { tone: TONE.CANCEL, word: 'Cancelada', icon: 'cancelled' };
}

// Estado é sempre ícone + palavra + cor (nunca só cor); cancelada é neutra, nunca vermelha (não é erro nem perda).
export function describeTone(notice: Notice): NoticeTone {
  switch (notice.kind) {
    case NOTICE_KIND.ENTRY:
      return entryTone(notice);
    case NOTICE_KIND.EXIT:
      return { tone: TONE.SELL, word: 'Venda', icon: 'arrowDown' };
    case NOTICE_KIND.PRICE_ALERT:
      return { tone: TONE.INFO, word: 'Alerta de preço', icon: 'alerts' };
    case NOTICE_KIND.GOAL:
      return { tone: TONE.INFO, word: 'Meta', icon: 'flag' };
    default:
      return RUN_TONE[notice.reasonCode] ?? { tone: TONE.INFO, word: 'Aviso', icon: 'info' };
  }
}

export function buildChartLink(notice: Notice): string | undefined {
  if (notice.runId === null) return undefined;
  const operation =
    notice.operationKey === null ? '' : `?operacao=${encodeURIComponent(notice.operationKey)}`;
  return `/backtests/${notice.runId}${operation}#grafico`;
}

// Para onde o clique no aviso leva: a simulação (com a operação) ou, no alerta de preço, a página de alertas.
export function buildNoticeTarget(notice: Notice): string | undefined {
  const chart = buildChartLink(notice);
  if (chart !== undefined) return chart;
  return notice.kind === NOTICE_KIND.PRICE_ALERT ? ROUTE_PATH.ALERTS : undefined;
}
