// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  computeRunMetrics,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  type ClosedPositionDecision,
  type EquityPointDecision,
  type OpenPositionMetrics,
  type RunMetrics,
  type RunSetup,
} from '@ativada/strategy-engine';

import type { WalletCollector } from './run-window-wallet.js';

// O que o ajuste de uma janela precisa guardar da carteira: patrimônio e operações fechadas.
export type TrainCollection = {
  readonly equityPoints: EquityPointDecision[];
  readonly closedPositions: ClosedPositionDecision[];
  readonly collect: WalletCollector;
};

export function createTrainCollection(): TrainCollection {
  const equityPoints: EquityPointDecision[] = [];
  const closedPositions: ClosedPositionDecision[] = [];
  return {
    equityPoints,
    closedPositions,
    collect: (decisions): void => {
      if (decisions.equityPoint !== null) equityPoints.push(decisions.equityPoint);
      closedPositions.push(...decisions.closedPositions);
    },
  };
}

export function measureCollection(params: {
  readonly collection: TrainCollection;
  readonly openPosition: OpenPositionMetrics | null;
  readonly setup: RunSetup;
}): RunMetrics {
  return computeRunMetrics({
    equityPoints: params.collection.equityPoints,
    closedPositions: params.collection.closedPositions,
    openPosition: params.openPosition,
    run: {
      initialBalance: params.setup.parameters.initialBalance,
      timeframeMilliseconds:
        ENGINE_TIMEFRAME_DURATION_MILLISECONDS[params.setup.parameters.timeframe],
    },
  });
}
