// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { HTTP_METHOD } from '@ativada/environment';

import { API_PATH } from '../../../app/app.constant.js';
import { useApiClient, useAppConfig } from '../../../app/useAppContext.hook.js';
import { RUN_POLL_MILLISECONDS } from '../../run.constant.js';
import { RUN_QUERY_ROOT } from '../../runs.query.js';
import {
  MODEL_TEAMS_QUERY_ROOT,
  type ModelTeamKey,
} from '../../model-teams/model-teams.constant.js';
import { TEAM_QUESTIONS_QUERY_PART } from './team-question.constant.js';
import {
  questionRequestedSchema,
  teamQuestionsSchema,
  type TeamQuestions,
} from './team-question.validation.js';

function questionsKey(runId: string): readonly string[] {
  return [RUN_QUERY_ROOT, runId, MODEL_TEAMS_QUERY_ROOT, TEAM_QUESTIONS_QUERY_PART];
}

function hasPending(data: TeamQuestions | undefined): boolean {
  return data?.items.some((item) => item.status === 'pending') ?? false;
}

// Sob a raiz `runs`: o aviso do stream refaz a lista; enquanto há pergunta pendente, consulta a cada 2 s.
export function useTeamQuestionsQuery(
  runId: string,
  isEnabled: boolean,
): UseQueryResult<TeamQuestions> {
  const client = useApiClient();
  const { runPollMilliseconds = RUN_POLL_MILLISECONDS } = useAppConfig();
  return useQuery({
    queryKey: questionsKey(runId),
    enabled: isEnabled,
    queryFn: () =>
      client.request({
        path: `${API_PATH.RUNS}/${runId}/model-teams/questions`,
        schema: teamQuestionsSchema,
      }),
    refetchInterval: (query) => (hasPending(query.state.data) ? runPollMilliseconds : false),
  });
}

export type AskTeamParams = {
  readonly teamKey: ModelTeamKey;
  readonly symbol: string;
  readonly question: string;
};

// O `202` devolve o id; a lista é refeita na hora e a pendente passa a ser acompanhada.
export function useAskTeamQuestionMutation(
  runId: string,
): UseMutationResult<string, Error, AskTeamParams> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: AskTeamParams) => {
      const result = await client.request({
        method: HTTP_METHOD.POST,
        path: `${API_PATH.RUNS}/${runId}/model-teams/${params.teamKey}/questions`,
        body: { symbol: params.symbol, question: params.question },
        schema: questionRequestedSchema,
      });
      return result.questionId;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: questionsKey(runId) });
    },
  });
}
