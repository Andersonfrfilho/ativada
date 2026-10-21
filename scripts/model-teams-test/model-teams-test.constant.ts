// Copyright (c) 2026 Ada Technology. All rights reserved.
export const TEMPORARY_DATABASE_PREFIX = 'ativada_model_teams_';
export const WORKER_ENTRYPOINT = 'apps/worker-ativada/src/main.ts';
export const EXCHANGE = 'binance';
export const SYMBOL = 'BTCUSDT';
export const TIMEFRAME = '15m';
export const CANDLE_MILLISECONDS = 900_000;
export const SEEDED_CANDLES = 130;
export const SEED_PRICE = '100.00000000';

export const MODEL_ID = 'fake-model-1';
export const INPUT_PRICE = '2';
export const OUTPUT_PRICE = '10';
export const DAILY_BUDGET = '2';
export const MONTHLY_BUDGET = '50';
export const PROVIDER_LATENCY_MILLISECONDS = 150;

// Chaves falsas e reconhecíveis: o teste varre o banco, o batimento e a saída do worker atrás delas.
export const SENTINEL = {
  anthropic: 'sk-test-SENTINEL-anthropic',
  gemini: 'sk-test-SENTINEL-gemini',
  openai: 'sk-test-SENTINEL-openai',
} as const;

export const WAIT_TIMEOUT_MILLISECONDS = 40_000;
export const SHUTDOWN_BUDGET_MILLISECONDS = 5_000;

// Custo à mão das respostas padrão do falso (3.200 de entrada, 450 de saída e 300 de raciocínio, US$ 2 e 10 por milhão).
export const EXPECTED_COST = { lucas: '0.0109', nina: '0.0139', olivia: '0.0139' } as const;
