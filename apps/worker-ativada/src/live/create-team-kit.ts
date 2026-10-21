// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MODEL_TEAM_STRATEGY, readSignalSource } from '@ativada/model-agents';

import { LIVE_ERROR_CODE } from './live.constant.js';
import { LiveRunError } from './live-run.error.js';
import type { LiveRunSession, TeamStepSettings } from './live-run.types.js';
import type { TeamRunKit } from './team-decision.js';
import type { LiveContext } from './load-live-context.js';

export type CreateTeamKitParams = {
  readonly context: LiveContext;
  readonly session: LiveRunSession;
  readonly settings: TeamStepSettings | undefined;
};

// A execução de equipe nasce de `runs.request.signalSource`. Pedido que não se entende nunca vira equipe (roda como regra).
// Equipe sem o ambiente do worker ou com outra versão de estratégia é recusada em voz alta, nunca rodada pela metade.
export function createTeamKit(params: CreateTeamKitParams): TeamRunKit | undefined {
  const { context, session, settings } = params;
  const source = readSignalSource(context.run.request);
  if (source === undefined) return undefined;
  if (context.strategy.configHash !== MODEL_TEAM_STRATEGY.configHash) {
    throw new LiveRunError(
      LIVE_ERROR_CODE.HASH_MISMATCH,
      'A execução de equipe exige a versão fixa model-team-1.',
    );
  }
  if (session.team === undefined || settings === undefined) {
    throw new LiveRunError(
      LIVE_ERROR_CODE.INVALID_RUN_DATA,
      'Este worker não está configurado para execuções de equipe.',
    );
  }
  return {
    team: source.team,
    symbol: context.setup.parameters.symbol,
    candleMilliseconds: context.durationMilliseconds,
    input: session.team,
    settings,
  };
}
