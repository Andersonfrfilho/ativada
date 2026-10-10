// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from 'zod';

import { ENGINE_STATE_VERSION } from './engine.constant.js';
import type { EngineState } from './engine-state.types.js';
import {
  COUNT_SCHEMA,
  HASH_SCHEMA,
  type IssueSink,
  reportIssue,
  TIME_SCHEMA,
  WALLET_STATE_SCHEMA,
} from './wallet-state.schema.js';

const SIGNAL_STATE_SCHEMA = z
  .strictObject({
    leadInCandles: z.number().int().positive(),
    processedCandles: COUNT_SCHEMA,
    lastCandleOpenTime: TIME_SCHEMA.nullable(),
    indicators: z.record(z.string(), z.json()),
  })
  .superRefine((signal, context) => {
    if ((signal.processedCandles === 0) !== (signal.lastCandleOpenTime === null)) {
      reportIssue(
        context,
        ['lastCandleOpenTime'],
        'lastCandleOpenTime é nulo se, e só se, nenhum candle foi processado.',
      );
    }
  });

// As duas metades andam juntas: mesmo último candle, sinal começa ao fim do aquecimento e a régua
// "comprar e segurar" existe se, e só se, o aquecimento terminou antes do último candle.
function checkHalvesAgree(state: EngineState, context: IssueSink): void {
  const { signal, wallet } = state;
  if (wallet.configHash !== state.configHash || wallet.runHash !== state.runHash) {
    reportIssue(
      context,
      ['wallet', 'configHash'],
      'Carteira de outra versão ou de outros parâmetros.',
    );
  }
  if (wallet.lastCandleOpenTime !== signal.lastCandleOpenTime) {
    reportIssue(
      context,
      ['wallet', 'lastCandleOpenTime'],
      'Carteira e sinal em candles diferentes.',
    );
  }
  const isWarm = signal.processedCandles >= signal.leadInCandles;
  if (isWarm !== (wallet.firstSignalCandleOpenTime !== null)) {
    reportIssue(
      context,
      ['wallet', 'firstSignalCandleOpenTime'],
      'Início do sinal fora do aquecimento.',
    );
  }
  const isPastWarmup = signal.processedCandles > signal.leadInCandles;
  if (isPastWarmup !== (wallet.benchmark !== null)) {
    reportIssue(
      context,
      ['wallet', 'benchmark'],
      'Régua existe se, e só se, o aquecimento terminou.',
    );
  }
}

export const ENGINE_STATE_SCHEMA = z
  .strictObject({
    version: z.literal(ENGINE_STATE_VERSION),
    engineVersion: z.string().min(1).max(64),
    configHash: HASH_SCHEMA,
    runHash: HASH_SCHEMA,
    signal: SIGNAL_STATE_SCHEMA,
    wallet: WALLET_STATE_SCHEMA,
  })
  .superRefine((state, context) => checkHalvesAgree(state, context));
