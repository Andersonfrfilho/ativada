// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  MODEL_TEAM_QUESTION_STATUS,
  type ClaimedTeamQuestion,
  type TeamQuestionQueueRepository,
} from '@ativada/database';
import {
  computeCallCost,
  MODEL_CALL_STATUS,
  sanitizeTeamAnswer,
  type FreeTextCallResult,
  type ModelTokenUsage,
} from '@ativada/model-agents';

import type { WorkerLogger } from '../logging/worker-logger.js';
import type { TeamRuntime } from './build-team-runtimes.js';
import { MODEL_TEAM_FAILURE, MODEL_TEAM_LOG } from './model-teams.constant.js';
import { failureCodeOf } from './report-outcome.js';

const ZERO_COST = '0';

export type QuestionBase = {
  readonly questions: Pick<TeamQuestionQueueRepository, 'reserveBudget' | 'finish'>;
  readonly logger: WorkerLogger;
  readonly question: ClaimedTeamQuestion;
};

type OkText = Extract<FreeTextCallResult, { status: typeof MODEL_CALL_STATUS.OK }>;

// Recusa antes da chamada (sem chave, dado pessoal, sem vela, teto, circuito): custo zero, só o código. Nunca o texto.
export async function failQuestion(base: QuestionBase, code: string): Promise<void> {
  await base.questions.finish({
    questionId: base.question.id,
    status: MODEL_TEAM_QUESTION_STATUS.FAILED,
    costUsd: ZERO_COST,
    measure: {},
    failureCode: code,
  });
  base.logger.warn(MODEL_TEAM_LOG.QUESTION_FAILED, {
    questionId: base.question.id,
    team: base.question.teamKey,
    code,
  });
}

// A chamada que falhou custa o que o provedor devolveu em tokens; sem tokens, zero.
async function failCalledQuestion(
  base: QuestionBase & { readonly runtime: TeamRuntime },
  params: { readonly code: string; readonly result: FreeTextCallResult },
): Promise<void> {
  const measure = 'measure' in params.result ? params.result.measure : undefined;
  const usage: ModelTokenUsage = {
    inputTokens: measure?.inputTokens ?? 0,
    outputTokens: measure?.outputTokens ?? 0,
    thinkingTokens: measure?.thinkingTokens ?? 0,
  };
  await base.questions.finish({
    questionId: base.question.id,
    status: MODEL_TEAM_QUESTION_STATUS.FAILED,
    costUsd:
      measure?.inputTokens === undefined
        ? ZERO_COST
        : computeCallCost({ usage, price: base.runtime.price }),
    measure: { ...measure },
    modelId: base.runtime.modelId,
    failureCode: params.code,
  });
  base.logger.warn(MODEL_TEAM_LOG.QUESTION_FAILED, {
    questionId: base.question.id,
    team: base.question.teamKey,
    code: params.code,
  });
}

async function recordAnswer(
  base: QuestionBase & { readonly runtime: TeamRuntime },
  result: OkText,
): Promise<void> {
  const sanitized = sanitizeTeamAnswer(result.text);
  const measure = { ...result.usage, latencyMilliseconds: result.latencyMilliseconds };
  if (sanitized === undefined) {
    const invalid: FreeTextCallResult = { status: MODEL_CALL_STATUS.INVALID_OUTPUT, measure };
    return failCalledQuestion(base, { code: MODEL_TEAM_FAILURE.INVALID_OUTPUT, result: invalid });
  }
  const status = sanitized.isHidden
    ? MODEL_TEAM_QUESTION_STATUS.HIDDEN
    : MODEL_TEAM_QUESTION_STATUS.ANSWERED;
  await base.questions.finish({
    questionId: base.question.id,
    status,
    costUsd: computeCallCost({ usage: result.usage, price: base.runtime.price }),
    measure,
    modelId: base.runtime.modelId,
    answer: sanitized.answer,
  });
  base.logger.info(MODEL_TEAM_LOG.QUESTION_ANSWERED, {
    questionId: base.question.id,
    team: base.question.teamKey,
    status,
  });
}

// O desfecho da chamada: resposta (limpa, cortada em 600 caracteres, ou oculta) ou falha com o código.
export async function recordFreeText(
  base: QuestionBase & { readonly runtime: TeamRuntime },
  result: FreeTextCallResult,
): Promise<void> {
  if (result.status === MODEL_CALL_STATUS.OK) return recordAnswer(base, result);
  return failCalledQuestion(base, { code: failureCodeOf(result.status), result });
}
