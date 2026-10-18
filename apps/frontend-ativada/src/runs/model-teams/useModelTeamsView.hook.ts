// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { MODEL_TEAM_KEYS, MODEL_TEAM_VISUAL, type ModelTeamKey } from './model-teams.constant.js';
import { useMyModelTeamsQuery, useRunModelTeamsQuery } from './model-teams.query.js';
import type {
  Recommendation,
  RunModelTeams,
  TeamState,
  TeamView,
} from './model-teams.validation.js';
import { useModelTeamsRunId } from './ModelTeamsRun.context.js';
import {
  BADGE_OFF,
  describeProviderBadge,
  describeTeamBadge,
  type TeamBadge,
} from './team-badge.js';

export type TeamCardModel = {
  readonly key: ModelTeamKey;
  readonly name: string;
  readonly initial: string;
  readonly provider: string;
  // Sem o estado do servidor (carregando ou execução sem equipes) o cartão só mostra o nome.
  readonly state: TeamState | undefined;
  readonly latest: Recommendation | undefined;
  readonly badge: TeamBadge | undefined;
};

export type ModelTeamsView = {
  // `idle`: sem execução na tela; `absent`: execução que não é ao vivo (as equipes só existem nas simulações ao vivo).
  readonly status: 'idle' | 'loading' | 'absent' | 'error' | 'ready';
  readonly runId: string | undefined;
  readonly run: RunModelTeams | undefined;
  readonly teams: readonly TeamCardModel[];
};

// Pendente primeiro (a equipe está pensando); senão a última recomendação agendada decidida.
export function pickLatest(state: TeamState): Recommendation | undefined {
  const pending = [...state.onDemand, ...state.recent].find((item) => item.status === 'pending');
  return pending ?? state.recent.find((item) => item.status === 'decided');
}

type CardInput = {
  readonly key: ModelTeamKey;
  readonly state: TeamState | undefined;
  // Execução sem equipes (backtest): só o estado de hoje, vindo das preferências, sem opinião do passado.
  readonly mine: TeamView | undefined;
  readonly timeZone: string;
};

function badgeOf(
  { state, mine, timeZone }: CardInput,
  latest: Recommendation | undefined,
): TeamBadge | undefined {
  if (state !== undefined) return describeTeamBadge({ team: state.team, latest, timeZone });
  if (mine === undefined) return undefined;
  return mine.isEnabled ? describeProviderBadge(mine, timeZone) : BADGE_OFF;
}

function buildCard(input: CardInput): TeamCardModel {
  const visual = MODEL_TEAM_VISUAL[input.key];
  const latest = input.state === undefined ? undefined : pickLatest(input.state);
  return {
    key: input.key,
    name: visual.name,
    initial: visual.initial,
    provider: visual.provider,
    state: input.state,
    latest,
    badge: badgeOf(input, latest),
  };
}

function statusOf(
  runId: string | undefined,
  query: ReturnType<typeof useRunModelTeamsQuery>,
): ModelTeamsView['status'] {
  if (runId === undefined) return 'idle';
  if (query.data === null) return 'absent';
  if (query.data !== undefined) return 'ready';
  return query.isError ? 'error' : 'loading';
}

export function useModelTeamsView(): ModelTeamsView {
  const runId = useModelTeamsRunId();
  const query = useRunModelTeamsQuery(runId ?? '', runId !== undefined);
  const mine = useMyModelTeamsQuery(query.data === null).data?.teams;
  const timeZone = useUserTimeZone();
  const run = query.data ?? undefined;
  return {
    status: statusOf(runId, query),
    runId,
    run,
    teams: MODEL_TEAM_KEYS.map((key) =>
      buildCard({
        key,
        state: run?.teams.find((item) => item.team.teamKey === key),
        mine: mine?.find((item) => item.teamKey === key),
        timeZone,
      }),
    ),
  };
}
