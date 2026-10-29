// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { API_PATH } from '../../app/app.constant.js';
import { useApiClient } from '../../app/useAppContext.hook.js';
import type { RoomQuestion } from './room-questions.constant.js';
import { roomQuestionAnswerSchema, type RoomQuestionAnswer } from './room-question.validation.js';

export type AskInput = {
  readonly symbol: string;
  readonly question: RoomQuestion;
  // Só em `buy_at`: o preço em texto com ponto decimal.
  readonly price?: string | undefined;
};

// Perguntar é uma ação (cada clique quer a resposta de agora), não um estado em cache: por isso uma mutação sobre o GET.
export function useAskQuestionMutation(
  runId: string,
): UseMutationResult<RoomQuestionAnswer, Error, AskInput> {
  const client = useApiClient();
  return useMutation({
    mutationFn: (input: AskInput) => {
      const query = new URLSearchParams({ symbol: input.symbol, question: input.question });
      if (input.price !== undefined) query.set('price', input.price);
      return client.request({
        path: `${API_PATH.RUNS}/${runId}/questions?${query.toString()}`,
        schema: roomQuestionAnswerSchema,
      });
    },
  });
}
