// Copyright (c) 2026 Ada Technology. All rights reserved.
import { SIGNAL_ACTION } from '../run-results/run-result.constant.js';

export const ALERT_CHANNEL = { TELEGRAM: 'telegram' } as const;
export type AlertChannel = (typeof ALERT_CHANNEL)[keyof typeof ALERT_CHANNEL];

// Sinal: só BUY e SELL geram alerta, HOLD nunca. GOAL é o desfecho de uma meta (alvo, perda máxima ou prazo): um por
// execução, na chave (execução, candle, lado, canal) como os demais. PRICE é o disparo de um alerta de preço (RF14): não tem
// execução, leva `price_alert_id` e o instante do tick em `candle_time`, e é único por (alerta, instante). STALL e RESUME são o aviso
// de simulação parada e de volta: `candle_time` é o início do episódio (`runs.stalled_since`), então há um de cada por episódio.
export const ALERT_SIDE = {
  BUY: SIGNAL_ACTION.BUY,
  SELL: SIGNAL_ACTION.SELL,
  GOAL: 'GOAL',
  PRICE: 'PRICE',
  STALL: 'STALL',
  RESUME: 'RESUME',
} as const;
export type AlertSide = (typeof ALERT_SIDE)[keyof typeof ALERT_SIDE];
// O lado do alerta de SINAL: o desfecho da meta (GOAL) e o alerta de preço (PRICE) têm conteúdo e texto próprios.
export type SignalAlertSide = typeof ALERT_SIDE.BUY | typeof ALERT_SIDE.SELL;

export const ALERT_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
  SKIPPED: 'skipped',
} as const;
export type AlertStatus = (typeof ALERT_STATUS)[keyof typeof ALERT_STATUS];

export const ALERT_ERROR_CODE_MAX_LENGTH = 32;
export const ALERT_CLAIM_MAXIMUM_BATCH = 100;

// Gravado em `last_error` do alerta que esgotou as reivindicações sem nunca ser concluído (conteúdo que quebra a entrega).
export const ALERT_ATTEMPTS_EXHAUSTED_ERROR_CODE = 'attempts_exhausted';
