// Copyright (c) 2026 Ada Technology. All rights reserved.

export const STRATEGY_CONFIG_SCHEMA_VERSION = 1 as const;
// Código de problema do Zod para regra entre campos; chave que discrimina regra, regime e entrada.
export const CUSTOM_ISSUE_CODE = 'custom' as const;
export const RULE_DISCRIMINATOR = 'kind' as const;
export const ENGINE_STATE_VERSION = 1 as const;

// Teto de combinações da grade do walk-forward (RNF02); a grade em si é parâmetro da execução (T3.3).
export const MAX_WALK_FORWARD_COMBINATIONS = 200;
export const MAX_STRATEGY_RULES = 12;
// O pré-aquecimento carrega o triplo do aquecimento mais longo: médias exponenciais têm memória infinita.
export const LEAD_IN_WARMUP_MULTIPLIER = 3;
// Fear & Greed é diário; observação mais velha que isto vira dado ausente (voto 0).
export const SENTIMENT_STALE_AFTER_MILLISECONDS = 48 * 60 * 60 * 1_000;
// Mesmas casas do `numeric(24,8)` do banco para saldo, taxa e valor de operação.
export const MONEY_DECIMAL_PLACES = 8;
// Algarismos significativos com que um valor de indicador (float) cruza para decimal.
export const INDICATOR_SIGNIFICANT_DIGITS = 15;

export const ENGINE_TIMEFRAME = {
  FIFTEEN_MINUTES: '15m',
  ONE_HOUR: '1h',
  FOUR_HOURS: '4h',
  ONE_DAY: '1d',
} as const;

export type EngineTimeframe = (typeof ENGINE_TIMEFRAME)[keyof typeof ENGINE_TIMEFRAME];

const MILLISECONDS_PER_MINUTE = 60_000;

export const ENGINE_TIMEFRAME_DURATION_MILLISECONDS: Readonly<Record<EngineTimeframe, number>> = {
  [ENGINE_TIMEFRAME.FIFTEEN_MINUTES]: 15 * MILLISECONDS_PER_MINUTE,
  [ENGINE_TIMEFRAME.ONE_HOUR]: 60 * MILLISECONDS_PER_MINUTE,
  [ENGINE_TIMEFRAME.FOUR_HOURS]: 240 * MILLISECONDS_PER_MINUTE,
  [ENGINE_TIMEFRAME.ONE_DAY]: 1_440 * MILLISECONDS_PER_MINUTE,
};
