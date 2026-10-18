// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useMemo } from 'react';

import { useComparisonQuery, useRunModelTeamsQuery } from '../model-teams/model-teams.query.js';
import type { DisplayMapping } from './display-mapping.js';
import { buildTeamLayer, type TeamLayer } from './team-layer.js';

export type TeamLayerParams = {
  readonly runId: string;
  // Camada ligada, simulação ao vivo e vela da execução (ou de exibição que a divide).
  readonly isEnabled: boolean;
  readonly mapping: DisplayMapping | undefined;
  readonly runMilliseconds: number;
  readonly chartEnd: number | undefined;
};

// Os dados da camada "Equipes ◆": a comparação das velas (uma plaquinha por equipe e vela) e as últimas recomendações
// (os preços da faixa). Só consulta com a camada ligada; as duas consultas são independentes e a falha de uma não tira as velas.
export function useTeamLayer(params: TeamLayerParams): TeamLayer | undefined {
  const { runId, isEnabled, mapping, runMilliseconds, chartEnd } = params;
  const comparison = useComparisonQuery(runId, isEnabled);
  const state = useRunModelTeamsQuery(runId, isEnabled);
  const items = useMemo(
    () => comparison.data?.pages.flatMap((page) => page.items),
    [comparison.data],
  );
  const teams = state.data?.teams;
  // Só as equipes LIGADAS desenham plaquinhas, faixas e linhas do balão.
  return useMemo(() => {
    if (!isEnabled || items === undefined) return undefined;
    const on = (teams ?? []).filter((item) => item.team.isEnabled);
    const keys = on.map((item) => item.team.teamKey);
    return buildTeamLayer({
      comparison: items.map((item) => ({
        ...item,
        teams: item.teams.filter((row) => keys.includes(row.teamKey)),
      })),
      teams: on,
      mapping,
      runMilliseconds,
      chartEnd,
    });
  }, [isEnabled, items, teams, mapping, runMilliseconds, chartEnd]);
}
