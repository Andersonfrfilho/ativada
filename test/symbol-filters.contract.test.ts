// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { z } from '../packages/environment/src/index.js';
import {
  parseRunParameters,
  RUN_PARAMETERS_SCHEMA_VERSION,
} from '../packages/strategy-engine/src/index.js';
import type * as MarketEnvironmentModule from '../packages/market-data-crypto/src/market-environment.js';
import type * as SymbolFiltersModule from '../packages/market-data-crypto/src/symbol-filters.constant.js';

// Em um mutante o juiz carrega o pacote copiado, em vez do de produção.
const SOURCE =
  Bun.env['SYMBOL_FILTERS_SOURCE'] ??
  new URL('../packages/market-data-crypto/src', import.meta.url).pathname;

async function load<TModule>(file: string): Promise<TModule> {
  const module: unknown = await import(`${SOURCE}/${file}.ts`);
  return module as TModule;
}

const filters = await load<typeof SymbolFiltersModule>('symbol-filters.constant');
const environment = await load<typeof MarketEnvironmentModule>('market-environment');

const symbolsSchema = z.object({
  MARKET_SYMBOLS: environment.marketEnvironmentShape.MARKET_SYMBOLS,
});

function parseSymbols(text: string): ReturnType<typeof symbolsSchema.safeParse> {
  return symbolsSchema.safeParse({ MARKET_SYMBOLS: text });
}

describe('tabela de filtros por par', () => {
  test.each(Object.entries(filters.BINANCE_SYMBOL_FILTERS))(
    '%s: tick e passo passam pelo esquema de incremento positivo do motor',
    (symbol, entry) => {
      const parameters = parseRunParameters({
        schemaVersion: RUN_PARAMETERS_SCHEMA_VERSION,
        symbol,
        timeframe: '1h',
        sentimentSource: 'alternative.me',
        ...entry,
      });
      expect(parameters.tickSize).toBe(entry.tickSize);
      expect(parameters.quantityStep).toBe(entry.quantityStep);
    },
  );

  test('BTCUSDT e ETHUSDT ficam fora da tabela e resolvem para o padrão do motor', () => {
    expect(filters.ENGINE_DEFAULT_FILTER_SYMBOLS).toStrictEqual(['BTCUSDT', 'ETHUSDT']);
    for (const symbol of filters.ENGINE_DEFAULT_FILTER_SYMBOLS) {
      expect(Object.keys(filters.BINANCE_SYMBOL_FILTERS)).not.toContain(symbol);
      expect(filters.resolveSymbolFilters(symbol)).toBeUndefined();
    }
  });

  test('par da tabela resolve para a própria linha', () => {
    expect(filters.resolveSymbolFilters('PEPEUSDT')).toStrictEqual({
      tickSize: '0.00000001',
      quantityStep: '1',
    });
  });

  test('par desconhecido lança erro tipado que nomeia o par, nunca cai no padrão', () => {
    expect(() => filters.resolveSymbolFilters('FOOUSDT')).toThrow(/FOOUSDT/);
    expect(() => filters.resolveSymbolFilters('toString')).toThrow();
    expect(filters.hasKnownSymbolFilters('FOOUSDT')).toBe(false);
    expect(filters.hasKnownSymbolFilters('BTCUSDT')).toBe(true);
    expect(filters.hasKnownSymbolFilters('SHIBUSDT')).toBe(true);
  });
});

describe('MARKET_SYMBOLS no boot', () => {
  test('par sem filtro conhecido reprova citando o par', () => {
    const result = parseSymbols('BTCUSDT,FOOUSDT');
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('FOOUSDT');
  });

  test('pares da tabela e do padrão do motor passam', () => {
    const result = parseSymbols('PEPEUSDT,SHIBUSDT,BTCUSDT');
    expect(result.success).toBe(true);
    expect(result.data?.MARKET_SYMBOLS).toStrictEqual(['PEPEUSDT', 'SHIBUSDT', 'BTCUSDT']);
  });
});
