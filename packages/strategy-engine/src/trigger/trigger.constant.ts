// Copyright (c) 2026 Ada Technology. All rights reserved.

// Versão da definição de "o que falta": mudar qualquer fórmula do ADR 0002 §"Próximo gatilho (T4b.2)" exige uma nova.
export const TRIGGER_VERSION = 'trigger-1';
export const TRIGGER_DECIMAL_PLACES = 8;

// Aguardando entrada: a carteira está livre e interessa o que faria a regra votar COMPRA. Comprado: o que faria votar VENDA.
export const TRIGGER_STATE = { AWAITING_ENTRY: 'awaiting_entry', HOLDING: 'holding' } as const;
export type TriggerState = (typeof TRIGGER_STATE)[keyof typeof TRIGGER_STATE];

// O que se mede: o fechamento (preço), o RSI, a diferença do MACD ou do OBV contra a respectiva média, o índice.
export const TRIGGER_METRIC = {
  CLOSE_PRICE: 'close_price',
  RSI: 'rsi',
  MACD_GAP: 'macd_gap',
  OBV_GAP: 'obv_gap',
  FEAR_GREED_INDEX: 'fear_greed_index',
} as const;
export type TriggerMetric = (typeof TRIGGER_METRIC)[keyof typeof TRIGGER_METRIC];

// Para onde o valor precisa ir, em relação ao limiar, para a regra votar.
export const TRIGGER_DIRECTION = { ABOVE: 'above', BELOW: 'below' } as const;
export type TriggerDirection = (typeof TRIGGER_DIRECTION)[keyof typeof TRIGGER_DIRECTION];

// `exact`: o limiar é o fechamento que dispara a regra no próximo candle (fórmula fechada). `indicative`: é o valor
// do indicador no candle atual contra o limiar; o indicador se move quando o candle seguinte fechar.
export const TRIGGER_BASIS = { EXACT: 'exact', INDICATIVE: 'indicative' } as const;
export type TriggerBasis = (typeof TRIGGER_BASIS)[keyof typeof TRIGGER_BASIS];
