// Copyright (c) 2026 Ada Technology. All rights reserved.
import { refuse } from '../assert-candle.js';
import { assertWalletStepInput } from '../assert-step-input.js';
import { ENGINE_TIMEFRAME_DURATION_MILLISECONDS } from '../engine.constant.js';
import type { WalletStepInput } from '../engine.types.js';
import { ENGINE_INPUT_ERROR_CODE } from '../strategy-engine.error.js';

// A carteira avulsa só aceita o sinal e os parâmetros da execução que a criou: nem o estado nem o sinal
// de outra versão da estratégia, nem o estado de outros parâmetros.
function assertWalletHashes(input: WalletStepInput): void {
  if (input.state.configHash !== input.strategy.configHash) {
    refuse(ENGINE_INPUT_ERROR_CODE.CONFIG_HASH_MISMATCH, 'Carteira de outra versão da estratégia.');
  }
  if (input.state.runHash !== input.run.runHash) {
    refuse(ENGINE_INPUT_ERROR_CODE.RUN_HASH_MISMATCH, 'Carteira de outros parâmetros de execução.');
  }
  if (input.signal !== null && input.signal.configHash !== input.strategy.configHash) {
    refuse(ENGINE_INPUT_ERROR_CODE.CONFIG_HASH_MISMATCH, 'Sinal de outra versão da estratégia.');
  }
}

// O candle é o seguinte ao último da carteira, ou a lacuna entre eles foi confirmada: o sinal ecoa a
// contagem exata de candles ausentes que o `signalStep` aceitou. Sinal nulo (aquecimento) não tem lacuna.
function assertWalletContiguity(input: WalletStepInput): void {
  const { state, candle } = input;
  if (state.lastCandleOpenTime === null) return;
  const duration = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[input.run.parameters.timeframe];
  const missing = (candle.openTime - state.lastCandleOpenTime) / duration - 1;
  const declared = input.signal?.confirmedGapCandles ?? 0;
  if (missing !== declared) {
    refuse(
      ENGINE_INPUT_ERROR_CODE.CANDLE_GAP_UNCONFIRMED,
      `Lacuna de ${missing} candle(s) sem confirmação exata (declarada: ${declared}).`,
    );
  }
}

export function assertStandaloneWalletInput(input: WalletStepInput): void {
  assertWalletStepInput(input);
  assertWalletHashes(input);
  assertWalletContiguity(input);
}
