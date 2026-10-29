// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '@ativada/database';

import {
  findLiveRun,
  readLiveContext,
  type LiveRunContext,
  type LiveStatusRunDependencies,
} from '../live-status/live-status-context.js';
import type { ProjectionsUseCase } from '../projections/projections.use-case.js';
import type { TradePlanUseCase } from '../trade-plan/trade-plan.use-case.js';
import {
  answerReadingQuestion,
  isReadingQuestion,
  type ReadingAnswer,
} from './question-answers.js';
import {
  describeNoData,
  describeOtherSymbolPlan,
  describeOtherSymbolTrackRecord,
  describeTeamRunTrackRecord,
  QUESTIONS_NOTICE,
} from './question-messages.js';
import {
  loadQuestionCandles,
  readSymbolReadings,
  type QuestionCandles,
  type QuestionReadingsDependencies,
} from './question-readings.js';
import {
  ANSWER_BASIS,
  QUESTION,
  QUESTION_AGENT_OF,
  QUESTIONS_VERSION,
  type AnswerBasis,
  type Question,
  type QuestionAgent,
} from './questions.constant.js';

export type QuestionsDependencies = LiveStatusRunDependencies &
  Omit<QuestionReadingsDependencies, 'exchange'> & {
    readonly tradePlan: TradePlanUseCase;
    readonly projections: ProjectionsUseCase;
  };

export type QuestionInput = {
  readonly symbol: string;
  readonly question: Question;
  readonly price?: string | undefined;
};

export type QuestionAnswerView = {
  readonly version: typeof QUESTIONS_VERSION;
  readonly runId: string;
  readonly symbol: string;
  readonly question: Question;
  readonly agent: QuestionAgent;
  readonly answer: string;
  readonly basis: AnswerBasis;
  // A vela fechada que a resposta leu; nula quando o par ainda não tem nenhuma.
  readonly asOf: { readonly candleTime: number; readonly closedAt: number } | null;
  readonly notice: string;
};

export type QuestionsUseCase = (
  scope: OwnerScope,
  runId: string,
  input: QuestionInput,
) => Promise<QuestionAnswerView>;

type AnswerContext = {
  readonly scope: OwnerScope;
  readonly context: LiveRunContext;
  readonly input: QuestionInput;
  readonly series: QuestionCandles;
};

async function answerPlan(
  dependencies: QuestionsDependencies,
  params: AnswerContext,
): Promise<ReadingAnswer> {
  const { run } = params.context;
  if (params.input.symbol !== run.symbol) {
    const answer = describeOtherSymbolPlan({ symbol: params.input.symbol, runSymbol: run.symbol });
    return { answer, basis: ANSWER_BASIS.EXACT };
  }
  const view = await dependencies.tradePlan(params.scope, run.id);
  return { answer: view.plan.message, basis: ANSWER_BASIS.INDICATIVE };
}

// "E se eu comprar a X?": o plano da execução com a entrada no preço pedido (só no par da execução, onde há ATR e saldo).
async function answerBuyAt(
  dependencies: QuestionsDependencies,
  params: AnswerContext,
): Promise<ReadingAnswer> {
  const { run } = params.context;
  if (params.input.symbol !== run.symbol) {
    const answer = describeOtherSymbolPlan({ symbol: params.input.symbol, runSymbol: run.symbol });
    return { answer, basis: ANSWER_BASIS.EXACT };
  }
  const view = await dependencies.tradePlan(params.scope, run.id, { buyAt: params.input.price });
  return { answer: view.plan.message, basis: ANSWER_BASIS.INDICATIVE };
}

async function answerTrackRecord(
  dependencies: QuestionsDependencies,
  params: AnswerContext,
): Promise<ReadingAnswer> {
  const { run } = params.context;
  if (params.input.symbol !== run.symbol) {
    return { answer: describeOtherSymbolTrackRecord(run.symbol), basis: ANSWER_BASIS.EXACT };
  }
  const view = await dependencies.projections(params.scope, run.id, {
    before: undefined,
    limit: 1,
  });
  const summary = view.summary;
  const answer =
    summary === undefined
      ? describeTeamRunTrackRecord()
      : `${summary.message} ${summary.verdictMessage}`;
  return { answer, basis: ANSWER_BASIS.EXACT };
}

async function answerQuestion(
  dependencies: QuestionsDependencies,
  params: AnswerContext,
): Promise<ReadingAnswer> {
  const { question, symbol } = params.input;
  if (question === QUESTION.PLAN) return answerPlan(dependencies, params);
  if (question === QUESTION.BUY_AT) return answerBuyAt(dependencies, params);
  if (!isReadingQuestion(question)) return answerTrackRecord(dependencies, params);
  const { context } = params;
  const readings = await readSymbolReadings(dependencies, {
    symbol,
    timeframe: context.parameters.timeframe,
    versionId: context.run.strategyVersionId,
    config: context.config,
    series: params.series,
  });
  return answerReadingQuestion({ question, symbol, config: context.config, readings });
}

// "Pergunte à equipe" (ADR 0002 "Perguntas à equipe"): a execução do dono dá a estratégia e o timeframe; as leituras saem das
// velas gravadas do par pedido com as funções do próximo gatilho, o plano e os acertos das rotas irmãs. Nenhuma conta nova.
export function createQuestionsUseCase(dependencies: QuestionsDependencies): QuestionsUseCase {
  return async (scope, runId, input) => {
    const run = await findLiveRun(dependencies, { scope, runId });
    const context = await readLiveContext(dependencies, { scope, run });
    const series = await loadQuestionCandles(dependencies, {
      symbol: input.symbol,
      timeframe: context.parameters.timeframe,
    });
    const head: Omit<QuestionAnswerView, 'answer' | 'basis' | 'asOf'> = {
      version: QUESTIONS_VERSION,
      runId: run.id,
      symbol: input.symbol,
      question: input.question,
      agent: QUESTION_AGENT_OF[input.question],
      notice: QUESTIONS_NOTICE,
    };
    const { last } = series;
    if (last === undefined) {
      return {
        ...head,
        answer: describeNoData(input.symbol),
        basis: ANSWER_BASIS.EXACT,
        asOf: null,
      };
    }
    const reply = await answerQuestion(dependencies, { scope, context, input, series });
    return {
      ...head,
      ...reply,
      asOf: { candleTime: last.openTime, closedAt: last.openTime + context.durationMilliseconds },
    };
  };
}
