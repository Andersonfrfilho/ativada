// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MODEL_TEAM_VISUAL, type ModelTeamKey } from './model-teams.constant.js';

export const TEAM_RUN_NOTE =
  'Esta simulação segue a leitura de uma equipe de modelo ◆: não há placar nem gatilhos de regra para mostrar.';

type SourceLike = { readonly team: ModelTeamKey } | null | undefined;

// O rótulo da execução de equipe ("◆ Equipe Nina (Gemini)") no lugar do nome da estratégia, que para ela é a fixa
// `model-team-1` do sistema; `undefined` na execução de regras.
export function teamRunLabel(source: SourceLike): string | undefined {
  if (source === null || source === undefined) return undefined;
  const visual = MODEL_TEAM_VISUAL[source.team];
  return `◆ Equipe ${visual.name} (${visual.provider})`;
}
