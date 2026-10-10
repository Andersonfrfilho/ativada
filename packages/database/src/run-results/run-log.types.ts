// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RUN_LOG_KIND } from './run-log.constant.js';

// Uma linha do registro cronológico da execução (RF12): sinal, ordem ou preenchimento, todos com o instante do candle e os
// decimais como o motor os emitiu (texto). O que não se aplica ao tipo da linha é `undefined`.
export type RunLogEntry = {
  readonly kind: (typeof RUN_LOG_KIND)[keyof typeof RUN_LOG_KIND];
  readonly eventTime: number;
  readonly action: string | undefined;
  readonly side: string | undefined;
  readonly orderKey: string | undefined;
  readonly orderType: string | undefined;
  readonly purpose: string | undefined;
  readonly status: string | undefined;
  readonly score: string | undefined;
  readonly regime: string | undefined;
  readonly price: string | undefined;
  readonly limitPrice: string | undefined;
  readonly triggerPrice: string | undefined;
  readonly quantity: string | undefined;
  readonly notional: string | undefined;
  readonly fee: string | undefined;
  readonly riskAmount: string | undefined;
  readonly stopDistance: string | undefined;
  readonly targetDistance: string | undefined;
  readonly lastEventTime: number | undefined;
  readonly reason: string | undefined;
};

// A ordem total do registro: instante do candle, depois a posição do tipo dentro dele, depois a chave natural.
export type RunLogCursor = {
  readonly eventTime: number;
  readonly rank: number;
  readonly key: string;
};
