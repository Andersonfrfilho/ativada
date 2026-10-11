// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Route } from '../../../apps/api-cryptoada/src/router/route.types.js';
import type { CandleRecord } from '../../../packages/database/src/index.js';
import {
  createInMemoryUserAssets,
  type InMemoryUserAssets,
} from './in-memory-user-assets.fixture.js';
import { buildDailyCandles, GOAL_SYMBOLS } from './goals-harness.fixture.js';
import { createRunsHarness, EXCHANGE, type RunsHarness } from './runs-harness.fixture.js';

export type AssetsHarness = RunsHarness & {
  readonly userAssets: InMemoryUserAssets;
  readonly candleRecords: CandleRecord[];
  readonly summaryReads: { count: number };
  // Quantas regras do dia foram CALCULADAS (e não lidas do cache).
  readonly ruleWrites: { count: number };
};

export type AssetsHarnessOptions = {
  readonly maxAssets?: number;
  // Pares habilitados sem nenhum candle gravado (ativo sem preço).
  readonly symbolsWithoutCandles?: readonly string[];
};

const NO_SENTIMENT = { listAvailable: (): Promise<[]> => Promise.resolve([]) };

export async function createAssetsHarness(
  options: AssetsHarnessOptions = {},
): Promise<AssetsHarness> {
  const userAssets = createInMemoryUserAssets();
  const symbols = [...GOAL_SYMBOLS, ...(options.symbolsWithoutCandles ?? [])];
  const candleRecords = buildDailyCandles(GOAL_SYMBOLS);
  const summaryReads = { count: 0 };
  const ruleWrites = { count: 0 };
  const harness = await createRunsHarness({
    candles: candleRecords,
    symbols,
    extraRoutes: (app, parts): readonly Route[] => {
      const useCases = app.assetUseCases;
      const base = { assets: userAssets.repository, maxAssets: options.maxAssets ?? 50 };
      return app.assetRoutes.createAssetRoutes({
        enabledSymbols: symbols,
        listAssets: useCases.createListAssetsUseCase(base),
        getAsset: useCases.createGetAssetUseCase(base),
        replaceAsset: useCases.createReplaceAssetUseCase(base),
        tradeAsset: useCases.createTradeAssetUseCase(base),
        deleteAsset: useCases.createDeleteAssetUseCase(base),
        getAssetSummary: app.assetSummary.createGetAssetSummaryUseCase({
          assets: userAssets.repository,
          strategies: parts.strategies.repository,
          candles: {
            findCandles: (params): ReturnType<typeof parts.candles.repository.findCandles> => {
              summaryReads.count += 1;
              return parts.candles.repository.findCandles(params);
            },
          },
          sentiments: NO_SENTIMENT,
          exchange: EXCHANGE,
          symbols,
          now: () => parts.clock.now,
          cache: ((): ReturnType<typeof app.assetRule.createAssetRuleCache> => {
            const cache = app.assetRule.createAssetRuleCache();
            return {
              get: cache.get,
              set: (key, rule): void => {
                ruleWrites.count += 1;
                cache.set(key, rule);
              },
            };
          })(),
        }),
      });
    },
  });
  return { ...harness, userAssets, candleRecords, summaryReads, ruleWrites };
}
