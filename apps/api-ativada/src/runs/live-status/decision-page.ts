// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_KIND,
  type DecisionRow,
  type DecisionRowPage,
  type ListPositionsAroundParams,
  type PositionInput,
} from '@ativada/database';

import { encodeTimeCursor } from '../run-cursor.js';
import { toDecisionViews } from './decision-view.js';
import type { LiveRunContext } from './live-status-context.js';
import type { DecisionsPageView } from './live-status-view.js';

// Uma posição por vela no máximo, mais a que vem de antes da faixa, a que abre na vela seguinte e a aberta.
const POSITIONS_BEYOND_THE_PAGE = 3;

// A faixa de velas da página (da mais antiga à mais recente, com a vela seguinte à mais nova, onde a compra preenche) para
// ler só as posições que a cruzam, mais as abertas.
export function toPositionsParams(params: {
  readonly rows: readonly DecisionRow[];
  readonly durationMilliseconds: number;
}): ListPositionsAroundParams {
  const { rows } = params;
  const newest = rows[0];
  const oldest = rows.at(-1);
  return {
    span:
      newest === undefined || oldest === undefined
        ? undefined
        : { from: oldest.candleTime, to: newest.candleTime + params.durationMilliseconds },
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
      // Só o ao vivo tem "a vela seguinte ainda não abriu"; a histórica já terminou.
      lastCandleTime:
        context.run.kind === RUN_KIND.LIVE_PAPER ? context.run.lastCandleTime : undefined,
      positions: params.positions,
      rows: page.items,
    }),
    nextCursor: page.nextBefore === undefined ? null : encodeTimeCursor(page.nextBefore),
  };
}
