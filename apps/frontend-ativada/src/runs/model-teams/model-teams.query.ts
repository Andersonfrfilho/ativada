// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { HTTP_METHOD, HTTP_STATUS } from '@ativada/environment';

import { API_PATH } from '../../app/app.constant.js';
import { useApiClient, useAppConfig } from '../../app/useAppContext.hook.js';
import { ApiError } from '../../http/api.error.js';
import type { Page } from '../../http/api-client.js';
import { RUN_POLL_MILLISECONDS } from '../run.constant.js';
import { RUN_QUERY_ROOT } from '../runs.query.js';
import {
  MODEL_TEAM_PATH,
  MODEL_TEAMS_QUERY_ROOT,
  MY_MODEL_TEAMS_KEY,
  type ModelTeamKey,
} from './model-teams.constant.js';
import {
  comparisonItemSchema,
  myModelTeamsSchema,
  opinionRequestedSchema,
  runModelTeamsSchema,
  teamViewSchema,
  type ComparisonItem,
  type MyModelTeams,
  type RunModelTeams,
  type TeamView,
} from './model-teams.validation.js';

const TRACKED_ROOT = 'model-teams-tracked';
// A API aceita no máximo seis pedidos avulsos acompanhados por vez.
const MAX_TRACKED_OPINIONS = 6;
const NO_IDS: readonly string[] = [];

// Sem equipes na execução (não é ao vivo, 404) ou sem a rota: a tela simplesmente não mostra os ◆ vivos.
function isAbsent(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.status === HTTP_STATUS.NOT_FOUND || error.status === HTTP_STATUS.CONFLICT;
}

export function hasPendingReport(state: RunModelTeams | null | undefined): boolean {
  if (state === null || state === undefined) return false;
  return state.teams.some((team) =>
    [...team.recent, ...team.onDemand].some((report) => report.status === 'pending'),
  );
}

// Os pedidos avulsos acompanhados nesta tela: fora da raiz `runs` para o aviso do stream não os esquecer.
export function useTrackedOpinions(runId: string): UseQueryResult<readonly string[]> {
  return useQuery({
    queryKey: [TRACKED_ROOT, runId],
    queryFn: () => NO_IDS,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useRunModelTeamsQuery(
  runId: string,
  isEnabled: boolean,
): UseQueryResult<RunModelTeams | null> {
  const client = useApiClient();
  const { runPollMilliseconds = RUN_POLL_MILLISECONDS } = useAppConfig();
  const tracked = useTrackedOpinions(runId).data ?? NO_IDS;
  return useQuery({
    queryKey: [RUN_QUERY_ROOT, runId, MODEL_TEAMS_QUERY_ROOT, tracked.join(',')],
    enabled: isEnabled,
    queryFn: async (): Promise<RunModelTeams | null> => {
      const query = tracked.length === 0 ? '' : `?opinionIds=${tracked.join(',')}`;
      try {
        return await client.request({
          path: `${API_PATH.RUNS}/${runId}/model-teams${query}`,
          schema: runModelTeamsSchema,
        });
      } catch (error: unknown) {
        if (isAbsent(error)) return null;
        throw error;
      }
    },
    // Enquanto há relatório `pending` à vista consulta a cada 2 s, sem stream novo (RF20).
    refetchInterval: (query) => (hasPendingReport(query.state.data) ? runPollMilliseconds : false),
  });
}

export const COMPARISON_PAGE_SIZE = 24;
const FIRST_PAGE: string | null = null;

// "Equipes × regras": 24 velas por página, da mais nova, por cursor; só consulta com o cartão aberto.
export function useComparisonQuery(
  runId: string,
  isEnabled: boolean,
): UseInfiniteQueryResult<InfiniteData<Page<ComparisonItem>, string | null>> {
  const client = useApiClient();
  return useInfiniteQuery({
    queryKey: [RUN_QUERY_ROOT, runId, MODEL_TEAMS_QUERY_ROOT, 'comparison'],
    enabled: isEnabled,
    initialPageParam: FIRST_PAGE,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: String(COMPARISON_PAGE_SIZE) });
      if (pageParam !== null) query.set('cursor', pageParam);
      return client.requestPage({
        path: `${API_PATH.RUNS}/${runId}/model-teams/comparison?${query.toString()}`,
        schema: comparisonItemSchema,
      });
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useMyModelTeamsQuery(): UseQueryResult<MyModelTeams> {
  const client = useApiClient();
  return useQuery({
    queryKey: MY_MODEL_TEAMS_KEY,
    queryFn: () => client.request({ path: MODEL_TEAM_PATH.MINE, schema: myModelTeamsSchema }),
  });
}

export type SetTeamParams = { readonly teamKey: ModelTeamKey; readonly isEnabled: boolean };

export function useSetModelTeamMutation(): UseMutationResult<TeamView, Error, SetTeamParams> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: SetTeamParams) =>
      client.request({
        method: HTTP_METHOD.PATCH,
        path: `${MODEL_TEAM_PATH.MINE}/${params.teamKey}`,
        body: { enabled: params.isEnabled },
        schema: teamViewSchema,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MY_MODEL_TEAMS_KEY });
      await queryClient.invalidateQueries({ queryKey: [RUN_QUERY_ROOT] });
    },
  });
}

export type OpinionParams = { readonly runId: string; readonly teamKey: ModelTeamKey };

// "Pedir opinião agora": o `202` devolve o id do pedido, que a tela passa a acompanhar até sair de `pending`.
export function useRequestOpinionMutation(): UseMutationResult<string, Error, OpinionParams> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: OpinionParams) => {
      const result = await client.request({
        method: HTTP_METHOD.POST,
        path: `${API_PATH.RUNS}/${params.runId}/model-teams/${params.teamKey}/opinions`,
        schema: opinionRequestedSchema,
      });
      return result.opinionId;
    },
    onSuccess: (opinionId, params) => {
      const key = [TRACKED_ROOT, params.runId];
      const current = queryClient.getQueryData<readonly string[]>(key) ?? NO_IDS;
      queryClient.setQueryData(key, [...current, opinionId].slice(-MAX_TRACKED_OPINIONS));
    },
  });
}
