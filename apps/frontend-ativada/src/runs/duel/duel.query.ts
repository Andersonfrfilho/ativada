// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { HTTP_METHOD } from '@ativada/environment';

import { useApiClient } from '../../app/useAppContext.hook.js';
import { MODEL_TEAM_PATH } from '../model-teams/model-teams.constant.js';
import { RUN_QUERY_ROOT } from '../runs.query.js';
import {
  createdDuelSchema,
  duelSchema,
  type CreatedDuel,
  type CreateDuelBody,
  type Duel,
} from './duel.validation.js';

// Sob a raiz `runs`: o aviso do stream a cada vela nova refaz o duelo (curvas e ranking) sem polling próprio.
export function useDuelQuery(duelId: string): UseQueryResult<Duel> {
  const client = useApiClient();
  return useQuery({
    queryKey: [RUN_QUERY_ROOT, 'duel', duelId],
    queryFn: () =>
      client.request({ path: `${MODEL_TEAM_PATH.DUELS}/${duelId}`, schema: duelSchema }),
  });
}

export function useCreateDuelMutation(): UseMutationResult<CreatedDuel, Error, CreateDuelBody> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDuelBody) =>
      client.request({
        method: HTTP_METHOD.POST,
        path: MODEL_TEAM_PATH.DUELS,
        body,
        schema: createdDuelSchema,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [RUN_QUERY_ROOT] }),
  });
}
