// Copyright (c) 2026 Ada Technology. All rights reserved.
import { CompactTeamFrame } from './CompactTeamFrame.component.js';
import { CompactTeamNotice } from './CompactTeamNotice.component.js';
import type { TeamAsideRenderer } from './TeamAside.context.js';
import { TEAM_ROOM_TEXT } from './team-room.constant.js';

// Backtest e walk-forward rodam sobre o passado e não gravam falas da equipe: a coluna diz isso em vez de sumir.
export const renderHistoricalTeam: TeamAsideRenderer = () => (
  <CompactTeamFrame>
    <CompactTeamNotice text={TEAM_ROOM_TEXT.COMPACT_HISTORICAL} />
  </CompactTeamFrame>
);
