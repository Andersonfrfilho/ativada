// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { WalkForwardWindowInput } from '@ativada/database';

import type { BacktestRunSession } from '../backtest/backtest-database.types.js';

// Tudo o que o walk-forward faz com uma execução, já preso ao dono dela (o escopo nasce em `attach`). Reaproveita o
// ciclo de vida, a leitura de mercado e o lote transacional do backtest; acrescenta a leitura das janelas gravadas.
export type WalkForwardRunSession = Pick<
  BacktestRunSession,
  | 'findRun'
  | 'startRun'
  | 'readStatus'
  | 'readCheckpoint'
  | 'findCandles'
  | 'listSentiment'
  | 'inBatch'
  | 'readEquityPoints'
  | 'completeRun'
  | 'failRun'
> & {
  readonly readWindows: () => Promise<readonly WalkForwardWindowInput[]>;
};

// `undefined` quando a execução não existe ou o dono dela não está ativo.
export type WalkForwardDatabase = {
  readonly attach: (runId: string) => Promise<WalkForwardRunSession | undefined>;
};
