// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { TeamQuestionQueueRepository } from '@ativada/database';

export type ExpireModelTeamQuestionsDependencies = {
  readonly repository: Pick<TeamQuestionQueueRepository, 'expireQuestions'>;
  readonly retentionDays: number;
};

export type ExpireModelTeamQuestionsSummary = {
  readonly deleted: number;
  readonly failures: number;
};

export type ExpireModelTeamQuestionsTask = () => Promise<ExpireModelTeamQuestionsSummary>;

// A pergunta livre às equipes (adendo da spec 015) é texto do usuário: sai depois de 90 dias, mesmo com a conta viva.
export function createExpireModelTeamQuestionsTask(
  dependencies: ExpireModelTeamQuestionsDependencies,
): ExpireModelTeamQuestionsTask {
  return async () => {
    const deleted = await dependencies.repository.expireQuestions({
      olderThanDays: dependencies.retentionDays,
    });
    return { deleted, failures: 0 };
  };
}
