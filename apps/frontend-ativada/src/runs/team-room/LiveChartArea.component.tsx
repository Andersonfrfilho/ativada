// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { TradeChartCard } from '../TradeChartCard.component.js';
import { CompactTeam } from './CompactTeam.component.js';
import { TeamAsideProvider } from './TeamAside.context.js';
import { TeamRoomSection } from './TeamRoomSection.component.js';
import { TEAM_LAYOUT } from './team-room-preference.js';
import { useTeamRoomPreference } from './useTeamRoomPreference.hook.js';

export type LiveChartAreaProps = {
  readonly runId: string;
  // Sem gráfico (simulação concluída) a sala aparece sozinha.
  readonly hasChart: boolean;
};

// A alternância "Gráfico + equipe" (equipe compacta ao lado de "Próxima vela de perto") e "Sala com o gráfico" (o gráfico
// vira o monitor da sala): o mesmo gráfico, as mesmas frases do servidor, só muda o lugar de cada peça.
export function LiveChartArea({ runId, hasChart }: LiveChartAreaProps): ReactElement {
  const { preference, update } = useTeamRoomPreference();
  const isRoomLayout = preference.layout === TEAM_LAYOUT.ROOM_WITH_CHART;
  const chart = hasChart ? <TradeChartCard runId={runId} hasSummary={false} /> : undefined;
  const aside = isRoomLayout ? undefined : <CompactTeam runId={runId} />;
  return (
    <TeamAsideProvider aside={aside}>
      <TeamRoomSection
        runId={runId}
        preference={preference}
        onPreferenceChange={update}
        monitor={isRoomLayout ? chart : undefined}
      />
      {isRoomLayout ? null : chart}
    </TeamAsideProvider>
  );
}
