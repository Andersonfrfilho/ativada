// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRepository, ClaimedTeamQuestion } from '@ativada/database';
import {
  BUDGET_DECISION,
  computeReservation,
  decideBudget,
  findPromptPrivacyViolations,
  findQuestionPersonalData,
  MODEL_CALL_STATUS,
  renderPrompt,
  renderQuestionPrompt,
  type BudgetUsage,
} from '@ativada/model-agents';

import type { TeamRuntime } from './build-team-runtimes.js';
import { MODEL_TEAM_FAILURE, QUESTION_MAX_OUTPUT_TOKENS } from './model-teams.constant.js';
import { failQuestion, recordFreeText, type QuestionBase } from './question-outcome.js';
import { loadReportInput, type ReportInputSources } from './report-input.js';
import type { ProcessorSettings } from './report-processor.types.js';
import type { TeamCircuits } from './team-circuits.js';

export type QuestionProcessorDependencies = Omit<QuestionBase, 'question'> & {
  readonly sources: ReportInputSources;
  readonly latest: Pick<CandleRepository, 'findLatestOpenTime'>;
  readonly runtimes: ReadonlyMap<string, TeamRuntime>;
  readonly circuits: TeamCircuits;
  readonly settings: ProcessorSettings;
  readonly now: () => number;
  readonly signal: AbortSignal;
};

type QuestionContext = QuestionProcessorDependencies & {
  readonly question: ClaimedTeamQuestion;
  readonly runtime: TeamRuntime;
};

// Os mesmos dados públicos do relatório agendado, sobre a última vela de 15 min FECHADA e gravada do par.
async function buildPrompt(context: QuestionContext): Promise<string | undefined> {
  const { question, sources } = context;
  const candleTime = await context.latest.findLatestOpenTime({
    exchange: sources.exchange,
    symbol: question.symbol,
    timeframe: '15m',
  });
  if (candleTime === undefined) return undefined;
  const loaded = await loadReportInput(sources, { symbol: question.symbol, candleTime });
  if (loaded === undefined) return undefined;
  if (findPromptPrivacyViolations(renderPrompt(loaded.input)).length > 0) return '';
  return renderQuestionPrompt({ input: loaded.input, question: question.question });
}

// Reserva o custo MÁXIMO sob a trava do teto (o mesmo dos relatórios); `false` = o dia ou o mês não deixa.
async function reserve(context: QuestionContext, prompt: string): Promise<boolean> {
  const { settings, runtime } = context;
  const reservationUsd = computeReservation({
    promptLength: prompt.length,
    maxOutputTokens: QUESTION_MAX_OUTPUT_TOKENS,
    maxThinkingTokens: runtime.maxThinkingTokens,
    price: runtime.price,
  });
  const isAllowed = (usage: BudgetUsage): boolean =>
    decideBudget({ usage, reservationUsd, limits: settings.budget }) === BUDGET_DECISION.ALLOW;
  const result = await context.questions.reserveBudget({
    questionId: context.question.id,
    reservationUsd,
    isAllowed,
  });
  context.circuits.markBudget(runtime.teamKey, !result.isReserved);
  return result.isReserved;
}

async function callProvider(context: QuestionContext, prompt: string): Promise<void> {
  const { runtime } = context;
  const result = await runtime.port.requestFreeText({
    team: runtime.teamKey,
    prompt,
    limits: {
      timeoutMilliseconds: context.settings.timeoutMilliseconds,
      maxOutputTokens: QUESTION_MAX_OUTPUT_TOKENS,
    },
    signal: context.signal,
  });
  const retryAfter =
    result.status === MODEL_CALL_STATUS.RATE_LIMITED
      ? { retryAfterMilliseconds: result.retryAfterMilliseconds }
      : {};
  context.circuits.record(runtime.teamKey, { status: result.status, ...retryAfter }, context.now());
  return recordFreeText(context, result);
}

// O caminho de UMA pergunta reivindicada: chave, dado pessoal, dados públicos, privacidade, teto, circuito, chamada, gravação.
export async function processQuestion(
  dependencies: QuestionProcessorDependencies,
  question: ClaimedTeamQuestion,
): Promise<void> {
  const base = { ...dependencies, question };
  const runtime = dependencies.runtimes.get(question.teamKey);
  if (runtime === undefined) return failQuestion(base, MODEL_TEAM_FAILURE.NO_KEY);
  if (findQuestionPersonalData(question.question).length > 0) {
    return failQuestion(base, MODEL_TEAM_FAILURE.QUESTION_HAS_PERSONAL_DATA);
  }
  const context: QuestionContext = { ...base, runtime };
  const prompt = await buildPrompt(context);
  if (prompt === undefined) return failQuestion(base, MODEL_TEAM_FAILURE.NO_INPUT);
  if (prompt === '') return failQuestion(base, MODEL_TEAM_FAILURE.PROMPT_REJECTED);
  if (!(await reserve(context, prompt))) {
    return failQuestion(base, MODEL_TEAM_FAILURE.BUDGET_EXHAUSTED);
  }
  if (!context.circuits.requestPermission(runtime.teamKey, context.now())) {
    return failQuestion(base, MODEL_TEAM_FAILURE.CIRCUIT_OPEN);
  }
  return callProvider(context, prompt);
}
