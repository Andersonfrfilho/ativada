// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { HTTP_METHOD } from '@cryptoada/environment';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient } from '../app/useAppContext.hook.js';
import { GOAL_PAGE_SIZE, GOAL_QUERY_ROOT } from './goal.constant.js';
import {
  goalEvaluationSchema,
  goalSchema,
  type Goal,
  type GoalEvaluation,
} from './goal.validation.js';

export function useGoalsQuery(): UseQueryResult<Goal[]> {
  const client = useApiClient();
  return useQuery({
    queryKey: [GOAL_QUERY_ROOT, 'list'],
    queryFn: async () =>
      (
        await client.requestPage({
          path: `${API_PATH.GOALS}?limit=${GOAL_PAGE_SIZE}`,
          schema: goalSchema,
        })
      ).items,
  });
}

export function useGoalQuery(goalId: string): UseQueryResult<Goal> {
  const client = useApiClient();
  return useQuery({
    queryKey: [GOAL_QUERY_ROOT, goalId, 'detail'],
    queryFn: () => client.request({ path: `${API_PATH.GOALS}/${goalId}`, schema: goalSchema }),
  });
}

export function useGoalEvaluationQuery(goalId: string): UseQueryResult<GoalEvaluation> {
  const client = useApiClient();
  return useQuery({
    queryKey: [GOAL_QUERY_ROOT, goalId, 'evaluation'],
    queryFn: () =>
      client.request({
        path: `${API_PATH.GOALS}/${goalId}/evaluation`,
        schema: goalEvaluationSchema,
      }),
  });
}

export function useCreateGoalMutation(): UseMutationResult<Goal, Error, Record<string, unknown>> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.request({ method: HTTP_METHOD.POST, path: API_PATH.GOALS, body, schema: goalSchema }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [GOAL_QUERY_ROOT, 'list'] }),
  });
}

export function useDeleteGoalMutation(): UseMutationResult<void, Error, string> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) =>
      client.requestEmpty({ method: HTTP_METHOD.DELETE, path: `${API_PATH.GOALS}/${goalId}` }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [GOAL_QUERY_ROOT, 'list'] }),
  });
}
