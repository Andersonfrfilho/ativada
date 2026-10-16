// Copyright (c) 2026 Ada Technology. All rights reserved.
import { NOTICE_SOURCE, type NoticeSourceRow } from '@ativada/database';

import { NOTICE_KIND, NOTICE_STATE, type NoticeKind, type NoticeState } from './notice.constant.js';
import { resolveNoticeContent } from './notice-content.js';
import { addDuration, toIsoInstant } from './notice-timing.js';

export type NoticeView = {
  readonly noticeId: string;
  readonly runId: string | null;
  readonly symbol: string;
  readonly timeframe: string | null;
  readonly kind: NoticeKind;
  readonly state: NoticeState;
  readonly occurredAt: string;
  readonly candleTime: number | null;
  readonly confirmsAt: string | null;
  readonly expiresAt: string | null;
  readonly operationKey: string | null;
  readonly price: string | null;
  readonly limitPrice: string | null;
  readonly fee: string | null;
  readonly resultRate: string | null;
  readonly targetPrice: string | null;
  readonly stopPrice: string | null;
  readonly reasonCode: string;
  readonly title: string;
  readonly message: string;
  readonly detail: string | null;
};

const KIND_BY_SOURCE: Readonly<Record<string, NoticeKind>> = {
  [NOTICE_SOURCE.ENTRY_ORDER]: NOTICE_KIND.ENTRY,
  [NOTICE_SOURCE.EXIT_POSITION]: NOTICE_KIND.EXIT,
  [NOTICE_SOURCE.RUN_STALLED]: NOTICE_KIND.RUN,
  [NOTICE_SOURCE.RUN_RESUMED]: NOTICE_KIND.RUN,
  [NOTICE_SOURCE.RUN_WAITING]: NOTICE_KIND.RUN,
  [NOTICE_SOURCE.RUN_GOAL]: NOTICE_KIND.GOAL,
  [NOTICE_SOURCE.PRICE_ALERT]: NOTICE_KIND.PRICE_ALERT,
};

const ORDER_STATES: ReadonlySet<string> = new Set([
  NOTICE_STATE.CREATED,
  NOTICE_STATE.FILLED,
  NOTICE_STATE.CANCELLED,
  NOTICE_STATE.EXPIRED,
  NOTICE_STATE.REJECTED,
]);

function toNoticeState(row: NoticeSourceRow): NoticeState {
  if (row.source !== NOTICE_SOURCE.ENTRY_ORDER) return NOTICE_STATE.DONE;
  const found = Object.values(NOTICE_STATE).find((state) => state === row.state);
  if (found === undefined || !ORDER_STATES.has(found)) {
    throw new Error('Estado de ordem gravado desconhecido.');
  }
  return found;
}

function toKind(row: NoticeSourceRow): NoticeKind {
  const kind = KIND_BY_SOURCE[row.source];
  if (kind === undefined) throw new Error('Origem de aviso desconhecida.');
  return kind;
}

function orNull<TValue>(value: TValue | undefined): TValue | null {
  return value ?? null;
}

// Só a ordem pedida (ainda não executada) tem a hora em que a simulação confirma e, se limitada, a validade.
function toPendingTimes(row: NoticeSourceRow): {
  readonly confirmsAt: string | null;
  readonly expiresAt: string | null;
} {
  const isPending = row.source === NOTICE_SOURCE.ENTRY_ORDER && row.state === NOTICE_STATE.CREATED;
  if (!isPending) return { confirmsAt: null, expiresAt: null };
  return {
    confirmsAt: orNull(addDuration(row.occurredAt, row.timeframe)),
    expiresAt: orNull(addDuration(row.expiresCandleTime, row.timeframe)),
  };
}

// Uma linha crua do banco vira o aviso: a frase vem do catálogo fechado e nenhum horário entra nela.
export function toNoticeView(row: NoticeSourceRow): NoticeView {
  const content = resolveNoticeContent(row);
  return {
    noticeId: row.noticeId,
    runId: orNull(row.runId),
    symbol: row.symbol,
    timeframe: orNull(row.timeframe),
    kind: toKind(row),
    state: toNoticeState(row),
    occurredAt: toIsoInstant(row.occurredAt),
    candleTime: orNull(row.candleTime),
    ...toPendingTimes(row),
    operationKey: orNull(row.operationKey),
    price: orNull(content.price),
    limitPrice: orNull(row.limitPrice),
    fee: orNull(row.fee),
    resultRate: orNull(content.resultRate),
    targetPrice: orNull(row.targetPrice),
    stopPrice: orNull(row.stopPrice),
    reasonCode: content.code,
    title: content.text.title,
    message: content.text.message,
    detail: content.text.detail,
  };
}
