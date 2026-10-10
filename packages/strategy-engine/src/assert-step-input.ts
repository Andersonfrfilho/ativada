// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle } from './engine-candle.types.js';
import { ENGINE_TIMEFRAME_DURATION_MILLISECONDS } from './engine.constant.js';
import type { StepInput } from './engine.types.js';
import type { StrategyConfig } from './strategy-config.types.js';
import {
  ENGINE_STATE_ERROR_CODE,
  EngineInputError,
  EngineStateError,
} from './strategy-engine.error.js';

export type AssertStepInputParams = {
  readonly input: StepInput;
  readonly engineVersion: string;
};

function assertCandleMatchesStrategy(candle: EngineCandle, config: StrategyConfig): void {
  if (candle.symbol !== config.market.symbol || candle.timeframe !== config.market.timeframe) {
    throw new EngineInputError('Candle de outro par ou timeframe que o da estratégia.');
  }
  const duration = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[config.market.timeframe];
  const isOnGrid = candle.openTime % duration === 0;
  if (!isOnGrid || candle.closeTime !== candle.openTime + duration - 1) {
    throw new EngineInputError('Candle fora da grade do timeframe (abertura ou fechamento).');
  }
}

// Recusa em voz alta o que quebraria o contrato; nunca corrige a entrada em silêncio.
export function assertStepInput(params: AssertStepInputParams): void {
  const { input, engineVersion } = params;
  if (input.state.engineVersion !== engineVersion) {
    throw new EngineStateError({
      code: ENGINE_STATE_ERROR_CODE.ENGINE_MISMATCH,
      message: 'Estado gravado por outra versão do motor; replique desde o início.',
    });
  }
  if (input.state.configHash !== input.strategy.configHash) {
    throw new EngineInputError('Estado pertence a outra versão da estratégia.');
  }
  assertCandleMatchesStrategy(input.candle, input.strategy.config);
  const lastOpenTime = input.state.lastCandleOpenTime;
  if (lastOpenTime !== null && input.candle.openTime <= lastOpenTime) {
    throw new EngineInputError('Candle repetido ou fora de ordem: a operação seria duplicada.');
  }
  if (input.sentiment !== undefined && input.sentiment.observedAt > input.candle.closeTime) {
    throw new EngineInputError('Sentimento observado depois do fechamento do candle (lookahead).');
  }
}
