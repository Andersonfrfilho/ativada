// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { useClock } from '../../live/useClock.hook.js';
import { useProjectionsQuery } from '../candle-chart/candle-chart.query.js';
import { formatClosingMoment } from '../live-tracking/decision-text.js';
import {
  useOlderDecisions,
  type OlderDecisions,
} from '../live-tracking/DecisionsTable.component.js';
import type { LiveStatus } from '../live-tracking/live-status.validation.js';
import type { TeamRoomCardProps, TeamRoomMotion } from './TeamRoomCard.component.js';
import type { TeamRoomNavigatorProps } from './TeamRoomNavigator.component.js';
import type { TeamRoomPreference } from './team-room-preference.js';
import { REST_STEP } from './team-room-sequence.js';
import { TEAM_ROOM_TEXT } from './team-room.constant.js';
import type { TeamRoomView } from './team-room.types.js';
import { buildAuditorView, buildTeamRoomView } from './team-room-view.js';
import { useRiskAnalystSource } from './useRiskAnalystSource.hook.js';
import { useTeamRoomReview, type TeamRoomReview } from './useTeamRoomReview.hook.js';
import { useTeamRoomSequence, type TeamRoomSequence } from './useTeamRoomSequence.hook.js';

const CLOCK_MILLISECONDS = 60_000;

export type TeamRoomModelInput = {
  readonly runId: string;
  readonly status: LiveStatus;
  readonly preference: TeamRoomPreference;
  readonly onPreferenceChange: (change: Partial<TeamRoomPreference>) => void;
  readonly monitor: ReactElement | undefined;
};

export function noticeOf(status: LiveStatus): string | undefined {
  if (status.run.status !== 'running') return TEAM_ROOM_TEXT.STOPPED;
  return status.triggers.status === 'unavailable' ? status.triggers.message : undefined;
}

type MotionInput = {
  readonly sequence: TeamRoomSequence;
  readonly view: TeamRoomView;
  readonly isReviewing: boolean;
};

// O anel de quem votou aparece uma vez, quando todos os especialistas já falaram.
function motionOf({ sequence, view, isReviewing }: MotionInput): TeamRoomMotion {
  const { step } = sequence;
  return {
    step,
    isRinging: step !== REST_STEP && step >= view.specialists.length,
    isAnnounced: sequence.announcedKey === view.candleTime && !isReviewing,
  };
}

type NavigatorInput = {
  readonly review: TeamRoomReview;
  readonly older: OlderDecisions;
  readonly closedText: string;
};

function navigatorOf({ review, older, closedText }: NavigatorInput): TeamRoomNavigatorProps {
  const { previous, next } = review;
  return {
    closedText,
    isReviewing: review.isReviewing,
    canGoPrevious: previous !== undefined || older.hasMore,
    canGoNext: next !== undefined,
    isLoadingOlder: older.isLoading,
    onPrevious: () => (previous === undefined ? older.loadMore() : review.goTo(previous)),
    onNext: () => (next === undefined ? undefined : review.goTo(next)),
    onBackToNow: review.backToNow,
  };
}

// Tudo o que o cartão mostra, montado a partir das consultas que o acompanhamento ao vivo já faz (nenhuma consulta nova).
export function useTeamRoomModel(input: TeamRoomModelInput): TeamRoomCardProps | undefined {
  const { runId, status, preference, onPreferenceChange, monitor } = input;
  const timeZone = useUserTimeZone();
  const now = useClock(CLOCK_MILLISECONDS);
  const older = useOlderDecisions(runId, status);
  const review = useTeamRoomReview(older.decisions);
  const projections = useProjectionsQuery({ runId });
  const riskAnalyst = useRiskAnalystSource(runId);
  const { shown } = review;
  const view =
    shown === undefined
      ? undefined
      : buildTeamRoomView({
          decision: shown,
          triggers: review.isReviewing ? undefined : status.triggers,
          riskAnalyst: riskAnalyst.viewFor(shown.candleTime, !review.isReviewing),
        });
  const sequence = useTeamRoomSequence({
    candleKey: older.decisions[0]?.candleTime,
    seatCount: view?.specialists.length ?? 0,
    isEnabled: preference.isAnimationOn,
  });
  if (view === undefined) return undefined;
  const closedText = formatClosingMoment(view.closedAt, { now, timeZone });
  const summary = projections.data?.summary;
  return {
    content: {
      view,
      auditor: summary === undefined ? undefined : buildAuditorView(summary),
      closedText,
      notice: noticeOf(status),
    },
    motion: motionOf({ sequence, view, isReviewing: review.isReviewing }),
    controls: { preference, onChange: onPreferenceChange, onReplay: sequence.replay },
    navigator: navigatorOf({ review, older, closedText }),
    monitor,
  };
}
