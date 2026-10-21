// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '../ownership/owner-scope.js';
import type { ModelTeamQuestionStatus } from './model-team.constant.js';
import type { ReserveBudgetResult, SpendUsage, TeamReportMeasure } from './team-report.types.js';

export type CreateTeamQuestionParams = {
  readonly runId: string;
  readonly teamKey: string;
  readonly provider: string;
  readonly symbol: string;
  readonly question: string;
  // Teto de perguntas livres do usuário no dia (UTC), somando as equipes e as simulações.
  readonly dailyLimit: number;
};

export type TeamQuestionRow = {
  readonly id: string;
  readonly teamKey: string;
  readonly symbol: string;
  readonly question: string;
  readonly status: ModelTeamQuestionStatus;
  readonly answer: string | null;
  readonly failureCode: string | null;
  readonly costUsd: string;
  readonly requestedAt: number;
  readonly decidedAt: number | null;
};

export type ClaimedTeamQuestion = {
  readonly id: string;
  readonly teamKey: string;
  readonly symbol: string;
  readonly question: string;
  readonly attempt: number;
};

export type ClaimTeamQuestionsParams = {
  readonly now: Date;
  readonly limit: number;
  readonly leaseMilliseconds: number;
};

export type ReserveQuestionBudgetParams = {
  readonly questionId: string;
  readonly reservationUsd: string;
  readonly isAllowed: (usage: SpendUsage) => boolean;
};

export type FinishTeamQuestionParams = {
  readonly questionId: string;
  readonly status: Exclude<ModelTeamQuestionStatus, 'pending'>;
  readonly costUsd: string;
  readonly measure: TeamReportMeasure;
  readonly modelId?: string | undefined;
  readonly answer?: string | undefined;
  readonly failureCode?: string | undefined;
};

// Do DONO (lado da API): criar e listar sempre pelo escopo do token.
export type TeamQuestionRepository = {
  // `undefined` = o usuário já usou o teto de hoje (contado sob trava por usuário).
  readonly createQuestion: (
    scope: OwnerScope,
    params: CreateTeamQuestionParams,
  ) => Promise<string | undefined>;
  readonly listQuestions: (
    scope: OwnerScope,
    params: { readonly runId: string; readonly limit: number },
  ) => Promise<readonly TeamQuestionRow[]>;
};

// Operacional (lado do worker e do cron), como a fila dos relatórios: reivindica de todos os donos e só grava o desfecho.
export type TeamQuestionQueueRepository = {
  readonly claimPending: (
    params: ClaimTeamQuestionsParams,
  ) => Promise<readonly ClaimedTeamQuestion[]>;
  readonly reserveBudget: (params: ReserveQuestionBudgetParams) => Promise<ReserveBudgetResult>;
  readonly finish: (params: FinishTeamQuestionParams) => Promise<void>;
  // Apaga pergunta terminada mais velha que o prazo (DT10 das perguntas: 90 dias).
  readonly expireQuestions: (params: { readonly olderThanDays: number }) => Promise<number>;
};
