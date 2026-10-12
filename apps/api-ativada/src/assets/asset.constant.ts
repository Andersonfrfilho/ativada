// Copyright (c) 2026 Ada Technology. All rights reserved.

export const ASSETS_PATH = '/v1/assets';
export const ASSETS_SUMMARY_PATH = '/v1/assets/summary';
export const ASSET_PATH = '/v1/assets/:symbol';
export const ASSET_SYMBOL_PARAM = 'symbol';

// Alvo e stop padrão sobre o preço médio (RF15): +10% e −8%, configuráveis na consulta do resumo.
export const DEFAULT_ASSET_TARGET_RATE = '0.1';
export const DEFAULT_ASSET_STOP_RATE = '0.08';
// O resumo mostra o valor em USDT (o par é cotado em USDT); a conversão para R$ é do painel.
export const ASSET_SUMMARY_CURRENCY = 'USDT';

export const ASSET_SIDE = { BUY: 'buy', SELL: 'sell' } as const;
export type AssetSide = (typeof ASSET_SIDE)[keyof typeof ASSET_SIDE];

export const ASSET_REFUSAL = {
  NOT_FOUND: 'not_found',
  INSUFFICIENT_QUANTITY: 'insufficient_quantity',
} as const;

// A regra do dia por ativo: o que a estratégia diz hoje para quem JÁ tem a moeda.
export const ASSET_RULE_ACTION = { HOLD: 'hold', SELL: 'sell', WAIT: 'wait' } as const;
export type AssetRuleAction = (typeof ASSET_RULE_ACTION)[keyof typeof ASSET_RULE_ACTION];

export const ASSET_PRICE_SOURCE = { FIFTEEN_MINUTES: '15m', ONE_DAY: '1d' } as const;
// O preço atual é o fechamento do candle mais novo: o de 15 minutos se a janela abaixo o tem, senão o diário.
export const FIFTEEN_MINUTE_WINDOW_MILLISECONDS = 2 * 3_600_000;
export const ONE_DAY_WINDOW_MILLISECONDS = 3 * 86_400_000;
export const ASSET_RULE_CACHE_MAX_ENTRIES = 1_000;
export const ASSET_REASON = { NOT_ENABLED: 'not_enabled', INVALID_VALUE: 'invalid_value' } as const;
export const DECIMAL_PLACES = 8;
