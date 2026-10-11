// Copyright (c) 2026 Ada Technology. All rights reserved.
import { GOAL_RUN_OUTCOME } from '@cryptoada/database';
import { z } from '@cryptoada/environment';

// Texto decimal exato, como o motor o emite: o formatador do alerta (`new EngineDecimal(texto)`) lança em qualquer outra coisa.
export const DECIMAL_TEXT_PATTERN = /^-?\d+(\.\d+)?$/;

export const SIMULATED_ACTION = { ENTER: 'enter', EXIT: 'exit', NONE: 'none' } as const;
export type SimulatedAction = (typeof SIMULATED_ACTION)[keyof typeof SIMULATED_ACTION];

// O que o passo grava em `alerts.payload` e o despachante lê de volta: só dado do mercado e da regra, nunca pessoa, chat nem
// segredo. Preços em texto decimal exato, como o motor os emite; `null` é o que não se aplica ou não se sabe.
export const alertPayloadSchema = z.strictObject({
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
  closePrice: z.string().min(1),
  score: z.string().min(1),
  regime: z.string().min(1),
  reason: z.string().min(1),
  simulatedAction: z.enum([SIMULATED_ACTION.ENTER, SIMULATED_ACTION.EXIT, SIMULATED_ACTION.NONE]),
  stopPrice: z.string().min(1).nullable(),
  targetPrice: z.string().min(1).nullable(),
  hitRate: z
    .strictObject({
      winRate: z.string().regex(DECIMAL_TEXT_PATTERN),
      trades: z.number().int().nonnegative(),
    })
    .nullable(),
});

export type AlertPayload = z.infer<typeof alertPayloadSchema>;

// O alerta do desfecho de uma meta: só mercado e a meta, em texto decimal exato.
export const goalAlertPayloadSchema = z.strictObject({
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
  outcome: z.enum(GOAL_RUN_OUTCOME),
  targetRate: z.string().min(1),
  maxLossRate: z.string().min(1),
  horizonDays: z.number().int().positive(),
  initialBalance: z.string().min(1),
  finalValue: z.string().min(1),
  resultRate: z.string().min(1),
});

export type GoalAlertPayload = z.infer<typeof goalAlertPayloadSchema>;

// O aviso de um alerta de preço (RF14): só mercado e o valor que o usuário pôs, em texto decimal exato.
export const priceAlertPayloadSchema = z.strictObject({
  symbol: z.string().min(1),
  direction: z.enum(['above', 'below']),
  threshold: z.string().regex(DECIMAL_TEXT_PATTERN),
  price: z.string().regex(DECIMAL_TEXT_PATTERN),
});

export type PriceAlertPayload = z.infer<typeof priceAlertPayloadSchema>;
