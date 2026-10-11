// Copyright (c) 2026 Ada Technology. All rights reserved.
export const TEMPORARY_DATABASE_PREFIX = 'crypto_panel_';
export const EXCHANGE = 'binance';
export const SYMBOLS = ['BTCUSDT', 'ETHUSDT'] as const;
export const HOUR_MILLISECONDS = 3_600_000;
export const HISTORY_HOURS = 30;
export const EQUITY_HOURS = 24;
export const INITIAL_BALANCE = '10000.00';
export const FINAL_EQUITY = '10420.00';
export const FINAL_BENCHMARK = '10100.00';
export const STARTUP_TIMEOUT_MILLISECONDS = 30_000;
export const STARTUP_POLL_MILLISECONDS = 250;
export const PANEL_PATH = 'apps/frontend-cryptoada';
export const PLAYWRIGHT_BIN = `${PANEL_PATH}/node_modules/.bin/playwright`;
export const PLAYWRIGHT_CONFIG = `${PANEL_PATH}/playwright.config.ts`;
export const BASE_PRICE: Readonly<Record<string, number>> = { BTCUSDT: 61_000, ETHUSDT: 3_000 };
export const PRICE_STEP: Readonly<Record<string, number>> = { BTCUSDT: 10, ETHUSDT: 1 };

export const E2E_ENV = {
  BASE_URL: 'PANEL_E2E_BASE_URL',
  API_URL: 'PANEL_E2E_API_URL',
  USERNAME: 'PANEL_E2E_USERNAME',
  PASSWORD: 'PANEL_E2E_PASSWORD',
  EMAIL: 'PANEL_E2E_EMAIL',
  TELEGRAM_SECRET: 'PANEL_E2E_TELEGRAM_SECRET',
  TELEGRAM_CHAT_ID: 'PANEL_E2E_TELEGRAM_CHAT_ID',
  EXPECTED: 'PANEL_E2E_EXPECTED',
} as const;
