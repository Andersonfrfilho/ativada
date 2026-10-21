// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';

import {
  CANDLE_MILLISECONDS,
  computeSeriesAnchor,
  runSpecialistTeam,
  selectSentiments,
  type TeamSeries,
} from '../packages/risk-analyst/src/index.js';
import {
  ENGINE_INPUT_ERROR_CODE,
  EngineInputError,
  type EngineCandle,
} from '../packages/strategy-engine/src/index.js';
import {
  ANALYST_REAL_DATASET,
  ANALYST_REAL_SENTIMENT,
} from './fixtures/live/analyst-live.fixture.js';
import { loadAnalystLiveParts } from './fixtures/live/live-api.fixture.js';
import type {
  PairSeries,
  SeriesRequest,
} from '../apps/worker-ativada/src/live/analyst-series-cache.js';

// A série do par que o analista lê UMA vez por ronda (spec 007, A3): o avanço incremental em memória dá, em toda vela, o
// MESMO que o recálculo desde a âncora diária, e as simulações do mesmo par dividem a leitura.

// Os percursos longos (a série de 30 dias recalculada desde a âncora) passam dos 5 s padrão do `bun test`.
setDefaultTimeout(120_000);

const parts = await loadAnalystLiveParts();
const { market } = ANALYST_REAL_DATASET;
const allCandles = ANALYST_REAL_DATASET.candles;
const lastIndex = allCandles.length - 1;

type CandleWindow = { readonly from: number; readonly to: number; readonly limit: number };

type Source = {
  readonly findCandles: (window: CandleWindow) => Promise<readonly EngineCandle[]>;
  readonly reads: () => number;
};

function createSource(candles: readonly EngineCandle[] = allCandles): Source {
  let reads = 0;
  return {
    reads: () => reads,
    findCandles: (window): Promise<readonly EngineCandle[]> => {
      reads += 1;
      return Promise.resolve(
        candles
          .filter((candle) => candle.openTime >= window.from && candle.openTime < window.to)
          .slice(0, window.limit),
      );
    },
  };
}

function openTimeAt(index: number): number {
  const candle = allCandles[index];
  if (candle === undefined) throw new Error(`sem vela ${index}`);
  return candle.openTime;
}

function recompute(
  candleTime: number,
  candles: readonly EngineCandle[] = allCandles,
): { candles: EngineCandle[]; team: TeamSeries } {
  const anchor = computeSeriesAnchor(candleTime);
  const inside = candles.filter(
    (candle) => candle.openTime >= anchor && candle.openTime <= candleTime,
  );
  const sentiments = selectSentiments({
    candles: inside,
    observations: ANALYST_REAL_SENTIMENT,
    source: market.sentimentSource,
  });
  return { candles: inside, team: runSpecialistTeam({ market, candles: inside, sentiments }) };
}

function request(source: Source, index: number, hintIndex = index): SeriesRequest {
  return {
    market,
    candleTime: openTimeAt(index),
    source: {
      findCandles: source.findCandles,
      observations: ANALYST_REAL_SENTIMENT,
      lastOpenTime: openTimeAt(hintIndex),
    },
  };
}

// A primeira vela, de trás para frente a partir de `from`, cuja âncora diária é maior que a da vela anterior.
function findAnchorBoundary(from = lastIndex): number {
  for (let index = from; index > 0; index -= 1) {
    if (computeSeriesAnchor(openTimeAt(index)) !== computeSeriesAnchor(openTimeAt(index - 1))) {
      return index;
    }
  }
  throw new Error('o recorte não cruza uma âncora');
}

describe('série do par: avanço incremental × recálculo desde a âncora', () => {
  test('em toda vela de um trecho contíguo o resultado é igual ao recálculo', async () => {
    const cache = parts.createAnalystSeriesCache();
    const source = createSource();
    for (let index = 300; index < 340; index += 1) {
      const view = await cache.read(request(source, index));
      const expected = recompute(openTimeAt(index));
      expect(view.candles).toStrictEqual(expected.candles);
      expect(view.team).toStrictEqual(expected.team);
    }
  });

  test('atravessando a âncora diária a série recomeça e continua igual ao recálculo', async () => {
    const boundary = findAnchorBoundary();
    const cache = parts.createAnalystSeriesCache();
    const source = createSource();
    for (let index = boundary - 12; index < boundary + 12; index += 1) {
      const view = await cache.read(request(source, index));
      const expected = recompute(openTimeAt(index));
      expect(view.candles.length).toBe(expected.candles.length);
      expect(view.candles[0]?.openTime).toBe(computeSeriesAnchor(openTimeAt(index)));
      expect(view.team).toStrictEqual(expected.team);
    }
  });

  test('uma simulação que pula velas (ronda longa) lê a série de uma vez e continua igual', async () => {
    const cache = parts.createAnalystSeriesCache();
    const source = createSource();
    // Logo depois de uma âncora nova: as 96 velas do dia seguinte cabem todas na mesma série.
    const base = findAnchorBoundary(600);
    const first = await cache.read(request(source, base, base + 60));
    expect(first.team).toStrictEqual(recompute(openTimeAt(base)).team);
    expect(source.reads()).toBe(1);
    for (const index of [base + 1, base + 30, base + 60]) {
      const view = await cache.read(request(source, index, base + 60));
      expect(view.team).toStrictEqual(recompute(openTimeAt(index)).team);
    }
    expect(source.reads()).toBe(1);
  });

  test('cortar a série no meio dá a mesma vista: o que vem depois de t não entra', async () => {
    const short = await parts.createAnalystSeriesCache().read(request(createSource(), 700, 700));
    const long = await parts.createAnalystSeriesCache().read(request(createSource(), 700, 900));
    expect(long.candles).toStrictEqual(short.candles);
    expect(long.team).toStrictEqual(short.team);
    expect(long.candles.at(-1)?.openTime).toBe(openTimeAt(700));
  });

  test('uma lacuna do banco é declarada exata e o resultado continua igual ao recálculo', async () => {
    const withHole = allCandles.filter((_candle, index) => index !== 400 && index !== 401);
    const cache = parts.createAnalystSeriesCache();
    const view = await cache.read(request(createSource(withHole), 430));
    const expected = recompute(openTimeAt(430), withHole);
    expect(view.candles).toStrictEqual(expected.candles);
    expect(view.team).toStrictEqual(expected.team);
  });
});

describe('série do par: uma leitura por par por ronda', () => {
  test('cinco simulações do mesmo par na mesma ronda dividem UMA leitura; a ronda seguinte lê só a vela nova', async () => {
    const cache = parts.createAnalystSeriesCache();
    const source = createSource();
    const round = (index: number): Promise<PairSeries[]> =>
      Promise.all([1, 2, 3, 4, 5].map(() => cache.read(request(source, index))));
    const first = await round(600);
    expect(source.reads()).toBe(1);
    expect(first.every((view) => view.candles.length === first[0]?.candles.length)).toBe(true);
    await round(601);
    expect(source.reads()).toBe(2);
    await round(602);
    expect(source.reads()).toBe(3);
  });

  test('pares diferentes não dividem a série', async () => {
    const cache = parts.createAnalystSeriesCache();
    const source = createSource();
    await cache.read(request(source, 600));
    const ether = createSource(allCandles.map((candle) => ({ ...candle, symbol: 'ETHUSDT' })));
    await cache.read({ ...request(ether, 600), market: { ...market, symbol: 'ETHUSDT' } });
    expect(source.reads()).toBe(1);
    expect(ether.reads()).toBe(1);
  });
});

describe('série do par: falhas', () => {
  test('a leitura que falha vira a falha tipada SEM o texto do erro, e a cópia não fica corrompida', async () => {
    const cache = parts.createAnalystSeriesCache();
    const healthy = createSource();
    const failing: Source = {
      reads: healthy.reads,
      findCandles: () => Promise.reject(new Error('senha=segredo-no-erro')),
    };
    let caught: unknown;
    try {
      await cache.read(request(failing, 500));
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(parts.AnalystFailure);
    expect(parts.describeAnalystFailure(caught)).toBe('ANALYST_SERIES_UNAVAILABLE');
    expect(JSON.stringify(caught)).not.toContain('segredo');
    const view = await cache.read(request(healthy, 500));
    expect(view.team).toStrictEqual(recompute(openTimeAt(500)).team);
  });

  test('a vela t que o par não tem é série indisponível, nunca a vela vizinha', async () => {
    const missing = allCandles.filter((_candle, index) => index !== 500);
    const cache = parts.createAnalystSeriesCache();
    let code: string | undefined;
    try {
      await cache.read(request(createSource(missing), 500));
    } catch (error: unknown) {
      code = parts.describeAnalystFailure(error);
    }
    expect(code).toBe('ANALYST_SERIES_UNAVAILABLE');
  });

  test('o código estável da falha: do analista, do motor com o código dele e qualquer outra, sem texto', () => {
    const own = new parts.AnalystFailure('ANALYST_SERIES_UNAVAILABLE');
    expect(parts.describeAnalystFailure(own)).toBe('ANALYST_SERIES_UNAVAILABLE');
    const refused = new EngineInputError({
      code: ENGINE_INPUT_ERROR_CODE.CANDLE_ALREADY_PROCESSED,
      message: 'texto que não deve passar',
    });
    expect(parts.describeAnalystFailure(refused)).toBe(
      'ANALYST_ENGINE_REFUSED:CANDLE_ALREADY_PROCESSED',
    );
    const other = parts.describeAnalystFailure(new Error('postgres://usuario:senha@host/banco'));
    expect(other).toBe('ANALYST_INPUT_INVALID');
    expect(CANDLE_MILLISECONDS).toBe(900_000);
  });
});
