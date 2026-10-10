// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCheckpoint } from '@cryptoada/database';
import {
  deserializeEngineState,
  ENGINE_VERSION,
  EngineStateError,
  type EngineState,
} from '@cryptoada/strategy-engine';

import { BACKTEST_ERROR_CODE } from './backtest.constant.js';
import { BacktestError } from './backtest.error.js';
import type { BacktestContext } from './load-backtest-context.js';

export type RestoredCheckpoint = {
  readonly engineState: EngineState;
  readonly lastCandleTime: number;
};

function unusable(): BacktestError {
  return new BacktestError(
    BACKTEST_ERROR_CODE.ENGINE_STATE_UNUSABLE,
    'O checkpoint não pode ser retomado; replique a execução desde o início.',
  );
}

function readState(checkpoint: EngineCheckpoint): EngineState {
  try {
    return deserializeEngineState(JSON.stringify(checkpoint.engineState));
  } catch (error: unknown) {
    if (error instanceof EngineStateError) throw unusable();
    throw error;
  }
}

// Sem checkpoint (nenhum lote chegou a gravar) a execução recomeça do zero. Com checkpoint, o estado precisa ser
// DESTA estratégia, destes parâmetros e deste motor e coincidir com o último candle gravado.
export function restoreCheckpoint(
  checkpoint: EngineCheckpoint | undefined,
  context: BacktestContext,
): RestoredCheckpoint | undefined {
  if (checkpoint?.engineState === undefined || checkpoint.lastCandleTime === undefined) {
    return undefined;
  }
  const engineState = readState(checkpoint);
  const isOwnState =
    engineState.engineVersion === ENGINE_VERSION &&
    engineState.configHash === context.strategy.configHash &&
    engineState.runHash === context.setup.runHash &&
    engineState.signal.lastCandleOpenTime === checkpoint.lastCandleTime;
  if (!isOwnState) throw unusable();
  return { engineState, lastCandleTime: checkpoint.lastCandleTime };
}
