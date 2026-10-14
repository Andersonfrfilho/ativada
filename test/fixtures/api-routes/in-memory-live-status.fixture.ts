// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  CandleRecord,
  DecisionRow,
  EquityPointInput,
  PositionInput,
  RunLiveStatusRepository,
  SignalInput,
} from '../../../packages/database/src/index.js';
import type { OwnerScope } from '../../../packages/database/src/ownership/owner-scope.js';

const DECISION_ROWS_MAXIMUM = 100;

export type LiveStatusStore = {
  readonly signals: readonly SignalInput[];
  readonly positions: readonly PositionInput[];
  readonly equity: readonly EquityPointInput[];
};

export type InMemoryLiveStatusParams = {
  readonly isOwned: (scope: OwnerScope, runId: string) => boolean;
  readonly storeOf: (runId: string) => LiveStatusStore;
  readonly candleSeed: readonly CandleRecord[];
  // Cada leitura anota o nome aqui: o teste conta as consultas de um pedido.
  readonly calls: string[];
};

type Reader<TName extends keyof RunLiveStatusRepository> = RunLiveStatusRepository[TName];

// As leituras do acompanhamento sobre as listas em memória, com a mesma semântica do Postgres: filtro de dono em cada uma,
// decrescente por vela, junção com a vela pela chave, posições que cruzam a faixa.
export function createInMemoryLiveStatus(
  params: InMemoryLiveStatusParams,
): RunLiveStatusRepository {
  const { isOwned, storeOf, candleSeed, calls } = params;

  const readLatestEquityPoint: Reader<'readLatestEquityPoint'> = (scope, runId) => {
    calls.push('readLatestEquityPoint');
    if (!isOwned(scope, runId)) return Promise.resolve(undefined);
    const points = [...storeOf(runId).equity].sort(
      (left, right) => right.candleTime - left.candleTime,
    );
    return Promise.resolve(points[0]);
  };

  const listDecisionRows: Reader<'listDecisionRows'> = (scope, runId, request) => {
    calls.push('listDecisionRows');
    if (!isOwned(scope, runId)) return Promise.resolve({ items: [], nextBefore: undefined });
    const limit = Math.min(Math.max(Math.trunc(request.limit), 1), DECISION_ROWS_MAXIMUM);
    const { before, market } = request;
    const rows = [...storeOf(runId).signals]
      .filter((signal) => before === undefined || signal.candleTime < before)
      .sort((left, right) => right.candleTime - left.candleTime);
    const page = rows.slice(0, limit);
    const items = page.map((signal): DecisionRow => {
      const candle = candleSeed.find(
        (candidate) =>
          candidate.exchange === market.exchange &&
          candidate.symbol === market.symbol &&
          candidate.timeframe === market.timeframe &&
          candidate.openTime === signal.candleTime,
      );
      if (candle === undefined) throw new Error('Decisão gravada sem a vela correspondente.');
      return { ...signal, close: candle.close, closeTime: candle.closeTime };
    });
    return Promise.resolve({
      items,
      nextBefore: rows.length > limit ? page.at(-1)?.candleTime : undefined,
    });
  };

  const listPositionsAround: Reader<'listPositionsAround'> = (scope, runId, request) => {
    calls.push('listPositionsAround');
    if (!isOwned(scope, runId)) return Promise.resolve([]);
    const { span } = request;
    const rows = storeOf(runId)
      .positions.filter(
        (position) =>
          position.status === 'open' ||
          (span !== undefined &&
            position.openedCandleTime <= span.to &&
            position.closedCandleTime !== undefined &&
            position.closedCandleTime > span.from),
      )
      .sort((left, right) => left.openedCandleTime - right.openedCandleTime);
    return Promise.resolve(rows.slice(0, request.limit));
  };

  const listDecisionMarkers: Reader<'listDecisionMarkers'> = (scope, runId, request) => {
    calls.push('listDecisionMarkers');
    if (!isOwned(scope, runId)) return Promise.resolve([]);
    const { range } = request;
    const rows = storeOf(runId)
      .signals.filter((signal) => signal.candleTime >= range.from && signal.candleTime < range.to)
      .sort((left, right) => left.candleTime - right.candleTime)
      .slice(0, request.limit)
      .map((signal) => ({
        candleTime: signal.candleTime,
        action: signal.action,
        score: signal.score,
      }));
    return Promise.resolve(rows);
  };

  return { readLatestEquityPoint, listDecisionRows, listPositionsAround, listDecisionMarkers };
}
