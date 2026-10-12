// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_STATUS, type RunStatus } from '@ativada/database';
import type { Engine, EngineState } from '@ativada/strategy-engine';

import type { BacktestRunSession } from './backtest-database.types.js';
import {
  openFreshCandleStream,
  openResumedCandleStream,
  type CandlePages,
} from './candle-stream.js';
import type { BacktestContext } from './load-backtest-context.js';
import { restoreCheckpoint } from './restore-checkpoint.js';

export type BeginParams = {
  readonly session: BacktestRunSession;
  readonly context: BacktestContext;
  readonly engine: Engine;
  readonly pageCandles: number;
};

export type BeginResult =
  | { readonly kind: 'refused'; readonly status: RunStatus }
  | {
      readonly kind: 'ready';
      readonly engineState: EngineState;
      readonly pages: CandlePages;
      readonly previousOpenTime: number | null;
      readonly isResumed: boolean;
    };

// `queued → running` (transição inválida é recusa tipada) e a decisão entre largada nova e retomada.
export async function beginRun(params: BeginParams): Promise<BeginResult> {
  const { session, context, engine } = params;
  if (context.run.status === RUN_STATUS.QUEUED) {
    const started = await session.startRun();
    if (!started.isStarted) return { kind: 'refused', status: started.status };
  }
  const checkpoint =
    context.run.status === RUN_STATUS.RUNNING ? await session.readCheckpoint() : undefined;
  const restored = restoreCheckpoint(checkpoint, context);
  const stream = { session, context, pageCandles: params.pageCandles };
  if (restored !== undefined) {
    return {
      kind: 'ready',
      engineState: restored.engineState,
      pages: openResumedCandleStream({ ...stream, afterCandleTime: restored.lastCandleTime }),
      previousOpenTime: restored.lastCandleTime,
      isResumed: true,
    };
  }
  return {
    kind: 'ready',
    engineState: engine.createInitialState({
      strategy: context.strategy,
      run: context.setup,
    }),
    pages: await openFreshCandleStream(stream),
    previousOpenTime: null,
    isResumed: false,
  };
}
