// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createCandleRepository } from '../src/candles/candle.repository.js';
import type { CandleRecord, CandleTimeframe } from '../src/candles/candle.types.js';
import type { CandleCheckContext } from './candle-checks.js';

const NOW_MILLISECONDS = 1_800_000_000_000;
const ONE_HOUR = 3_600_000;
const FIFTEEN_MINUTES = 900_000;
const GRID_ORIGIN = 444_444 * ONE_HOUR;
const HALF_HOUR = ONE_HOUR / 2;
const TWO_YEARS_OF_FIFTEEN_MINUTES = 70_080;

function buildGridCandle(params: {
  readonly symbol: string;
  readonly timeframe: CandleTimeframe;
  readonly openTime: number;
  readonly durationMilliseconds: number;
}): CandleRecord {
  return {
    exchange: 'binance',
    symbol: params.symbol,
    timeframe: params.timeframe,
    openTime: params.openTime,
    closeTime: params.openTime + params.durationMilliseconds - 1,
    open: '1.00000000',
    high: '2.00000000',
    low: '1.00000000',
    close: '2.00000000',
    volume: '1.00000000',
    tradeCount: 1,
  };
}

function hourly(symbol: string, hourIndex: number): CandleRecord {
  return buildGridCandle({
    symbol,
    timeframe: '1h',
    openTime: GRID_ORIGIN + hourIndex * ONE_HOUR,
    durationMilliseconds: ONE_HOUR,
  });
}

function hoursOf(openTimes: readonly number[]): readonly number[] {
  return openTimes.map((openTime) => (openTime - GRID_ORIGIN) / ONE_HOUR);
}

export async function checkMissingOpenTimes(context: CandleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const repository = createCandleRepository(handle, { now: () => NOW_MILLISECONDS });
  const key = { exchange: 'binance', symbol: 'GAPUSDT', timeframe: '1h' } as const;
  const present = [0, 1, 2, 5, 6, 8, 9];
  await repository.upsertCandles(present.map((hourIndex) => hourly('GAPUSDT', hourIndex)));
  await repository.upsertCandles([hourly('OTHERUSDT', 3)]);

  const holes = await repository.findMissingOpenTimes({
    ...key,
    from: GRID_ORIGIN,
    to: GRID_ORIGIN + 10 * ONE_HOUR,
  });
  assertCondition(
    JSON.stringify(hoursOf(holes)) === JSON.stringify([3, 4, 7]),
    `buracos ${hoursOf(holes).join(',')}`,
  );

  const exclusive = await repository.findMissingOpenTimes({
    ...key,
    from: GRID_ORIGIN,
    to: GRID_ORIGIN + 4 * ONE_HOUR,
  });
  assertCondition(JSON.stringify(hoursOf(exclusive)) === '[3]', 'o limite `to` deve ser exclusivo');

  const unaligned = await repository.findMissingOpenTimes({
    ...key,
    from: GRID_ORIGIN + HALF_HOUR,
    to: GRID_ORIGIN + 8 * ONE_HOUR + HALF_HOUR,
  });
  assertCondition(
    JSON.stringify(hoursOf(unaligned)) === JSON.stringify([3, 4, 7]),
    `janela fora da grade: ${hoursOf(unaligned).join(',')}`,
  );
  reportCheck('lacunas em SQL: [3,4,7] na janela, `to` exclusivo, janela fora da grade alinhada');

  const otherSymbol = await repository.findMissingOpenTimes({
    ...key,
    symbol: 'NEVERSEENUSDT',
    from: GRID_ORIGIN,
    to: GRID_ORIGIN + 10 * ONE_HOUR,
  });
  assertCondition(
    otherSymbol.length === 10,
    `par sem candles deveria faltar tudo: ${otherSymbol.length}`,
  );
  const otherTimeframe = await repository.findMissingOpenTimes({
    ...key,
    timeframe: '4h',
    from: GRID_ORIGIN,
    to: GRID_ORIGIN + 10 * ONE_HOUR,
  });
  assertCondition(otherTimeframe.length === 3, `grade de 4h: ${otherTimeframe.length} aberturas`);
  reportCheck('isolamento por símbolo e timeframe; grade de 4h tem 3 aberturas em 10 h');

  const twoYears = await repository.findMissingOpenTimes({
    exchange: 'binance',
    symbol: 'EMPTYUSDT',
    timeframe: '15m',
    from: GRID_ORIGIN,
    to: GRID_ORIGIN + TWO_YEARS_OF_FIFTEEN_MINUTES * FIFTEEN_MINUTES,
  });
  assertCondition(twoYears.length === TWO_YEARS_OF_FIFTEEN_MINUTES, `2 anos: ${twoYears.length}`);
  assertCondition(twoYears[1] === (twoYears[0] ?? 0) + FIFTEEN_MINUTES, 'ordem ou passo errados');
  reportCheck(
    `série vazia de 2 anos em 15m -> ${TWO_YEARS_OF_FIFTEEN_MINUTES} aberturas esperadas`,
  );
}
