// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  OwnerScope,
  TeamQuestionRepository,
  TeamQuestionRow,
  UserModelTeamRepository,
  WorkerHeartbeatRepository,
} from '@ativada/database';
import { isModelTeamKey, MODEL_TEAMS, type ModelTeamKey } from '@ativada/model-agents';

import {
  findLiveRun,
  type LiveStatusRunDependencies,
} from '../runs/live-status/live-status-context.js';
import {
  ModelQuestionLimitReachedError,
  ModelTeamDisabledError,
  ModelTeamUnavailableError,
} from './model-team.error.js';
import { readProviderStates } from './provider-state.js';
import type {
  TeamQuestionBody,
  TeamQuestionsQuery,
  TeamQuestionsView,
} from './team-questions.schema.js';

// A frase fixa da lista: de onde vem a resposta e o que ela não é.
export const TEAM_QUESTIONS_NOTICE =
  'As respostas vêm do modelo da equipe, só sobre dados públicos de mercado. Não é recomendação de compra ou venda.';

export type TeamQuestionDependencies = LiveStatusRunDependencies & {
  readonly teams: Pick<UserModelTeamRepository, 'listTeams'>;
  readonly heartbeat: Pick<WorkerHeartbeatRepository, 'findLatest'>;
  readonly heartbeatSeconds: number;
  readonly questions: TeamQuestionRepository;
  // `MODEL_TEAM_QUESTION_PER_USER_PER_DAY`: teto por usuário e dia (UTC), somando equipes e simulações.
  readonly questionsPerUserPerDay: number;
};

export type QuestionRequested = { readonly questionId: string };

export type AskTeamQuestionUseCase = (
  scope: OwnerScope,
  params: TeamQuestionBody & { readonly runId: string; readonly teamKey: ModelTeamKey },
) => Promise<QuestionRequested>;

export type ListTeamQuestionsUseCase = (
  scope: OwnerScope,
  params: TeamQuestionsQuery & { readonly runId: string },
) => Promise<TeamQuestionsView>;

// A pergunta livre (adendo da spec 015). Recusas na ordem das rotas vizinhas: execução (404), não ao vivo (409), equipe
// desligada (409), provedor fora (409) e, por último, o teto diário (429), que só conta a pergunta que passou do resto.
export function createAskTeamQuestionUseCase(
  dependencies: TeamQuestionDependencies,
): AskTeamQuestionUseCase {
  return async (scope, params) => {
    const run = await findLiveRun(dependencies, { scope, runId: params.runId });
    const [records, heartbeat] = await Promise.all([
      dependencies.teams.listTeams(scope),
      dependencies.heartbeat.findLatest(),
    ]);
    if (!records.some((row) => row.teamKey === params.teamKey && row.isEnabled)) {
      throw new ModelTeamDisabledError();
    }
    const states = readProviderStates({
      heartbeat,
      heartbeatSeconds: dependencies.heartbeatSeconds,
    });
    if (!states[params.teamKey].isAvailable) throw new ModelTeamUnavailableError();
    const questionId = await dependencies.questions.createQuestion(scope, {
      runId: run.id,
      teamKey: params.teamKey,
      provider: MODEL_TEAMS[params.teamKey].provider,
      symbol: params.symbol,
      question: params.question,
      dailyLimit: dependencies.questionsPerUserPerDay,
    });
    if (questionId === undefined) throw new ModelQuestionLimitReachedError();
    return { questionId };
  };
}

// A chave vem do CHECK do banco; a guarda só estreita o tipo.
function toView(row: TeamQuestionRow): readonly TeamQuestionsView['items'][number][] {
  if (!isModelTeamKey(row.teamKey)) return [];
  return [
    {
      id: row.id,
      teamKey: row.teamKey,
      symbol: row.symbol,
      question: row.question,
      status: row.status,
      answer: row.answer,
      failureCode: row.failureCode,
      costUsd: row.costUsd,
      requestedAt: row.requestedAt,
      decidedAt: row.decidedAt,
    },
  ];
}

// As últimas perguntas do DONO naquela simulação ao vivo, da mais nova: o painel acompanha a pendente até ela sair.
export function createListTeamQuestionsUseCase(
  dependencies: Pick<TeamQuestionDependencies, 'runs' | 'strategies' | 'exchange' | 'questions'>,
): ListTeamQuestionsUseCase {
  return async (scope, params) => {
    const run = await findLiveRun(dependencies, { scope, runId: params.runId });
    const rows = await dependencies.questions.listQuestions(scope, {
      runId: run.id,
      limit: params.limit,
    });
    return { notice: TEAM_QUESTIONS_NOTICE, items: rows.flatMap(toView) };
  };
}
