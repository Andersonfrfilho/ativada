// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer, RunResultRows, WalkForwardWindowInput } from '@ativada/database';
import {
  chainWindowResult,
  type ChainCarry,
  type ChainedWindowResult,
  type OpenPositionMetrics,
  type RunMetrics,
  type WalkForwardWindow,
} from '@ativada/strategy-engine';

import { WALK_FORWARD_ERROR_CODE } from './walk-forward.constant.js';
import { WalkForwardRunError } from './walk-forward.error.js';
import { runWindowWallet } from './run-window-wallet.js';
import type { SearchResults } from './walk-forward-checkpoint.js';
import type { SignalCache } from './signal-cache.js';
import type { SignalSeries } from './signal-series.js';
import { selectForWindow, type WindowSelection } from './select-for-window.js';
import { createTestCollection } from './test-collection.js';
import { createTrainCollection, measureCollection } from './train-window-summary.js';
import type { WalkForwardDeps } from './walk-forward-deps.js';
import {
  buildBestParams,
  buildInSampleRecord,
  buildOutOfSampleRecord,
  buildParkedInSampleRecord,
  buildWindowRow,
} from './window-record.js';
import type { WindowSpans } from './window-spans.js';

export type WindowEvaluation = {
  readonly row: WalkForwardWindowInput;
  readonly rows: RunResultRows;
  readonly chained: ChainedWindowResult;
};

export type EvaluateWindowParams = {
  readonly deps: WalkForwardDeps;
  readonly window: WalkForwardWindow;
  readonly results: SearchResults;
  readonly signalsOf: SignalCache;
  readonly carry: ChainCarry;
};

// O ajuste da combinação escolhida, refeito aqui sobre a mesma série, para guardar as métricas COMPLETAS dele. A
// reprodução tem que dar o Sharpe do resumo da busca: divergência quer dizer resumo corrompido ou não determinístico.
function replayTrain(params: {
  readonly deps: WalkForwardDeps;
  readonly choice: WindowSelection;
  readonly signals: SignalSeries;
  readonly spans: WindowSpans;
  readonly windowIndex: number;
}): RunMetrics {
  const { deps, choice } = params;
  const collection = createTrainCollection();
  const wallet = runWindowWallet({
    engine: deps.engine,
    series: deps.series,
    signals: params.signals,
    strategy: choice.combination.strategy,
    setup: deps.setup,
    span: params.spans.train,
    keyPrefix: `w${params.windowIndex}:`,
    isParked: false,
    collect: collection.collect,
  });
  const metrics = measureCollection({
    collection,
    openPosition: wallet.openPosition,
    setup: deps.setup,
  });
  if (
    metrics.sharpe.value !== choice.summary?.sharpe ||
    metrics.trades !== choice.summary?.trades
  ) {
    throw new WalkForwardRunError(
      WALK_FORWARD_ERROR_CODE.ENGINE_FAILED,
      'O ajuste reproduzido diverge do resumo da busca.',
    );
  }
  return metrics;
}

function recordInSample(params: {
  readonly deps: WalkForwardDeps;
  readonly choice: WindowSelection;
  readonly signals: SignalSeries;
  readonly spans: WindowSpans;
  readonly windowIndex: number;
}): JsonContainer {
  const { choice } = params;
  if (choice.summary === undefined)
    return buildParkedInSampleRecord({ candidates: choice.candidates });
  return buildInSampleRecord({
    summary: choice.summary,
    metrics: replayTrain(params),
    candidates: choice.candidates,
    eligibleCombinations: choice.selection.eligibleCount,
  });
}

type TestRun = {
  readonly collection: ReturnType<typeof createTestCollection>;
  readonly openPosition: OpenPositionMetrics | null;
};

function runTestWallet(params: {
  readonly deps: WalkForwardDeps;
  readonly choice: WindowSelection;
  readonly signals: SignalSeries;
  readonly spans: WindowSpans;
  readonly windowIndex: number;
}): TestRun {
  const { deps, spans } = params;
  const collection = createTestCollection(
    deps.series.candles[spans.test.anchorIndex]?.openTime ?? 0,
  );
  const wallet = runWindowWallet({
    engine: deps.engine,
    series: deps.series,
    signals: params.signals,
    strategy: params.choice.combination.strategy,
    setup: deps.setup,
    span: spans.test,
    keyPrefix: `w${params.windowIndex}:`,
    isParked: params.choice.selection.status !== 'ok',
    collect: collection.collect,
  });
  return { collection, openPosition: wallet.openPosition };
}

function chainTest(params: {
  readonly deps: WalkForwardDeps;
  readonly window: WalkForwardWindow;
  readonly test: TestRun;
  readonly carry: ChainCarry;
}): ChainedWindowResult {
  const { deps, test } = params;
  return chainWindowResult({
    result: {
      index: params.window.index,
      equityPoints: test.collection.equityPoints,
      closedPositions: test.collection.closedPositions,
      openPosition: test.openPosition,
    },
    carried: params.carry,
    run: {
      initialBalance: deps.setup.parameters.initialBalance,
      timeframeMilliseconds: deps.context.durationMilliseconds,
    },
  });
}

// O TESTE da janela com os parâmetros escolhidos no ajuste (ou a carteira parada), encadeado ao patrimônio carregado.
export function evaluateWindow(params: EvaluateWindowParams): WindowEvaluation {
  const { deps, window } = params;
  const spans = deps.spans[window.index];
  if (spans === undefined) throw new RangeError('Janela fora do plano.');
  const choice = selectForWindow({
    combinations: deps.context.combinations,
    results: params.results,
    windowIndex: window.index,
    minTradesPerWindow: deps.context.request.minTradesPerWindow,
  });
  const signals = params.signalsOf(choice.combination);
  const isParked = choice.selection.status !== 'ok';
  const base = { deps, choice, signals, spans, windowIndex: window.index };
  const inSample = recordInSample(base);
  const test = runTestWallet(base);
  const { collection } = test;
  const chained = chainTest({ deps, window, test, carry: params.carry });
  const metrics = measureCollection({
    collection,
    openPosition: test.openPosition,
    setup: deps.setup,
  });
  return {
    chained,
    rows: collection.toRows(chained.equityPoints),
    row: buildWindowRow({
      window,
      selection: choice.selection,
      bestParams: isParked ? undefined : buildBestParams(choice.combination),
      inSample,
      outOfSample: buildOutOfSampleRecord({ chained, metrics, isParked }),
    }),
  };
}
