// Copyright (c) 2026 Ada Technology. All rights reserved.
import { NOTICE_KIND, NOTICE_STATE, type NoticeState } from './notice.constant.js';
import type { Notice } from './notice.validation.js';
import type { NoticePreferences } from './notice-preferences.js';

export const CHANGE_REASON = { NEW: 'new', STATE_CHANGED: 'state_changed' } as const;
export type ChangeReason = (typeof CHANGE_REASON)[keyof typeof CHANGE_REASON];

export type NoticeChange = { readonly notice: Notice; readonly reason: ChangeReason };

// Mesmo `noticeId` = o mesmo aviso: vale a cópia de estado mais avançado e, no empate, a mais recente.
const STATE_RANK: Readonly<Record<NoticeState, number>> = {
  [NOTICE_STATE.CREATED]: 0,
  [NOTICE_STATE.DONE]: 0,
  [NOTICE_STATE.FILLED]: 1,
  [NOTICE_STATE.CANCELLED]: 1,
  [NOTICE_STATE.EXPIRED]: 1,
  [NOTICE_STATE.REJECTED]: 1,
};

function byNewest(left: Notice, right: Notice): number {
  const difference = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
  return difference === 0 ? right.noticeId.localeCompare(left.noticeId) : difference;
}

function preferred(current: Notice | undefined, candidate: Notice): Notice {
  if (current === undefined) return candidate;
  const currentRank = STATE_RANK[current.state];
  const candidateRank = STATE_RANK[candidate.state];
  return candidateRank >= currentRank ? candidate : current;
}

// Junta as páginas e as listas por assunto: um aviso por `noticeId`, o mais novo primeiro.
export function mergeNotices(lists: readonly (readonly Notice[])[]): readonly Notice[] {
  const byId = new Map<string, Notice>();
  for (const notice of lists.flat())
    byId.set(notice.noticeId, preferred(byId.get(notice.noticeId), notice));
  return [...byId.values()].sort(byNewest);
}

export function snapshotStates(notices: readonly Notice[]): ReadonlyMap<string, NoticeState> {
  return new Map(notices.map((notice) => [notice.noticeId, notice.state]));
}

// O que mudou desde o último estado conhecido: aviso novo ou ordem que avançou de estado (nunca volta).
export function diffNotices(
  known: ReadonlyMap<string, NoticeState>,
  incoming: readonly Notice[],
): readonly NoticeChange[] {
  return incoming.flatMap((notice): readonly NoticeChange[] => {
    const previous = known.get(notice.noticeId);
    if (previous === undefined) return [{ notice, reason: CHANGE_REASON.NEW }];
    if (STATE_RANK[notice.state] > STATE_RANK[previous]) {
      return [{ notice, reason: CHANGE_REASON.STATE_CHANGED }];
    }
    return [];
  });
}

// Não lido = aconteceu depois do cursor de leitura (o instante do aviso mais novo que a pessoa já viu).
export function countUnread(notices: readonly Notice[], readThrough: number): number {
  return notices.filter((notice) => Date.parse(notice.occurredAt) > readThrough).length;
}

export function newestInstant(notices: readonly Notice[]): number {
  return notices.reduce((newest, notice) => Math.max(newest, Date.parse(notice.occurredAt)), 0);
}

export type EventContext = {
  readonly preferences: NoticePreferences;
  // A simulação aberta na tela (o gráfico, a linha de pulso e a sala já mostram: só o sino conta).
  readonly openRunId: string | undefined;
  readonly isTabHidden: boolean;
};

export type EventEffects = {
  readonly isToast: boolean;
  readonly isSound: boolean;
  readonly isBrowserNotification: boolean;
  readonly isAnnounced: boolean;
};

const SILENT: EventEffects = {
  isToast: false,
  isSound: false,
  isBrowserNotification: false,
  isAnnounced: false,
};

function isCategoryEnabled(notice: Notice, preferences: NoticePreferences): boolean {
  const isTrade =
    notice.kind === NOTICE_KIND.ENTRY ||
    notice.kind === NOTICE_KIND.EXIT ||
    notice.kind === NOTICE_KIND.PRICE_ALERT;
  return isTrade ? preferences.isTradeEnabled : preferences.isStopEnabled;
}

// Desligar o tipo ou silenciar a simulação tira toast, som e notificação; o aviso continua no sino (RF15).
export function decideEffects(notice: Notice, context: EventContext): EventEffects {
  const { preferences } = context;
  const isMuted = notice.runId !== null && preferences.mutedRunIds.includes(notice.runId);
  if (isMuted || !isCategoryEnabled(notice, preferences)) return SILENT;
  const isOwnScreen = notice.runId !== null && notice.runId === context.openRunId;
  const isPending = notice.state === NOTICE_STATE.CREATED;
  return {
    isToast: !isOwnScreen,
    isSound: preferences.isSoundEnabled && !context.isTabHidden && !isPending,
    isBrowserNotification: preferences.isBrowserEnabled && context.isTabHidden && !isPending,
    isAnnounced: !isOwnScreen,
  };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function describeOperations(changes: readonly NoticeChange[]): string | undefined {
  const buys = changes.filter(
    ({ notice }) => notice.kind === NOTICE_KIND.ENTRY && notice.state === NOTICE_STATE.FILLED,
  ).length;
  const sells = changes.filter(({ notice }) => notice.kind === NOTICE_KIND.EXIT).length;
  if (buys + sells === 0) return undefined;
  const parts = [
    buys > 0 ? plural(buys, 'compra', 'compras') : '',
    sells > 0 ? plural(sells, 'venda', 'vendas') : '',
  ];
  return `${plural(buys + sells, 'operação', 'operações')} (${parts.filter((part) => part !== '').join(', ')})`;
}

function describeCancelled(changes: readonly NoticeChange[]): string | undefined {
  const cancelled = changes.filter(
    ({ notice }) =>
      notice.kind === NOTICE_KIND.ENTRY &&
      notice.state !== NOTICE_STATE.FILLED &&
      notice.state !== NOTICE_STATE.CREATED,
  ).length;
  return cancelled === 0 ? undefined : plural(cancelled, 'ordem cancelada', 'ordens canceladas');
}

function describeOthers(changes: readonly NoticeChange[]): string | undefined {
  const others = changes.filter(
    ({ notice }) => notice.kind !== NOTICE_KIND.ENTRY && notice.kind !== NOTICE_KIND.EXIT,
  ).length;
  return others === 0 ? undefined : plural(others, 'outro aviso', 'outros avisos');
}

function joinParts(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1] ?? ''}`;
}

// RF20: UM resumo do que aconteceu enquanto a pessoa estava fora, sem toast individual e sem som.
export function summarizeChanges(changes: readonly NoticeChange[]): string | undefined {
  const parts = [
    describeOperations(changes),
    describeCancelled(changes),
    describeOthers(changes),
  ].filter((part): part is string => part !== undefined);
  return parts.length === 0 ? undefined : `Enquanto você estava fora: ${joinParts(parts)}.`;
}
