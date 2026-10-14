// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  DecisionRow,
  DecisionRowPage,
  ListPositionsAroundParams,
  PositionInput,
} from '@ativada/database';

import { encodeTimeCursor } from '../run-cursor.js';
import { toDecisionViews } from './decision-view.js';
import type { LiveRunContext } from './live-status-context.js';
import type { DecisionsPageView } from './live-status-view.js';

// Uma posição por vela no máximo, mais a aberta: o bastante para cobrir a faixa lida.
const POSITIONS_BEYOND_THE_PAGE = 2;

// A faixa de velas da página (da mais antiga à mais recente) para ler só as posições que a cruzam, mais as abertas.
export function toPositionsParams(rows: readonly DecisionRow[]): ListPositionsAroundParams {
  const newest = rows[0];
  const oldest = rows.at(-1);
  return {
    span:
      newest === undefined || oldest === undefined
        ? undefined
        : { from: oldest.candleTime, to: newest.candleTime },
    limit: rows.length + POSITIONS_BEYOND_THE_PAGE,
  };
}

export function toDecisionsPageView(params: {
  readonly context: LiveRunContext;
  readonly page: DecisionRowPage;
  readonly positions: readonly PositionInput[];
}): DecisionsPageView {
  const { context, page } = params;
  return {
    items: toDecisionViews({
      config: context.config,
      durationMilliseconds: context.durationMilliseconds,
      positions: params.positions,
      rows: page.items,
    }),
    nextCursor: page.nextBefore === undefined ? null : encodeTimeCursor(page.nextBefore),
  };
}
