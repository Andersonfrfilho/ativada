// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCheckpoint } from '@ativada/database';
import {
  deserializeEngineState,
  ENGINE_VERSION,
  EngineStateError,
  type EngineState,
} from '@ativada/strategy-engine';

import { LIVE_ERROR_CODE } from './live.constant.js';
import { LiveRunError } from './live-run.error.js';
import type { LiveContext } from './load-live-context.js';

export type RestoredLiveState = {
  readonly state: EngineState;
  readonly previousOpenTime: number;
};

function unusable(): LiveRunError {
  return new LiveRunError(
    LIVE_ERROR_CODE.ENGINE_STATE_UNUSABLE,
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

// Sem checkpoint a execução ainda não deu o primeiro passo; com ele, o estado precisa ser DESTA estratégia e DESTES
// parâmetros e parar exatamente no candle gravado (senão a retomada pularia ou repetiria um passo).
export function restoreLiveState(
  checkpoint: EngineCheckpoint | undefined,
  context: LiveContext,
): RestoredLiveState | undefined {
  if (checkpoint?.engineState === undefined || checkpoint.lastCandleTime === undefined) {
    return undefined;
  }
  const state = readState(checkpoint);
  const isOwnState =
    state.engineVersion === ENGINE_VERSION &&
    state.configHash === context.strategy.configHash &&
    state.runHash === context.setup.runHash &&
    state.signal.lastCandleOpenTime === checkpoint.lastCandleTime;
  if (!isOwnState) throw unusable();
  return { state, previousOpenTime: checkpoint.lastCandleTime };
}
