// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { TeamQuestionQueueRepository } from '@ativada/database';
import { readErrorName } from '@ativada/environment';

import { MODEL_TEAM_LEASE_MARGIN_MILLISECONDS, MODEL_TEAM_LOG } from './model-teams.constant.js';
import { processQuestion, type QuestionProcessorDependencies } from './question-processor.js';

export type QuestionDispatcher = { readonly tick: () => Promise<number> };

export type QuestionDispatcherDependencies = {
  readonly processor: QuestionProcessorDependencies;
  readonly claims: Pick<TeamQuestionQueueRepository, 'claimPending'>;
  readonly concurrency: number;
};

// A mesma disciplina do despachante dos relatórios: no máximo `concurrency` chamadas por ronda, cada pergunta isolada
// (`allSettled`); a que errou volta pelo arrendamento vencido e, gastas as tentativas, vira `ATTEMPTS_EXHAUSTED`.
export function createQuestionDispatcher(
  dependencies: QuestionDispatcherDependencies,
): QuestionDispatcher {
  const { processor } = dependencies;
  const leaseMilliseconds =
    processor.settings.timeoutMilliseconds + MODEL_TEAM_LEASE_MARGIN_MILLISECONDS;
  return {
    tick: async (): Promise<number> => {
      const claimed = await dependencies.claims.claimPending({
        now: new Date(processor.now()),
        limit: dependencies.concurrency,
        leaseMilliseconds,
      });
      const outcomes = await Promise.allSettled(
        claimed.map((question) => processQuestion(processor, question)),
      );
      outcomes.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') return;
        processor.logger.error(MODEL_TEAM_LOG.QUESTION_ERRORED, {
          questionId: claimed[index]?.id ?? '',
          errorName: readErrorName(outcome.reason),
        });
      });
      return claimed.length;
    },
  };
}
