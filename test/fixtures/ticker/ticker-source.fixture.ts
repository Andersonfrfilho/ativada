// Copyright (c) 2026 Ada Technology. All rights reserved.
import type * as AggregatorModule from '../../../packages/market-data-crypto/src/ticker/tick-aggregator.js';
import type * as PercentModule from '../../../packages/market-data-crypto/src/ticker/percent-change.js';
import type * as SchemaModule from '../../../packages/market-data-crypto/src/ticker/ticker-stream.schema.js';
import type * as StreamModule from '../../../packages/market-data-crypto/src/ticker/create-ticker-stream.js';

const PRODUCTION_SOURCE = new URL('../../../packages/market-data-crypto/src', import.meta.url)
  .pathname;

// Os contratos do ticker rodam contra a produção; o teste de mutantes os relança num processo à parte apontando esta
// variável para uma cópia mutada de `packages/market-data-crypto/src`.
export const TICKER_SOURCE_VARIABLE = 'MARKET_TICKER_SOURCE';

export type TickerApi = {
  readonly aggregator: typeof AggregatorModule;
  readonly percent: typeof PercentModule;
  readonly schema: typeof SchemaModule;
  readonly stream: typeof StreamModule;
};

export function resolveTickerSource(): string {
  return Bun.env[TICKER_SOURCE_VARIABLE] ?? PRODUCTION_SOURCE;
}

async function load<TModule>(file: string): Promise<TModule> {
  const module: unknown = await import(`${resolveTickerSource()}/${file}.ts`);
  return module as TModule;
}

export async function loadTickerApi(): Promise<TickerApi> {
  return {
    aggregator: await load('ticker/tick-aggregator'),
    percent: await load('ticker/percent-change'),
    schema: await load('ticker/ticker-stream.schema'),
    stream: await load('ticker/create-ticker-stream'),
  };
}
