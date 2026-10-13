// Copyright (c) 2026 Ada Technology. All rights reserved.
import { LIVE_RUN_LIMIT_REACHED_TEXT } from './simulation-timeframe.constant.js';

export const GOAL_QUERY_ROOT = 'goals';
export const GOAL_TIMEFRAME = '1d';
export const GOAL_PAGE_SIZE = 100;
export const MILLISECONDS_PER_DAY = 86_400_000;
export const PLAN_HISTORY_DAYS = 60;
export const FULL_PERCENT = 100;

export const DEFAULT_TARGET_PERCENT = '3';
export const DEFAULT_HORIZON_DAYS = '30';
export const DEFAULT_MAX_LOSS_PERCENT = '5';
export const MAXIMUM_HORIZON_DAYS = 365;
// RF13: o prazo da meta é um destes cinco (a API aceita de 1 a 365, mas a tela segue a especificação).
export const HORIZON_OPTIONS = [7, 14, 30, 60, 90].map((days) => ({
  value: String(days),
  label: `${days} dias`,
}));

export const GOAL_FIELD_LABEL: Readonly<Record<string, string>> = {
  symbol: 'Par',
  targetRate: 'Retorno alvo',
  maxLossRate: 'Perda máxima',
  horizonDays: 'Prazo',
};

export const GOAL_REASON_TEXT: Readonly<Record<string, string>> = {
  invalid_value: 'valor inválido',
  not_enabled: 'par não habilitado neste ambiente',
};

export const GOAL_ERROR_TEXT: Readonly<Record<string, string>> = {
  GOAL_LIMIT_REACHED: 'Você atingiu o limite de metas. Apague uma para criar outra.',
  GOAL_IN_USE: 'Há simulações ligadas a esta meta: pare-as antes de apagá-la.',
  GOAL_INACTIVE: 'A meta está desligada: ligue-a para iniciar uma simulação.',
  GOAL_NOT_FOUND: 'Meta não encontrada.',
  LIVE_RUN_LIMIT_REACHED: LIVE_RUN_LIMIT_REACHED_TEXT,
  GOAL_PLAN_UNAVAILABLE:
    'Ainda não há velas suficientes para montar o plano desta estratégia neste par.',
};

export const UNAVAILABLE_REASON_TEXT: Readonly<Record<string, string>> = {
  INVALID_CANDLES: 'série de velas inválida',
  CANDLES_NOT_CONTIGUOUS: 'histórico com lacunas',
  INVALID_SENTIMENTS: 'sem dados de sentimento',
  INVALID_STRATEGY_CONFIG: 'configuração da estratégia inválida',
};

export const GOAL_OUTCOME_TEXT: Readonly<Record<string, string>> = {
  goal_reached: 'Meta atingida',
  goal_stopped: 'Parou na perda máxima',
  goal_expired: 'Prazo encerrado sem atingir a meta',
};

export const VERDICT_PLAIN: Readonly<Record<string, string>> = {
  COMPRAR: 'Boa opção no passado: chegou ao alvo na maior parte das tentativas.',
  SEGURAR: 'Resultado no meio do caminho: não dá para dizer que foi bom nem ruim.',
  EVITAR:
    'Opção fraca no passado: quase nunca chegou ao alvo ou bateu a perda máxima com frequência.',
};

export const VERDICT_HINT: Readonly<Record<string, string>> = {
  COMPRAR:
    'No histórico, esta combinação chegou ao alvo na maior parte das janelas e raramente tocou a perda máxima.',
  SEGURAR:
    'No histórico, o resultado ficou no meio do caminho ou há janelas de menos para decidir.',
  EVITAR:
    'No histórico, esta combinação tocou a perda máxima com frequência ou quase nunca chegou ao alvo.',
};

export const FAMILY_LABEL: Readonly<Record<string, string>> = {
  trend: 'Tendência',
  reversion: 'Reversão',
  volume: 'Volume',
  sentiment: 'Sentimento',
};

export const METRIC_LABEL: Readonly<Record<string, string>> = {
  close_price: 'Preço de fechamento',
  rsi: 'RSI',
  macd_gap: 'MACD contra a média',
  obv_gap: 'OBV contra a média',
  fear_greed_index: 'Índice de medo e ganância',
};

export const TRIGGER_STATE_LABEL: Readonly<Record<string, string>> = {
  awaiting_entry: 'Aguardando entrada',
  holding: 'Comprado',
};
