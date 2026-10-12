// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RunResultRows } from '@ativada/database';
import {
  appendDecisions,
  createBatchBuffer,
  createPositionTracker,
  toRunResultRows,
} from '@ativada/run-recording';
import type { ClosedPositionDecision, EquityPointDecision } from '@ativada/strategy-engine';

import type { WalletCollector } from './run-window-wallet.js';

export type TestCollection = {
  // Patrimônio BRUTO (unidades da carteira da janela) dos candles do teste: o candle-âncora não entra.
  readonly equityPoints: EquityPointDecision[];
  readonly closedPositions: ClosedPositionDecision[];
  readonly collect: WalletCollector;
  readonly toRows: (chainedEquity: readonly EquityPointDecision[]) => RunResultRows;
};

// Guarda o que o TESTE de uma janela decidiu para virar linhas. O candle-âncora é do candle anterior ao teste
// (pertence à janela anterior): o sinal e o patrimônio dele não são gravados aqui, senão colidiriam no banco.
export function createTestCollection(anchorCandleTime: number): TestCollection {
  const buffer = createBatchBuffer();
  const tracker = createPositionTracker(null);
  const equityPoints: EquityPointDecision[] = [];
  const closedPositions: ClosedPositionDecision[] = [];
  return {
    equityPoints,
    closedPositions,
    collect: (decisions, signal): void => {
      const isAnchor = signal?.candleOpenTime === anchorCandleTime;
      if (decisions.equityPoint !== null && !isAnchor) equityPoints.push(decisions.equityPoint);
      closedPositions.push(...decisions.closedPositions);
      appendDecisions({
        buffer,
        tracker,
        decisions: { ...decisions, signal: isAnchor ? null : signal, equityPoint: null },
      });
    },
    toRows: (chainedEquity) => ({
      ...toRunResultRows(buffer),
      equityPoints: chainedEquity.map((point) => ({
        candleTime: point.candleOpenTime,
        equity: point.equity,
        equityAtLow: point.equityAtLow,
        benchmark: point.benchmark,
      })),
    }),
  };
}
