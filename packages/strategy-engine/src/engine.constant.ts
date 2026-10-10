// Copyright (c) 2026 Ada Technology. All rights reserved.

export const STRATEGY_CONFIG_SCHEMA_VERSION = 1 as const;
export const RUN_PARAMETERS_SCHEMA_VERSION = 1 as const;
// Código de problema do Zod para regra entre campos; chave que discrimina regra, regime e entrada.
export const CUSTOM_ISSUE_CODE = 'custom' as const;
export const RULE_DISCRIMINATOR = 'kind' as const;
export const ENGINE_STATE_VERSION = 1 as const;
// Versão da semântica da metade SINAL (votos, regime, placar, motivo): o dourado do Placar clássico é
// preso a ela. Mudar a saída exige nova versão e novo dourado; a T2.5 a integra à `engineVersion`.
export const SIGNAL_ENGINE_VERSION = 'signal-2';
// Versão da semântica do motor COMPLETO (sinal + modelo de preenchimento + política da carteira): é ela que
// o estado grava. Saída diferente exige nova versão e novo dourado; estado de outra versão migra (§b).
export const ENGINE_VERSION = 'engine-1';

// Teto de combinações da grade do walk-forward (RNF02); a grade em si é parâmetro da execução (T3.3).
export const MAX_WALK_FORWARD_COMBINATIONS = 200;
export const MAX_STRATEGY_RULES = 12;
// ln(1/ε) com ε = 1e-3 (peso residual do primeiro candle); constante: logaritmo é proibido no motor.
export const LN_INVERSE_CONVERGENCE_EPSILON = 6.907755278982137;
// Fear & Greed é diário; observação mais velha que isto vira dado ausente (voto 0).
export const SENTIMENT_STALE_AFTER_MILLISECONDS = 48 * 60 * 60 * 1_000;
export const SENTIMENT_MAXIMUM_VALUE = 100;
// A fonte do sentimento é um identificador curto (o guarda recusa observação com fonte maior).
export const MAX_SENTIMENT_SOURCE_LENGTH = 64;
// Mesmas casas do `numeric(24,8)` do banco para saldo, taxa e valor de operação.
export const MONEY_DECIMAL_PLACES = 8;
// numeric(24,8) guarda 16 dígitos inteiros; 1e9 de saldo deixa folga para quantidade × preço.
export const MAX_INITIAL_BALANCE = '1000000000';
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

// Ids de snapshot e de valor de indicador têm espaço de nome: regra, risco e regime nunca colidem.
export const INDICATOR_NAMESPACE = {
  RULE: 'rule',
  RISK: 'risk',
  REGIME: 'regime',
  PREVIOUS: 'previous',
} as const;
export const RISK_ATR_INDICATOR_ID = `${INDICATOR_NAMESPACE.RISK}:atr`;
export const REGIME_ADX_INDICATOR_ID = `${INDICATOR_NAMESPACE.REGIME}:adx`;
