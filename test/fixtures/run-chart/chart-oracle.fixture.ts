// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  FillClusterBucket,
  PriceColumn,
  TimeRange,
} from '../../../packages/database/src/index.js';

// O oráculo do gráfico (spec 005, T1.2): a redução do preço e o agrupamento de preenchimentos em TypeScript puro,
// com `bigint`, sem importar o SQL nem o código de produção. O SQL e os repositórios em memória são julgados contra ele.
const DECIMAL_PLACES = 8;
const SCALE = 10n ** BigInt(DECIMAL_PLACES);

export type OracleCandle = {
  readonly openTime: number;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
};

export type OracleFill = { readonly side: string; readonly candleTime: number };

export function toScaled(text: string): bigint {
  const [whole = '0', fraction = ''] = text.split('.');
  return (
    BigInt(whole) * SCALE + BigInt(fraction.padEnd(DECIMAL_PLACES, '0').slice(0, DECIMAL_PLACES))
  );
}

// A grafia canônica do motor: sem zeros à direita e sem ponto sobrando.
export function canonicalDecimal(text: string): string {
  if (!text.includes('.')) return text;
  return text.replace(/0+$/, '').replace(/\.$/, '');
}

// Piso de ((t - from) * columns) / (to - from): `bigint` não arredonda e os operandos não são negativos.
export function bucketOf(params: {
  readonly time: number;
  readonly range: TimeRange;
  readonly columns: number;
}): number {
  const { time, range, columns } = params;
  const bucket = (BigInt(time - range.from) * BigInt(columns)) / BigInt(range.to - range.from);
  return Number(bucket);
}

function groupBy<TItem>(
  items: readonly TItem[],
  bucketOfItem: (item: TItem) => number,
): readonly (readonly TItem[])[] {
  const groups = new Map<number, TItem[]>();
  for (const item of items) {
    const bucket = bucketOfItem(item);
    groups.set(bucket, [...(groups.get(bucket) ?? []), item]);
  }
  return [...groups.entries()].sort((left, right) => left[0] - right[0]).map(([, group]) => group);
}

function extremeOf(
  candles: readonly OracleCandle[],
  pick: (candle: OracleCandle) => string,
  isBetter: (candidate: bigint, current: bigint) => boolean,
): string {
  let best = pick(candles[0] as OracleCandle);
  for (const candle of candles) {
    if (isBetter(toScaled(pick(candle)), toScaled(best))) best = pick(candle);
  }
  return canonicalDecimal(best);
}

export function referencePriceColumns(params: {
  readonly candles: readonly OracleCandle[];
  readonly range: TimeRange;
  readonly columns: number;
}): readonly PriceColumn[] {
  const { range, columns } = params;
  const inRange = params.candles
    .filter((candle) => candle.openTime >= range.from && candle.openTime < range.to)
    .sort((left, right) => left.openTime - right.openTime);
  return groupBy(inRange, (candle) => bucketOf({ time: candle.openTime, range, columns })).map(
    (group) => ({
      startTime: (group[0] as OracleCandle).openTime,
      endTime: (group.at(-1) as OracleCandle).openTime,
      first: canonicalDecimal((group[0] as OracleCandle).open),
      last: canonicalDecimal((group.at(-1) as OracleCandle).close),
      low: extremeOf(
        group,
        (candle) => candle.low,
        (candidate, current) => candidate < current,
      ),
      high: extremeOf(
        group,
        (candle) => candle.high,
        (candidate, current) => candidate > current,
      ),
    }),
  );
}

export function referenceFillClusters(params: {
  readonly fills: readonly OracleFill[];
  readonly range: TimeRange;
  readonly columns: number;
}): readonly FillClusterBucket[] {
  const { range, columns } = params;
  const inRange = params.fills.filter(
    (fill) => fill.candleTime >= range.from && fill.candleTime < range.to,
  );
  return groupBy(inRange, (fill) => bucketOf({ time: fill.candleTime, range, columns })).map(
    (group) => ({
      bucket: bucketOf({ time: (group[0] as OracleFill).candleTime, range, columns }),
      buys: group.filter((fill) => fill.side === 'buy').length,
      sells: group.filter((fill) => fill.side === 'sell').length,
    }),
  );
}
