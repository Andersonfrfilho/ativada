// Copyright (c) 2026 Ada Technology. All rights reserved.
import { NOTICE_FEED_SCOPE } from '../../../packages/database/src/notices/notice-feed.types.js';
import type {
  ListNoticeSourcesParams,
  NoticeHistory,
  NoticeFeedRepository,
  NoticeSourceRow,
} from '../../../packages/database/src/notices/notice-feed.types.js';
import type { UserId } from '../../../packages/database/src/ownership/user-id.js';

type Stored = { readonly userId: UserId; row: NoticeSourceRow };

export type InMemoryNotices = {
  readonly repository: NoticeFeedRepository;
  // Grava (ou troca, pelo `noticeId`) um aviso do dono: é assim que a ordem muda de estado.
  readonly put: (userId: UserId, row: NoticeSourceRow) => void;
  readonly lastParams: () => ListNoticeSourcesParams | undefined;
  // O histórico que o último backtest da versão, par e vela devolveria (RF32).
  readonly putHistory: (history: NoticeHistory) => void;
};

const PRICE_ALERT_SOURCE = 'price_alert';

function compareToCursor(
  row: NoticeSourceRow,
  cursor: { occurredAt: number; noticeId: string },
): number {
  if (row.occurredAt !== cursor.occurredAt) return row.occurredAt - cursor.occurredAt;
  return row.noticeId.localeCompare(cursor.noticeId);
}

function byNewest(left: NoticeSourceRow, right: NoticeSourceRow): number {
  if (left.occurredAt !== right.occurredAt) return right.occurredAt - left.occurredAt;
  return right.noticeId.localeCompare(left.noticeId);
}

// Espelha a consulta real: só o dono, o recorte, a janela de tempo, os cursores (tupla) e a ordem decrescente com limite.
export function createInMemoryNotices(): InMemoryNotices {
  const stored: Stored[] = [];
  let last: ListNoticeSourcesParams | undefined;
  const histories: NoticeHistory[] = [];
  const repository: NoticeFeedRepository = {
    listNoticeSources: (scope, params) => {
      last = params;
      const rows = stored
        .filter((entry) => entry.userId === scope.ownerUserId)
        .map((entry) => entry.row)
        .filter((row) => row.occurredAt >= params.since)
        .filter((row) => {
          const isPrice = row.source === PRICE_ALERT_SOURCE;
          if (params.scope === NOTICE_FEED_SCOPE.PRICE_ALERTS) return isPrice;
          return params.scope === NOTICE_FEED_SCOPE.ALL || !isPrice;
        })
        .filter((row) => params.newer === undefined || compareToCursor(row, params.newer) > 0)
        .filter((row) => params.older === undefined || compareToCursor(row, params.older) < 0)
        .sort(byNewest);
      return Promise.resolve(rows.slice(0, params.limit));
    },
    listNoticeHistories: (_scope, keys) =>
      Promise.resolve(
        histories.filter((history) =>
          keys.some(
            (key) =>
              key.strategyVersionId === history.strategyVersionId &&
              key.symbol === history.symbol &&
              key.timeframe === history.timeframe,
          ),
        ),
      ),
  };
  return {
    repository,
    put: (userId, row): void => {
      const found = stored.find(
        (entry) => entry.userId === userId && entry.row.noticeId === row.noticeId,
      );
      if (found === undefined) stored.push({ userId, row });
      else found.row = row;
    },
    lastParams: () => last,
    putHistory: (history): void => void histories.push(history),
  };
}
