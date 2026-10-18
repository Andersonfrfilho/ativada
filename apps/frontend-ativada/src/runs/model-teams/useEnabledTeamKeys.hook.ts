// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useMemo } from 'react';

import type { ModelTeamKey } from './model-teams.constant.js';
import { useRunModelTeamsQuery } from './model-teams.query.js';

// As equipes LIGADAS pelo usuário numa simulação ao vivo; `undefined` enquanto não se sabe (carregando, erro, sem rota).
export function useEnabledTeamKeys(
  runId: string,
  isEnabled: boolean,
): readonly ModelTeamKey[] | undefined {
  const teams = useRunModelTeamsQuery(runId, isEnabled).data?.teams;
  return useMemo(
    () => teams?.filter((state) => state.team.isEnabled).map((state) => state.team.teamKey),
    [teams],
  );
}
