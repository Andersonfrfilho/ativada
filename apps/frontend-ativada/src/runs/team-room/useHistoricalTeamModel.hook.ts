// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { useClock } from '../../live/useClock.hook.js';
import { useProjectionsQuery } from '../candle-chart/candle-chart.query.js';
import { timeframeMilliseconds } from '../live-chart.js';
import { formatClosingMoment } from '../live-tracking/decision-text.js';
import { pickDecisionForCandle } from './compact-team-pick.js';
import { windowAnchorFor } from './historical-team-window.js';
import { useHistoricalDecisions } from './historical-team.query.js';
import { REST_STEP } from './team-room-sequence.js';
import { buildAuditorView, buildTeamRoomView } from './team-room-view.js';
import type { AuditorView, TeamRoomView } from './team-room.types.js';

const CLOCK_MILLISECONDS = 60_000;

export type HistoricalTeamInput = {
  readonly runId: string;
  readonly timeframe: string;
  readonly pointedOpenTime: number | undefined;
};

export type HistoricalTeamState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly retry: () => void }
  // Nenhuma decisão gravada para a execução inteira (só vale sem vela apontada).
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'ready';
      // `undefined`: a vela apontada não tem decisão gravada.
      readonly view: TeamRoomView | undefined;
      readonly auditor: AuditorView | undefined;
      readonly isPointed: boolean;
      readonly step: number;
      readonly closedText: string;
    };

// A equipe de uma execução sobre o passado: a decisão gravada da vela apontada (ou da última), sem recalcular nada. Sem
// analista de risco, e o auditor lê o resumo de acertos do servidor.
export function useHistoricalTeamModel(input: HistoricalTeamInput): HistoricalTeamState {
  const { runId, timeframe, pointedOpenTime } = input;
  const timeZone = useUserTimeZone();
  const now = useClock(CLOCK_MILLISECONDS);
  const anchor = windowAnchorFor(pointedOpenTime, timeframeMilliseconds(timeframe));
  const query = useHistoricalDecisions(runId, anchor);
  const summary = useProjectionsQuery({ runId }).data?.summary;
  if (query.isError) return { kind: 'error', retry: () => void query.refetch() };
  const decisions = query.data;
  if (decisions === undefined) return { kind: 'loading' };
  const shown = pickDecisionForCandle(decisions, pointedOpenTime);
  if (shown === undefined && query.isPlaceholderData) return { kind: 'loading' };
  if (shown === undefined && pointedOpenTime === undefined) return { kind: 'empty' };
  const view =
    shown === undefined
      ? undefined
      : buildTeamRoomView({ decision: shown, triggers: undefined, riskAnalyst: undefined });
  return {
    kind: 'ready',
    view,
    auditor: summary === undefined ? undefined : buildAuditorView(summary),
    isPointed: pointedOpenTime !== undefined,
    step: REST_STEP,
    closedText: view === undefined ? '' : formatClosingMoment(view.closedAt, { now, timeZone }),
  };
}
