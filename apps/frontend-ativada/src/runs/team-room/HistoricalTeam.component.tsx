// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './CompactTeam.module.css';
import { CompactTeamFrame } from './CompactTeamFrame.component.js';
import { CompactTeamMoment } from './CompactTeamMoment.component.js';
import { CompactTeamNotice } from './CompactTeamNotice.component.js';
import { CompactTeamSeats } from './CompactTeamSeats.component.js';
import type { TeamAsideRenderer } from './TeamAside.context.js';
import { TEAM_ROOM_TEXT } from './team-room.constant.js';
import {
  useHistoricalTeamModel,
  type HistoricalTeamInput,
  type HistoricalTeamState,
} from './useHistoricalTeamModel.hook.js';

type ReadyState = Extract<HistoricalTeamState, { kind: 'ready' }>;

function momentText({ view, isPointed, closedText }: ReadyState): string {
  if (view === undefined) return TEAM_ROOM_TEXT.HISTORICAL_POINTED_WITHOUT_SPEECH;
  const lead = isPointed ? TEAM_ROOM_TEXT.POINTED_CANDLE : TEAM_ROOM_TEXT.HISTORICAL_LATEST_CANDLE;
  return `${lead} ${closedText}`;
}

function HistoricalTeamBody(input: HistoricalTeamInput): ReactElement {
  const state = useHistoricalTeamModel(input);
  if (state.kind === 'loading') return <CompactTeamNotice text={TEAM_ROOM_TEXT.COMPACT_LOADING} />;
  if (state.kind === 'empty') return <CompactTeamNotice text={TEAM_ROOM_TEXT.HISTORICAL_EMPTY} />;
  if (state.kind === 'error') {
    return <CompactTeamNotice text={TEAM_ROOM_TEXT.COMPACT_ERROR} isError onRetry={state.retry} />;
  }
  return (
    <>
      <CompactTeamMoment text={momentText(state)} isPointed={state.isPointed} />
      <CompactTeamSeats view={state.view} auditor={state.auditor} step={state.step} isWide />
      <p className={styles.disclaimer}>{TEAM_ROOM_TEXT.HISTORICAL_NOTE}</p>
      <p className={styles.disclaimer}>{TEAM_ROOM_TEXT.DISCLAIMER}</p>
    </>
  );
}

// A equipe de um backtest ou walk-forward: a opinião gravada em cada vela, a apontada pelo gráfico ou a última.
export function renderHistoricalTeam(runId: string, timeframe: string): TeamAsideRenderer {
  return (pointedOpenTime) => (
    <CompactTeamFrame>
      <HistoricalTeamBody runId={runId} timeframe={timeframe} pointedOpenTime={pointedOpenTime} />
    </CompactTeamFrame>
  );
}
