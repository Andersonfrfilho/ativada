// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MILLISECONDS_PER_SECOND, readErrorName } from '@ativada/environment';
import { MarketDataBannedError, type MarketCandleTimeframe } from '@ativada/market-data-crypto';

import { backfillPair, type BackfillPair, type BackfillPairDependencies } from './backfill-pair.js';
import { BACKFILL_LOG } from './market.constant.js';

export type BackfillCandlesDependencies = BackfillPairDependencies & {
  readonly symbols: readonly string[];
  readonly timeframes: readonly MarketCandleTimeframe[];
};

export type BackfillCandlesSummary = {
  readonly pairs: number;
  readonly inserted: number;
  readonly unfillable: number;
  readonly failures: number;
};

export type BackfillCandlesTask = () => Promise<BackfillCandlesSummary>;

function listPairs(dependencies: BackfillCandlesDependencies): readonly BackfillPair[] {
  return dependencies.symbols.flatMap((symbol) =>
    dependencies.timeframes.map((timeframe) => ({ symbol, timeframe })),
  );
}

function reportBan(
  dependencies: BackfillCandlesDependencies,
  pair: BackfillPair,
  error: MarketDataBannedError,
): MarketDataBannedError {
  const { retryAfterSeconds } = error;
  dependencies.logger.error(BACKFILL_LOG.BANNED, {
    symbol: pair.symbol,
    timeframe: pair.timeframe,
    ...(retryAfterSeconds === undefined
      ? {}
      : {
          retryAfterSeconds,
          bannedUntil: new Date(
            dependencies.now() + retryAfterSeconds * MILLISECONDS_PER_SECOND,
          ).toISOString(),
        }),
  });
  return error;
}

export function createBackfillCandlesTask(
  dependencies: BackfillCandlesDependencies,
): BackfillCandlesTask {
  return async () => {
    await dependencies.refreshClock();
    const pairs = listPairs(dependencies);
    let inserted = 0;
    let unfillable = 0;
    let failures = 0;
    // Em sequência de propósito: o peso por minuto da Binance é compartilhado por todos os pares.
    for (const pair of pairs) {
      try {
        const result = await backfillPair(dependencies, pair);
        inserted += result.inserted;
        unfillable += result.unfillable;
      } catch (error: unknown) {
        // Banido, cada requisição nova só estende a punição: a execução inteira para.
        if (error instanceof MarketDataBannedError) throw reportBan(dependencies, pair, error);
        failures += 1;
        dependencies.logger.error(BACKFILL_LOG.PAIR_FAILED, {
          symbol: pair.symbol,
          timeframe: pair.timeframe,
          errorName: readErrorName(error),
        });
      }
    }
    return { pairs: pairs.length, inserted, unfillable, failures };
  };
}
