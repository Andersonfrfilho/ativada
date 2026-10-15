// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_KIND,
  RUN_STATUS,
  type OwnerScope,
  type PositionInput,
  type ProjectionItemRow,
  type RunLiveStatusRepository,
  type RunRecord,
} from '@ativada/database';

import { isHoldingAt } from '../live-status/decision-candle-state.js';
import { describeLabel, describeReason, describeUnavailable } from './projection-messages.js';
import { canonicalText } from './projection-items.js';
import {
  computeBand,
  readSide,
  readSideThreshold,
  readStance,
  readStrength,
} from './projection-rule.js';
import {
  PROJECTION_SIDE,
  PROJECTION_UNAVAILABLE_REASON,
  type ProjectionSide,
  type ProjectionStance,
  type ProjectionStrength,
  type ProjectionUnavailableReason,
} from './projections.constant.js';

export type CurrentProjectionView =
  | {
      readonly status: 'available';
      readonly candleTime: number;
      readonly closedAt: number;
      readonly horizonEndsAt: number;
      readonly side: ProjectionSide;
      readonly stance: ProjectionStance;
      readonly strength: ProjectionStrength;
      readonly score: string;
      readonly threshold: string;
      readonly base: string;
      readonly bandLow: string | null;
      readonly bandHigh: string | null;
      readonly atr: string | null;
      readonly label: string;
      readonly message: string;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: ProjectionUnavailableReason;
      readonly message: string;
    };

export type CurrentReader = Pick<RunLiveStatusRepository, 'listPositionsAround'>;

// Só a simulação ao vivo rodando tem "próxima decisão" (ADR 0002, spec 009, P7).
export function isLiveRunning(run: Pick<RunRecord, 'kind' | 'status'>): boolean {
  return run.kind === RUN_KIND.LIVE_PAPER && run.status === RUN_STATUS.RUNNING;
}

export function unavailable(
  reason: ProjectionUnavailableReason,
  isLive: boolean,
): CurrentProjectionView {
  return { status: 'unavailable', reason, message: describeUnavailable({ reason, isLive }) };
}

// Sem nenhuma linha em `signals`: sem vela nenhuma fechada ou ainda juntando velas para as regras.
export function unavailableWithoutRows(
  run: Pick<RunRecord, 'lastCandleTime'>,
): CurrentProjectionView {
  const reason =
    run.lastCandleTime === undefined
      ? PROJECTION_UNAVAILABLE_REASON.NO_CANDLE
      : PROJECTION_UNAVAILABLE_REASON.WARMING_UP;
  return unavailable(reason, true);
}

type AvailableParams = {
  readonly row: ProjectionItemRow;
  readonly side: Exclude<ProjectionSide, 'none'>;
  readonly stance: ProjectionStance;
  readonly durationMilliseconds: number;
};

function toAvailable(params: AvailableParams): CurrentProjectionView {
  const { row, side, stance } = params;
  const threshold = canonicalText(readSideThreshold(side, { buy: row.buy, sell: row.sell }));
  const score = canonicalText(row.score);
  const strength = readStrength({ score: row.score, threshold });
  const band = computeBand({ close: row.close, atr: row.atr });
  return {
    status: 'available',
    candleTime: row.candleTime,
    closedAt: row.candleTime + params.durationMilliseconds,
    horizonEndsAt: row.candleTime + 2 * params.durationMilliseconds,
    side,
    stance,
    strength,
    score,
    threshold,
    base: canonicalText(row.close),
    bandLow: band?.low ?? null,
    bandHigh: band?.high ?? null,
    atr: row.atr === null ? null : canonicalText(row.atr),
    label: describeLabel({ stance, strength }),
    message: describeReason({ side, score, threshold }),
  };
}

// A tendência da última vela decidida: o lado do placar, a força pela fração do limiar do lado e a postura pela carteira
// (comprada = `holding(t)` de L12, lida das posições abertas).
export async function buildCurrent(params: {
  readonly live: CurrentReader;
  readonly scope: OwnerScope;
  readonly run: RunRecord;
  readonly row: ProjectionItemRow;
  readonly durationMilliseconds: number;
}): Promise<CurrentProjectionView> {
  const { row, run } = params;
  const side = readSide(row.score);
  if (side === PROJECTION_SIDE.NONE) {
    return unavailable(PROJECTION_UNAVAILABLE_REASON.NEUTRAL, true);
  }
  const positions: readonly PositionInput[] = await params.live.listPositionsAround(
    params.scope,
    run.id,
    { span: undefined, limit: 2 },
  );
  const stance = readStance({ side, isHolding: isHoldingAt(positions, row.candleTime) });
  if (stance === undefined) return unavailable(PROJECTION_UNAVAILABLE_REASON.NEUTRAL, true);
  return toAvailable({ row, side, stance, durationMilliseconds: params.durationMilliseconds });
}
