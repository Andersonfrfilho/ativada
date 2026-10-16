// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { useClock } from '../../live/useClock.hook.js';
import { useProjectionsQuery } from '../candle-chart/candle-chart.query.js';
import { formatClosingMoment } from '../live-tracking/decision-text.js';
import { useOlderDecisions } from '../live-tracking/DecisionsTable.component.js';
import type { Decision, LiveStatus } from '../live-tracking/live-status.validation.js';
import { pickDecisionForCandle } from './compact-team-pick.js';
import { REST_STEP } from './team-room-sequence.js';
import { buildAuditorView, buildTeamRoomView } from './team-room-view.js';
import type { AuditorView, TeamRoomView } from './team-room.types.js';
import { useTeamRoomSequence } from './useTeamRoomSequence.hook.js';

const CLOCK_MILLISECONDS = 60_000;

export type CompactTeamModelInput = {
  readonly runId: string;
  readonly status: LiveStatus;
  readonly pointedOpenTime?: number | undefined;
  readonly isAnimationOn?: boolean;
};

export type CompactTeamModel = {
  // `undefined`: a vela apontada não tem falas gravadas.
  readonly view: TeamRoomView | undefined;
  readonly auditor: AuditorView | undefined;
  readonly isPointed: boolean;
  readonly step: number;
  readonly closedText: string;
  readonly isAnnounced: boolean;
};

// Vela revista: só o voto e a leitura gravados na decisão (a frase por regra do servidor existe só na mais recente).
function speechOf(decision: Decision | undefined): TeamRoomView | undefined {
  return decision === undefined ? undefined : buildTeamRoomView({ decision, triggers: undefined });
}

// Tudo o que a equipe compacta mostra, das consultas que o acompanhamento já faz (nenhuma consulta nova): a decisão da
// vela apontada pelo gráfico ou, sem ela, a mais recente, com a sequência de fala só quando chega vela nova.
export function useCompactTeamModel(input: CompactTeamModelInput): CompactTeamModel | undefined {
  const { runId, status, pointedOpenTime, isAnimationOn = true } = input;
  const timeZone = useUserTimeZone();
  const now = useClock(CLOCK_MILLISECONDS);
  const { decisions } = useOlderDecisions(runId, status);
  const summary = useProjectionsQuery({ runId }).data?.summary;
  const latest = decisions[0];
  const latestView =
    latest === undefined
      ? undefined
      : buildTeamRoomView({ decision: latest, triggers: status.triggers });
  const sequence = useTeamRoomSequence({
    candleKey: latest?.candleTime,
    seatCount: latestView?.specialists.length ?? 0,
    isEnabled: isAnimationOn,
  });
  if (latest === undefined) return undefined;
  const shown = pickDecisionForCandle(decisions, pointedOpenTime);
  const view = shown === latest ? latestView : speechOf(shown);
  return {
    view,
    auditor: summary === undefined ? undefined : buildAuditorView(summary),
    isPointed: pointedOpenTime !== undefined,
    step: shown === latest ? sequence.step : REST_STEP,
    closedText: view === undefined ? '' : formatClosingMoment(view.closedAt, { now, timeZone }),
    isAnnounced: sequence.announcedKey === view?.candleTime && shown === latest,
  };
}
