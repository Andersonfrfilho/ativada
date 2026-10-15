// Copyright (c) 2026 Ada Technology. All rights reserved.
import { httpUrlSchema, nonEmptyTextSchema, parseEnvironment, z } from '@ativada/environment';

const DEFAULT_SESSION_CLIENT_ID = 'ativada-session';
const DEFAULT_MARKET_SYMBOLS = 'BTCUSDT,ETHUSDT';
const DEFAULT_MARKET_TIMEFRAMES = '15m,1h,4h,1d';
const SYMBOL_SEPARATOR = ',';
const PRODUCTION_MODE = 'production';

// Tudo aqui é público (vai no bundle): nenhum segredo cabe em VITE_*.
export const environmentSchema = z.object({
  VITE_API_URL: httpUrlSchema,
  VITE_KEYCLOAK_AUTHORIZE_URL: httpUrlSchema,
  VITE_KEYCLOAK_CLIENT_ID: nonEmptyTextSchema.default(DEFAULT_SESSION_CLIENT_ID),
  VITE_MARKET_SYMBOLS: nonEmptyTextSchema.default(DEFAULT_MARKET_SYMBOLS),
  VITE_MARKET_TIMEFRAMES: nonEmptyTextSchema.default(DEFAULT_MARKET_TIMEFRAMES),
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(
  source: Readonly<Record<string, string | undefined>> = import.meta.env,
): Environment {
  return parseEnvironment(environmentSchema, source);
}

export function readMarketSymbols(environment: Environment): readonly string[] {
  return environment.VITE_MARKET_SYMBOLS.split(SYMBOL_SEPARATOR)
    .map((symbol) => symbol.trim())
    .filter((symbol) => symbol.length > 0);
}

// As velas que o ambiente da API tem (MARKET_TIMEFRAMES): pedir outra devolve 400.
export function readMarketTimeframes(environment: Environment): readonly string[] {
  return environment.VITE_MARKET_TIMEFRAMES.split(SYMBOL_SEPARATOR)
    .map((timeframe) => timeframe.trim())
    .filter((timeframe) => timeframe.length > 0);
}

export function isProductionBuild(): boolean {
  return import.meta.env['MODE'] === PRODUCTION_MODE;
}
