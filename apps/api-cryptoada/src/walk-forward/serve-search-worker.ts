// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parentPort } from 'node:worker_threads';

import {
  buildEvaluationContext,
  evaluateCombination,
  type EvaluationContext,
} from './evaluate-combination.js';
import {
  SEARCH_MESSAGE_TYPE,
  SEARCH_REQUEST_SCHEMA,
  type SearchEvent,
  type SearchRequest,
} from './search-messages.js';

type Post = (event: SearchEvent) => void;

type WorkerState = {
  context: EvaluationContext | undefined;
  strategies: readonly unknown[];
};

function handleInit(
  request: Extract<SearchRequest, { type: 'init' }>,
  state: WorkerState,
): SearchEvent {
  state.context = buildEvaluationContext({
    parameters: request.parameters,
    candles: request.candles,
    sentiments: request.sentiments,
    trainSpans: request.trainSpans,
    strategies: request.strategies,
  });
  state.strategies = request.strategies;
  return { type: SEARCH_MESSAGE_TYPE.READY };
}

function handleEvaluate(
  request: Extract<SearchRequest, { type: 'evaluate' }>,
  state: WorkerState,
): SearchEvent {
  if (state.context === undefined) return { type: SEARCH_MESSAGE_TYPE.FAILED };
  const windows = evaluateCombination(state.context, state.strategies[request.combinationIndex]);
  return {
    type: SEARCH_MESSAGE_TYPE.RESULT,
    taskId: request.taskId,
    combinationIndex: request.combinationIndex,
    windows: [...windows],
  };
}

function handleMessage(data: unknown, state: WorkerState): SearchEvent {
  const request = SEARCH_REQUEST_SCHEMA.safeParse(data);
  if (!request.success) return { type: SEARCH_MESSAGE_TYPE.FAILED };
  try {
    return request.data.type === SEARCH_MESSAGE_TYPE.INIT
      ? handleInit(request.data, state)
      : handleEvaluate(request.data, state);
  } catch {
    // A mensagem do erro nunca sai da thread: só o fato da falha (e o taskId, para a API saber qual).
    return request.data.type === SEARCH_MESSAGE_TYPE.EVALUATE
      ? { type: SEARCH_MESSAGE_TYPE.FAILED, taskId: request.data.taskId }
      : { type: SEARCH_MESSAGE_TYPE.FAILED };
  }
}

// Entrada da thread de busca: recebe o contexto do ajuste uma vez e responde um resumo por combinação. Não abre o
// banco e não conhece o dono: só candles, parâmetros e configurações.
export function serveSearchWorker(): void {
  if (parentPort === null) throw new Error('serveSearchWorker só roda dentro de uma thread.');
  const port = parentPort;
  const state: WorkerState = { context: undefined, strategies: [] };
  const post: Post = (event) => port.postMessage(event);
  port.on('message', (data: unknown) => post(handleMessage(data, state)));
  post({ type: SEARCH_MESSAGE_TYPE.STARTED });
}
