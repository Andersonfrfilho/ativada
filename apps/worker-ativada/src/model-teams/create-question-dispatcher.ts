// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createCandleRepository,
  createSentimentObservationRepository,
  createTeamQuestionQueueRepository,
  createTeamReportRepository,
  type DatabaseHandle,
} from '@ativada/database';

import type { ReportProcessorDependencies } from './report-processor.types.js';
import { createQuestionDispatcher, type QuestionDispatcher } from './question-dispatcher.js';

export type CreateQuestionDispatcherParams = {
  readonly database: DatabaseHandle;
  readonly exchange: string;
  readonly concurrency: number;
  // O mesmo do despachante dos relatórios: equipes com chave, circuitos, ajustes, teto, log, relógio e sinal de parada.
  readonly shared: Pick<
    ReportProcessorDependencies,
    'runtimes' | 'circuits' | 'settings' | 'logger' | 'now' | 'signal'
  >;
};

// A pergunta livre (adendo da spec 015) divide com os relatórios o circuito, o teto e as chaves de cada equipe.
export function createQuestionDispatcherFor(
  params: CreateQuestionDispatcherParams,
): QuestionDispatcher {
  const { database } = params;
  const questions = createTeamQuestionQueueRepository(database);
  const candles = createCandleRepository(database);
  return createQuestionDispatcher({
    claims: questions,
    concurrency: params.concurrency,
    processor: {
      ...params.shared,
      questions,
      latest: candles,
      sources: {
        exchange: params.exchange,
        candles,
        sentiment: createSentimentObservationRepository(database),
        reports: createTeamReportRepository(database),
      },
    },
  });
}
