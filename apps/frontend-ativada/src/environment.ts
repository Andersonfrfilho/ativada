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
  // As velas só de exibição do ambiente (spec 017); vazio = nenhuma.
  VITE_MARKET_DISPLAY_TIMEFRAMES: z.string().default(''),
  // Outro endereço do mesmo painel (a ponte do Cloudflare) com o seu Keycloak: `origem|url,origem|url`; vazio = só o padrão.
  VITE_KEYCLOAK_AUTHORIZE_URL_BY_ORIGIN: z.string().default(''),
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

// As velas de exibição que o ambiente da API grava (MARKET_DISPLAY_TIMEFRAMES): vazio, o gráfico só mostra as da execução.
export function readMarketDisplayTimeframes(environment: Environment): readonly string[] {
  return environment.VITE_MARKET_DISPLAY_TIMEFRAMES.split(SYMBOL_SEPARATOR)
    .map((timeframe) => timeframe.trim())
    .filter((timeframe) => timeframe.length > 0);
}

export function isProductionBuild(): boolean {
  return import.meta.env['MODE'] === PRODUCTION_MODE;
}

const ORIGIN_SEPARATOR = '|';

// O login segue o endereço por onde o painel foi aberto: a origem listada usa o Keycloak dela; qualquer outra, o padrão.
export function resolveAuthorizeUrl(environment: Environment, origin: string): string {
  const match = environment.VITE_KEYCLOAK_AUTHORIZE_URL_BY_ORIGIN.split(SYMBOL_SEPARATOR)
    .map((entry) => entry.trim().split(ORIGIN_SEPARATOR))
    .find(([entryOrigin, url]) => entryOrigin === origin && url !== undefined && url.length > 0);
  return match?.[1] ?? environment.VITE_KEYCLOAK_AUTHORIZE_URL;
}
