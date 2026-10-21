// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { ModelTeamsRunProvider } from '../../src/runs/model-teams/ModelTeamsRun.context.js';
import { ModelTeamChips } from '../../src/runs/team-room/balcony/ModelTeamChips.component.js';

// As equipes ◆ como personagens com a ficha (`ModelTeamChips`, o mesmo do backtest), soltas para os contratos da spec 015.
// Na simulação ao vivo a ficha abre do cartão da equipe na sala (`ModelTeamFicha`); aqui se prova o conteúdo dela.
export function RoomModelTeams({ runId }: { readonly runId: string }): ReactElement {
  return (
    <ModelTeamsRunProvider runId={runId}>
      <section aria-label="Equipes de modelo na sala">
        <ModelTeamChips />
      </section>
    </ModelTeamsRunProvider>
  );
}
