// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, ReactNode } from 'react';

import { RUN_KIND } from '../run.constant.js';
import { renderHistoricalTeam } from './HistoricalTeam.component.js';
import { TeamAsideProvider } from './TeamAside.context.js';

export type RunTeamAsideProps = {
  readonly timeframe: string;
  readonly runId: string;
  readonly kind: string;
  readonly children: ReactNode;
};

// A coluna da equipe ao lado do gráfico de um backtest ou walk-forward: a opinião gravada em cada vela.
export function RunTeamAside({
  runId,
  kind,
  timeframe,
  children,
}: RunTeamAsideProps): ReactElement {
  // A simulação ao vivo mostra a equipe na sala de operações, acima; aqui não há coluna ao lado do gráfico.
  if (kind === RUN_KIND.LIVE_PAPER) return <>{children}</>;
  return (
    <TeamAsideProvider aside={renderHistoricalTeam(runId, timeframe)}>{children}</TeamAsideProvider>
  );
}
