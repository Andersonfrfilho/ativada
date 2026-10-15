// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  CandleRecord,
  ProjectionItemRow,
  ProjectionReadParams,
  RunProjectionRepository,
  SignalInput,
} from '../../../packages/database/src/index.js';
import type { OwnerScope } from '../../../packages/database/src/ownership/owner-scope.js';
import { toProjectionCounts } from '../projections/projection-counts.fixture.js';
import {
  summarizeOracle,
  type OraclePrediction,
} from '../projections/projection-summary-oracle.fixture.js';
import type { InMemoryLiveStatusParams } from './in-memory-live-status.fixture.js';

const LAYER_ROWS_MAXIMUM = 1_000;
const ITEMS_MAXIMUM = 100;
const ATR_KEY = 'risk:atr';

function atrTextOf(signal: SignalInput): string | null {
  if (Array.isArray(signal.indicators)) return null;
  const value: unknown = Object.getOwnPropertyDescriptor(signal.indicators, ATR_KEY)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
}

type Placed = { readonly signal: SignalInput; readonly buy: string; readonly sell: string };

function placeInSegments(signals: readonly SignalInput[], params: ProjectionReadParams): Placed[] {
  return params.segments.flatMap((segment) =>
    signals
      .filter(
        (signal) => signal.candleTime >= segment.startTime && signal.candleTime < segment.endTime,
      )
      .map((signal) => ({ signal, buy: segment.buy, sell: segment.sell })),
  );
}

// As leituras da previsão sobre as listas em memória, com a mesma semântica do Postgres: filtro de dono em cada uma, o
// resumo contado pelo ORÁCULO independente (nada de reimplementar a conta) e itens decrescentes com a vela seguinte contígua.
export function createInMemoryProjections(
  params: InMemoryLiveStatusParams,
): RunProjectionRepository {
  const { isOwned, storeOf, candleSeed, calls } = params;

  const candleAt = (read: ProjectionReadParams, openTime: number): CandleRecord | undefined =>
    candleSeed.find(
      (candle) =>
        candle.exchange === read.market.exchange &&
        candle.symbol === read.market.symbol &&
        candle.timeframe === read.market.timeframe &&
        candle.openTime === openTime,
    );

  const nextCloseOf = (read: ProjectionReadParams, candleTime: number): string | null => {
    const nextOpen = candleTime + read.durationMilliseconds;
    return nextOpen < read.rangeEnd ? (candleAt(read, nextOpen)?.close ?? null) : null;
  };

  const placedOf = (scope: OwnerScope, runId: string, read: ProjectionReadParams): Placed[] =>
    isOwned(scope, runId) ? placeInSegments(storeOf(runId).signals, read) : [];

  const toPrediction = (read: ProjectionReadParams, placed: Placed): OraclePrediction => {
    const { signal } = placed;
    return {
      candleTime: signal.candleTime,
      score: signal.score,
      close: candleAt(read, signal.candleTime)?.close ?? '0',
      atr: atrTextOf(signal),
      nextClose: nextCloseOf(read, signal.candleTime) ?? undefined,
      buyThreshold: placed.buy,
      sellThreshold: placed.sell,
    };
  };

  const toItem = (read: ProjectionReadParams, placed: Placed): ProjectionItemRow => {
    const base = candleAt(read, placed.signal.candleTime);
    if (base === undefined) throw new Error('Decisão gravada sem a vela correspondente.');
    return {
      candleTime: placed.signal.candleTime,
      score: placed.signal.score,
      close: base.close,
      atr: atrTextOf(placed.signal),
      nextClose: nextCloseOf(read, placed.signal.candleTime),
      buy: placed.buy,
      sell: placed.sell,
    };
  };

  const listLayerRows: RunProjectionRepository['listLayerRows'] = (scope, runId, request) => {
    calls.push('listLayerRows');
    if (!isOwned(scope, runId)) return Promise.resolve([]);
    const limit = Math.min(Math.max(Math.trunc(request.limit), 1), LAYER_ROWS_MAXIMUM);
    const { range } = request;
    return Promise.resolve(
      [...storeOf(runId).signals]
        .filter((signal) => signal.candleTime >= range.from && signal.candleTime < range.to)
        .sort((left, right) => left.candleTime - right.candleTime)
        .slice(0, limit)
        .map((signal) => ({
          candleTime: signal.candleTime,
          action: signal.action,
          score: signal.score,
          indicators: signal.indicators,
        })),
    );
  };

  const summarizeProjections: RunProjectionRepository['summarizeProjections'] = (
    scope,
    runId,
    read,
  ) => {
    calls.push('summarizeProjections');
    const predictions = placedOf(scope, runId, read).map((placed) => toPrediction(read, placed));
    return Promise.resolve(toProjectionCounts(summarizeOracle(predictions)));
  };

  const listProjectionItems: RunProjectionRepository['listProjectionItems'] = (
    scope,
    runId,
    read,
  ) => {
    calls.push('listProjectionItems');
    const limit = Math.min(Math.max(Math.trunc(read.limit), 1), ITEMS_MAXIMUM);
    const { before } = read;
    const rows = placedOf(scope, runId, read)
      .filter((placed) => before === undefined || placed.signal.candleTime < before)
      .sort((left, right) => right.signal.candleTime - left.signal.candleTime);
    const page = rows.slice(0, limit);
    return Promise.resolve({
      items: page.map((placed) => toItem(read, placed)),
      nextBefore: rows.length > limit ? page.at(-1)?.signal.candleTime : undefined,
    });
  };

  return { listLayerRows, summarizeProjections, listProjectionItems };
}
