// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Engine, EngineState } from '@ativada/strategy-engine';

import { LIVE_ERROR_CODE } from './live.constant.js';
import { LiveRunError } from './live-run.error.js';
import type { LiveRunSession } from './live-run.types.js';
import type { LiveContext } from './load-live-context.js';
import { restoreLiveState } from './restore-live-state.js';

// Onde a simulação está: o estado do motor e a abertura do último candle processado (`null` antes do primeiro passo).
export type LiveCursor = {
  readonly state: EngineState;
  readonly previousOpenTime: number | null;
};

// Retoma do checkpoint; sem ele é a largada: o aquecimento (os candles ANTES do início do período) precisa estar inteiro
// no banco, senão o resultado seria calculado sobre menos dado do que o backtest teria (ADR 0002, "Riscos aceitos").
export async function resolveLiveCursor(params: {
  readonly session: LiveRunSession;
  readonly engine: Engine;
  readonly context: LiveContext;
}): Promise<LiveCursor> {
  const { session, engine, context } = params;
  const restored = restoreLiveState(await session.readCheckpoint(), context);
  if (restored !== undefined) {
    return { state: restored.state, previousOpenTime: restored.previousOpenTime };
  }
  const leadIn = await session.findCandles({
    from: context.loadStart,
    to: context.run.periodStart,
    limit: context.leadInCandles + 1,
  });
  if (leadIn.length < context.leadInCandles) {
    throw new LiveRunError(
      LIVE_ERROR_CODE.INSUFFICIENT_HISTORY,
      `Histórico insuficiente para o aquecimento: ${leadIn.length} de ${context.leadInCandles} candles.`,
    );
  }
  return {
    state: engine.createInitialState({ strategy: context.strategy, run: context.setup }),
    previousOpenTime: null,
  };
}
