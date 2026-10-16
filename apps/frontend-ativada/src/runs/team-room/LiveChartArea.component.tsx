// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, ReactNode } from 'react';

import { ProjectionCards } from '../projection-cards/ProjectionCards.component.js';
import { TradeChartCard } from '../TradeChartCard.component.js';
import { renderCompactTeam } from './RunTeamAside.component.js';
import { TeamAsideProvider } from './TeamAside.context.js';
import { TeamRoomSection } from './TeamRoomSection.component.js';
import { TEAM_LAYOUT } from './team-room-preference.js';
import { useTeamRoomPreference } from './useTeamRoomPreference.hook.js';

export type LiveChartAreaProps = {
  readonly runId: string;
  // Sem gráfico (simulação concluída) a sala aparece sozinha.
  readonly hasChart: boolean;
  // O que vem entre o gráfico e a sala grande: as decisões e o acompanhamento detalhado.
  readonly children?: ReactNode;
};

// A alternância "Gráfico + equipe" (o gráfico no alto, a equipe compacta colada nele, a sala grande por último) e
// "Sala com o gráfico" (o gráfico vira o monitor da sala): o mesmo gráfico, as mesmas frases do servidor.
export function LiveChartArea({ runId, hasChart, children }: LiveChartAreaProps): ReactElement {
  const { preference, update } = useTeamRoomPreference();
  const isRoomLayout = preference.layout === TEAM_LAYOUT.ROOM_WITH_CHART;
  const chart = hasChart ? (
    <TradeChartCard runId={runId} hasSummary={false} hasProjections={false} />
  ) : undefined;
  const aside = isRoomLayout ? undefined : renderCompactTeam(runId, preference);
  const room = (
    <TeamRoomSection
      runId={runId}
      preference={preference}
      onPreferenceChange={update}
      monitor={isRoomLayout ? chart : undefined}
    />
  );
  return (
    <TeamAsideProvider aside={aside}>
      {isRoomLayout ? room : chart}
      {children}
      {hasChart ? <ProjectionCards runId={runId} isLive /> : null}
      {isRoomLayout ? null : room}
    </TeamAsideProvider>
  );
}
