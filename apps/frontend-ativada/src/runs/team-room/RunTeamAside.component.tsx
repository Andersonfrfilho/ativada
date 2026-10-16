// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, ReactNode } from 'react';

import { RUN_KIND } from '../run.constant.js';
import { renderHistoricalTeam } from './BacktestTeam.component.js';
import { CompactTeam } from './CompactTeam.component.js';
import { TeamAsideProvider, type TeamAsideRenderer } from './TeamAside.context.js';
import type { TeamRoomPreference } from './team-room-preference.js';
import { useTeamRoomPreference } from './useTeamRoomPreference.hook.js';

export function renderCompactTeam(
  runId: string,
  preference: TeamRoomPreference,
): TeamAsideRenderer {
  return (pointedOpenTime) => (
    <CompactTeam
      runId={runId}
      pointedOpenTime={pointedOpenTime}
      isAnimationOn={preference.isAnimationOn}
      shouldAnnounce={preference.isCollapsed}
    />
  );
}

export type RunTeamAsideProps = {
  readonly runId: string;
  readonly kind: string;
  readonly children: ReactNode;
};

// A coluna da equipe ao lado do gráfico de uma execução já terminada: a simulação ao vivo mostra a equipe, a histórica diz por que não há.
export function RunTeamAside({ runId, kind, children }: RunTeamAsideProps): ReactElement {
  const { preference } = useTeamRoomPreference();
  const aside =
    kind === RUN_KIND.LIVE_PAPER ? renderCompactTeam(runId, preference) : renderHistoricalTeam;
  return <TeamAsideProvider aside={aside}>{children}</TeamAsideProvider>;
}
