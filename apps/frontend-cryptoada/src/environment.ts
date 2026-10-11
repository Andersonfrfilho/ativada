// Copyright (c) 2026 Ada Technology. All rights reserved.
import { httpUrlSchema, nonEmptyTextSchema, parseEnvironment, z } from '@cryptoada/environment';

const DEFAULT_SESSION_CLIENT_ID = 'cryptoada-session';
const DEFAULT_MARKET_SYMBOLS = 'BTCUSDT,ETHUSDT';
const SYMBOL_SEPARATOR = ',';
const PRODUCTION_MODE = 'production';

// Tudo aqui é público (vai no bundle): nenhum segredo cabe em VITE_*.
export const environmentSchema = z.object({
  VITE_API_URL: httpUrlSchema,
  VITE_KEYCLOAK_AUTHORIZE_URL: httpUrlSchema,
  VITE_KEYCLOAK_CLIENT_ID: nonEmptyTextSchema.default(DEFAULT_SESSION_CLIENT_ID),
  VITE_MARKET_SYMBOLS: nonEmptyTextSchema.default(DEFAULT_MARKET_SYMBOLS),
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

export function isProductionBuild(): boolean {
  return import.meta.env['MODE'] === PRODUCTION_MODE;
}
