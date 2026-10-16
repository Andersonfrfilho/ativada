// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  isSimulationTimeframe,
  SIMULATION_TIMEFRAME_LABEL,
} from '../../goals/simulation-timeframe.constant.js';
import { formatTimeInZone } from '../../format/zoned-time.js';
import type { LiveStatus } from '../live-tracking/live-status.validation.js';
import { TEAM_ROOM_TEXT } from './team-room.constant.js';

export type WaitingTeamInput = {
  readonly run: LiveStatus['run'];
  readonly timeZone: string;
};

// Sem nenhuma decisão ainda: diz por que a equipe está calada e quando a primeira opinião chega.
export function describeWaitingTeam({ run, timeZone }: WaitingTeamInput): string {
  if (run.status !== 'running') return TEAM_ROOM_TEXT.COMPACT_STOPPED;
  if (run.nextDecisionAt === null || !isSimulationTimeframe(run.timeframe)) {
    return `${TEAM_ROOM_TEXT.COMPACT_WAITING} ${TEAM_ROOM_TEXT.COMPACT_FIRST_OPINION}`;
  }
  const label = SIMULATION_TIMEFRAME_LABEL[run.timeframe];
  const closesAt = formatTimeInZone(run.nextDecisionAt, timeZone);
  return `${TEAM_ROOM_TEXT.COMPACT_WAITING} A primeira opinião chega quando a vela de ${label} fechar às ${closesAt}.`;
}
