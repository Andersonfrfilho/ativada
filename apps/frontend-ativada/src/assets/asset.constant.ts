// Copyright (c) 2026 Ada Technology. All rights reserved.
export const ASSET_QUERY_ROOT = 'assets';
export const USDT_RATE_STORAGE_KEY = 'ativada.usdt-brl-rate';
export const QUANTITY_FRACTION_DIGITS = 8;

export const ASSET_OPERATION = { BUY: 'buy', SELL: 'sell', REPLACE: 'replace' } as const;
export type AssetOperation = (typeof ASSET_OPERATION)[keyof typeof ASSET_OPERATION];

export const OPERATION_OPTIONS = [
  { value: ASSET_OPERATION.BUY, label: 'Comprar' },
  { value: ASSET_OPERATION.SELL, label: 'Vender' },
  { value: ASSET_OPERATION.REPLACE, label: 'Definir posição' },
] as const;

export const RULE_LABEL: Readonly<Record<string, string>> = {
  hold: 'Segurar',
  sell: 'Vender',
  wait: 'Aguardar',
};

export const ASSET_ERROR_TEXT: Readonly<Record<string, string>> = {
  ASSET_INSUFFICIENT_QUANTITY: 'Você está tentando vender mais do que você tem.',
  ASSET_NOT_FOUND: 'Esse ativo não está registrado: registre uma compra antes.',
  ASSET_LIMIT_REACHED:
    'Você atingiu o limite de ativos registrados. Apague um para registrar outro.',
};

export const ASSET_FIELD_LABEL: Readonly<Record<string, string>> = {
  quantity: 'Quantidade',
  price: 'Preço pago',
  averagePrice: 'Preço médio',
  symbol: 'Par',
};
