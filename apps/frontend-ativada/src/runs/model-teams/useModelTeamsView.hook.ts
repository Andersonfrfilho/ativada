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
import { describeProviderBadge, describeTeamBadge, type TeamBadge } from './team-badge.js';

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
  // Só as equipes LIGADAS pelo usuário: as desligadas não aparecem (ficam em Conta → Equipes de modelo).
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
  return mine === undefined ? undefined : describeProviderBadge(mine, timeZone);
}

// Ligada pelo usuário: o estado da execução manda; sem ele vale a preferência de hoje; sem nenhum dos dois, não aparece.
function isOn({ state, mine }: CardInput): boolean {
  return (state?.team ?? mine)?.isEnabled === true;
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
  mine: ReturnType<typeof useMyModelTeamsQuery>,
): ModelTeamsView['status'] {
  if (runId === undefined) return 'idle';
  if (query.data === null) {
    if (mine.data !== undefined) return 'absent';
    return mine.isError ? 'error' : 'loading';
  }
  if (query.data !== undefined) return 'ready';
  return query.isError ? 'error' : 'loading';
}

export function useModelTeamsView(): ModelTeamsView {
  const runId = useModelTeamsRunId();
  const query = useRunModelTeamsQuery(runId ?? '', runId !== undefined);
  const mineQuery = useMyModelTeamsQuery(query.data === null);
  const timeZone = useUserTimeZone();
  const run = query.data ?? undefined;
  const inputs = MODEL_TEAM_KEYS.map((key): CardInput => ({
    key,
    state: run?.teams.find((item) => item.team.teamKey === key),
    mine: mineQuery.data?.teams.find((item) => item.teamKey === key),
    timeZone,
  }));
  return {
    status: statusOf(runId, query, mineQuery),
    runId,
    run,
    teams: inputs.filter(isOn).map(buildCard),
  };
}
