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
import type { Decision, LiveStatus } from '../live-tracking/live-status.validation.js';
import type { TeamRoomCardProps, TeamRoomMotion } from './TeamRoomCard.component.js';
import type { TeamRoomNavigatorProps } from './TeamRoomNavigator.component.js';
import type { TeamRoomPreference } from './team-room-preference.js';
import { TEAM_ROOM_TEXT } from './team-room.constant.js';
import type { TeamRoomView } from './team-room.types.js';
import { buildAuditorView, buildTeamRoomView } from './team-room-view.js';
import { useRiskAnalystSource, type RiskAnalystSource } from './useRiskAnalystSource.hook.js';
import { useTeamRoomReview, type TeamRoomReview } from './useTeamRoomReview.hook.js';
import { OFFICE_SCENE } from './office/office.constant.js';
import { useOfficeModel, type OfficeModel } from './office/useOfficeModel.hook.js';
import { useOfficeScene, type OfficeSceneState } from './office/useOfficeScene.hook.js';
import { useOfficeVisibility, type OfficeVisibility } from './office/useOfficeVisibility.hook.js';

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
  readonly scene: OfficeSceneState;
  readonly view: TeamRoomView;
  readonly isReviewing: boolean;
  readonly boxRef: TeamRoomMotion['boxRef'];
};

// O anúncio ao leitor de tela sai uma vez por vela nova, depois da coreografia (e nunca ao rever uma vela antiga).
function motionOf({ scene, view, isReviewing, boxRef }: MotionInput): TeamRoomMotion {
  return { scene, boxRef, isAnnounced: scene.announcedKey === view.candleTime && !isReviewing };
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

type OfficePartsInput = {
  readonly runId: string;
  readonly status: LiveStatus;
  readonly latest: Decision | undefined;
  readonly isEnabled: boolean;
};

// O escritório: o modelo da parede e dos monitores, a coreografia da vela nova e a pausa fora da tela.
function useOfficeParts(input: OfficePartsInput): {
  readonly office: OfficeModel | undefined;
  readonly scene: OfficeSceneState;
  readonly visibility: OfficeVisibility;
} {
  const { runId, status, latest, isEnabled } = input;
  const now = useClock(CLOCK_MILLISECONDS);
  const office = useOfficeModel({ runId, status, latest, now });
  const visibility = useOfficeVisibility();
  const scene = useOfficeScene({
    candleKey: latest?.candleTime,
    scene: office?.scene ?? OFFICE_SCENE.NEW_CANDLE,
    isEnabled,
    isAutoPaused: visibility.isAutoPaused,
  });
  return { office, scene, visibility };
}

type ViewInput = {
  readonly review: TeamRoomReview;
  readonly status: LiveStatus;
  readonly riskAnalyst: RiskAnalystSource;
};

// A vela mostrada vira a sala: só a mais recente leva as frases por regra do acompanhamento; a revista usa as gravadas.
function viewOf({ review, status, riskAnalyst }: ViewInput): TeamRoomView | undefined {
  const { shown } = review;
  if (shown === undefined) return undefined;
  return buildTeamRoomView({
    decision: shown,
    triggers: review.isReviewing ? undefined : status.triggers,
    riskAnalyst: riskAnalyst.viewFor(shown.candleTime, !review.isReviewing),
  });
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
  const view = viewOf({ review, status, riskAnalyst });
  const { office, scene, visibility } = useOfficeParts({
    runId,
    status,
    latest: older.decisions[0],
    isEnabled: preference.isAnimationOn,
  });
  if (view === undefined || office === undefined) return undefined;
  const closedText = formatClosingMoment(view.closedAt, { now, timeZone });
  const summary = projections.data?.summary;
  return {
    content: {
      view,
      auditor: summary === undefined ? undefined : buildAuditorView(summary),
      closedText,
      notice: noticeOf(status),
      office,
    },
    motion: motionOf({ scene, view, isReviewing: review.isReviewing, boxRef: visibility.ref }),
    controls: {
      preference,
      onChange: onPreferenceChange,
      onReplay: scene.replay,
      isPaused: scene.isPaused,
      onTogglePause: scene.togglePause,
    },
    navigator: navigatorOf({ review, older, closedText }),
    monitor,
  };
}
