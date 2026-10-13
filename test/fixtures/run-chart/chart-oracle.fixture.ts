// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  FillClusterBucket,
  FillInput,
  PositionInput,
  PriceColumn,
  TimeRange,
  TradeTotals,
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

// Os totais das operações (T1.4): contas em `bigint` de escala 18 (cobre os 12 decimais do notional), arredondando para a
// escala 8 do caixa do motor: pago = teto(notional da compra) + taxa; recebido = piso(notional da venda) - taxa.
const WIDE_DIGITS = 18;
const WIDE_SCALE = 10n ** BigInt(WIDE_DIGITS);
const NARROW_FACTOR = 10n ** BigInt(WIDE_DIGITS - DECIMAL_PLACES);

function toWide(text: string): bigint {
  const [whole = '0', fraction = ''] = text.split('.');
  return (
    BigInt(whole) * WIDE_SCALE + BigInt(fraction.padEnd(WIDE_DIGITS, '0').slice(0, WIDE_DIGITS))
  );
}

const ceilToCents8 = (wide: bigint): bigint => (wide + NARROW_FACTOR - 1n) / NARROW_FACTOR;
const floorToCents8 = (wide: bigint): bigint => wide / NARROW_FACTOR;

function formatScale8(value: bigint): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(DECIMAL_PLACES + 1, '0');
  const text = `${digits.slice(0, -DECIMAL_PLACES)}.${digits.slice(-DECIMAL_PLACES)}`;
  return canonicalDecimal(`${negative ? '-' : ''}${text}`);
}

function sumScale8<TItem>(
  items: readonly TItem[],
  valueOf: (item: TItem) => bigint | undefined,
): bigint {
  return items.reduce((total, item) => total + (valueOf(item) ?? 0n), 0n);
}

export function referenceTradeTotals(params: {
  readonly positions: readonly PositionInput[];
  readonly fills: readonly FillInput[];
}): TradeTotals {
  const fillOf = (position: PositionInput, side: string): FillInput | undefined =>
    params.fills.find((fill) => fill.positionKey === position.engineKey && fill.side === side);
  const paidOf = (position: PositionInput): bigint | undefined => {
    const buy = fillOf(position, 'buy');
    return buy === undefined
      ? undefined
      : ceilToCents8(toWide(buy.notional)) + toScaled(position.entryFee);
  };
  const receivedOf = (position: PositionInput): bigint | undefined => {
    const sell = fillOf(position, 'sell');
    if (sell === undefined || position.exitFee === undefined) return undefined;
    return floorToCents8(toWide(sell.notional)) - toScaled(position.exitFee);
  };
  const closed = params.positions.filter((position) => position.status === 'closed');
  const open = params.positions.filter((position) => position.status === 'open');
  return {
    closedTrades: closed.length,
    openTrades: open.length,
    totalPaid: formatScale8(sumScale8(closed, paidOf)),
    totalReceived: formatScale8(sumScale8(closed, receivedOf)),
    totalFees: formatScale8(
      sumScale8(
        closed,
        (position) => toScaled(position.entryFee) + toScaled(position.exitFee ?? '0'),
      ),
    ),
    openPaid: open.length === 0 ? undefined : formatScale8(sumScale8(open, paidOf)),
  };
}
