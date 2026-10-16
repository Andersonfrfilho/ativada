// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  NoticeCursor,
  NoticeFeedRepository,
  NoticeFeedScope,
  NoticeHistory,
  NoticeHistoryKey,
  NoticeSourceRow,
  OwnerScope,
} from '@ativada/database';

import { NOTICE_WINDOW_MILLISECONDS } from './notice.constant.js';
import { encodeNoticeCursor } from './notice-cursor.js';
import { hasManual } from './notice-manual.js';
import { toNoticeView, type NoticeView } from './notice-view.js';

export type ListNoticesInput = {
  readonly limit: number;
  readonly scope: NoticeFeedScope;
  // Antes do cursor (a página de avisos anteriores) ou depois dele (o resumo na volta); no máximo um dos dois.
  readonly older: NoticeCursor | undefined;
  readonly newer: NoticeCursor | undefined;
};

export type NoticePage = {
  readonly items: readonly NoticeView[];
  readonly nextCursor: string | null;
  readonly perPage: number;
};

export type ListNoticesUseCase = (
  scope: OwnerScope,
  input: ListNoticesInput,
) => Promise<NoticePage>;

export type ListNoticesDependencies = {
  readonly notices: NoticeFeedRepository;
  readonly now: () => number;
};

function historyKeyOf(row: NoticeSourceRow): NoticeHistoryKey | undefined {
  if (!hasManual(row)) return undefined;
  if (row.strategyVersionId === undefined || row.timeframe === undefined) return undefined;
  return {
    strategyVersionId: row.strategyVersionId,
    symbol: row.symbol,
    timeframe: row.timeframe,
  };
}

function historyIdentity(key: NoticeHistoryKey): string {
  return `${key.strategyVersionId}|${key.symbol}|${key.timeframe}`;
}

// Uma consulta extra, só dos pares com compra ou venda na página: o último backtest ou walk-forward de cada um.
async function readHistories(
  dependencies: ListNoticesDependencies,
  params: { readonly scope: OwnerScope; readonly rows: readonly NoticeSourceRow[] },
): Promise<ReadonlyMap<string, NoticeHistory>> {
  const keys = new Map<string, NoticeHistoryKey>();
  for (const row of params.rows) {
    const key = historyKeyOf(row);
    if (key !== undefined) keys.set(historyIdentity(key), key);
  }
  const histories = await dependencies.notices.listNoticeHistories(params.scope, [
    ...keys.values(),
  ]);
  return new Map(histories.map((history) => [historyIdentity(history), history]));
}

// Uma consulta lê um aviso a mais só para saber se há página seguinte; o cursor é o último aviso entregue.
export function createListNoticesUseCase(
  dependencies: ListNoticesDependencies,
): ListNoticesUseCase {
  return async (scope, input) => {
    const rows = await dependencies.notices.listNoticeSources(scope, {
      since: dependencies.now() - NOTICE_WINDOW_MILLISECONDS,
      limit: input.limit + 1,
      scope: input.scope,
      older: input.older,
      newer: input.newer,
    });
    const page = rows.slice(0, input.limit);
    const histories = await readHistories(dependencies, { scope, rows: page });
    const last = page.at(-1);
    const hasMore = rows.length > input.limit && input.newer === undefined;
    return {
      items: page.map((row) => {
        const key = historyKeyOf(row);
        return toNoticeView(
          row,
          key === undefined ? undefined : histories.get(historyIdentity(key)),
        );
      }),
      nextCursor:
        hasMore && last !== undefined
          ? encodeNoticeCursor({ occurredAt: last.occurredAt, noticeId: last.noticeId })
          : null,
      perPage: input.limit,
    };
  };
}
