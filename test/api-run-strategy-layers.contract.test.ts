// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';
import {
  createRunsHarness,
  HOUR,
  MISSING_ID,
  NOW,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';
import {
  at,
  CLASSIC_CANDLES,
  createLiveRun,
  PERIOD_START,
} from './fixtures/live-status/live-status-scenario.fixture.js';
import {
  layerSignal,
  NO_PRICE_RULE_CONFIG,
  PRICE_RULES_CONFIG,
  seedConfiguredStrategy,
  windowRow,
} from './fixtures/projections/projection-scenario.fixture.js';

const RUNS = '/v1/runs';
const LAYERS = '/strategy-layers';
const DECISIONS = 30;

type Line = { key: string; ruleId: string; role: string; label: string; values: (string | null)[] };
type Layers = {
  version: string;
  timeframe: string;
  from: number;
  to: number;
  candleTimes: number[];
  score: string[];
  actions: string[];
  atr: (string | null)[];
  lines: Line[];
  thresholds: { from: number; to: number; buy: string; sell: string }[];
};
type ErrorBody = { error: { code: string; details?: { field: string; reason: string }[] } };

let harness: RunsHarness;

beforeAll(async () => {
  harness = await createRunsHarness({ candles: CLASSIC_CANDLES });
});

// O relógio do harness é fixo: cada teste abre uma janela nova do limite por minuto.
beforeEach(() => {
  harness.clock.now += 120_000;
});

afterAll(async () => {
  await harness.stop();
});

async function layersOf(runId: string, query = '', subject = SUBJECT_A): Promise<Layers> {
  const { status, body } = await readJson(
    await harness.call({ subject, path: `${RUNS}/${runId}${LAYERS}${query}` }),
  );
  expect(status).toBe(200);
  return (body as { data: Layers }).data;
}

async function createPriceRun(subject = SUBJECT_A): Promise<string> {
  const versionId = await seedConfiguredStrategy(harness, {
    subject,
    config: PRICE_RULES_CONFIG,
    nonce: crypto.randomUUID(),
  });
  const runId = await createLiveRun(harness, { subject, versionId });
  const rows = Array.from({ length: DECISIONS }, (_unused, index) => layerSignal(at(index), index));
  harness.runs.seed(runId, 'signals', rows);
  harness.runs.updateRun(runId, { lastCandleTime: at(DECISIONS - 1) });
  return runId;
}

describe('camadas da estratégia: o formato em colunas', () => {
  test('uma coluna por vela decidida na faixa da execução e as 7 linhas de preço na ordem das regras', async () => {
    const layers = await layersOf(await createPriceRun());
    const indexes = Array.from({ length: DECISIONS - 1 }, (_unused, offset) => offset + 1);
    expect(layers.version).toBe('layers-1');
    expect(layers.timeframe).toBe('1h');
    expect(layers.from).toBe(PERIOD_START);
    expect(layers.to).toBe(at(DECISIONS - 1) + HOUR);
    expect(layers.candleTimes).toStrictEqual(indexes.map((index) => at(index)));
    expect(layers.score).toStrictEqual(indexes.map((index) => String((index % 5) - 2)));
    expect(layers.actions).toStrictEqual(
      indexes.map((index) =>
        (index % 5) - 2 >= 2 ? 'BUY' : (index % 5) - 2 <= -2 ? 'SELL' : 'HOLD',
      ),
    );
    expect(layers.atr).toStrictEqual(indexes.map((index) => (index % 7 === 0 ? null : '120.5')));
    expect(layers.lines.map((line) => [line.key, line.role])).toStrictEqual([
      ['rule:donchian-20.upper', 'channel_upper'],
      ['rule:donchian-20.lower', 'channel_lower'],
      ['rule:ema-9-21.fast', 'ema_fast'],
      ['rule:ema-9-21.slow', 'ema_slow'],
      ['rule:bollinger-20.upper', 'band_upper'],
      ['rule:bollinger-20.middle', 'band_middle'],
      ['rule:bollinger-20.lower', 'band_lower'],
    ]);
    for (const line of layers.lines) expect(line.values).toHaveLength(indexes.length);
  });

  test('rótulos do servidor com o período, a vírgula decimal e sem a regra que não desenha linha', async () => {
    const layers = await layersOf(await createPriceRun());
    expect(layers.lines.map((line) => [line.ruleId, line.label])).toStrictEqual([
      ['donchian-20', 'Canal Donchian (20 velas): topo'],
      ['donchian-20', 'Canal Donchian (20 velas): fundo'],
      ['ema-9-21', 'Média rápida (EMA 9)'],
      ['ema-9-21', 'Média lenta (EMA 21)'],
      ['bollinger-20', 'Bollinger (20 velas, 2,5 desvios): banda de cima'],
      ['bollinger-20', 'Bollinger (20 velas, 2,5 desvios): média'],
      ['bollinger-20', 'Bollinger (20 velas, 2,5 desvios): banda de baixo'],
    ]);
  });

  test('os valores são o texto decimal do que o motor gravou; chave ausente ou nula é null', async () => {
    const versionId = await seedConfiguredStrategy(harness, {
      subject: SUBJECT_A,
      config: PRICE_RULES_CONFIG,
      nonce: crypto.randomUUID(),
    });
    const runId = await createLiveRun(harness, { subject: SUBJECT_A, versionId });
    const missingKey = layerSignal(at(2), 2);
    harness.runs.seed(runId, 'signals', [
      layerSignal(at(1), 1, { indicators: { 'rule:ema-9-21.fast': 0.0000001 } }),
      { ...missingKey, indicators: { 'risk:atr': 2 } },
      layerSignal(at(3), 3, { indicators: { 'rule:donchian-20.upper': null } }),
    ]);
    harness.runs.updateRun(runId, { lastCandleTime: at(3) });
    const layers = await layersOf(runId);
    const valuesOf = (key: string): (string | null)[] =>
      layers.lines.find((line) => line.key === key)?.values ?? [];
    expect(valuesOf('rule:ema-9-21.fast')[0]).toBe('0.0000001');
    expect(valuesOf('rule:donchian-20.upper')).toStrictEqual(['31001', null, null]);
    expect(valuesOf('rule:bollinger-20.middle')).toStrictEqual(['30000.125', null, '30000.125']);
    expect(layers.atr).toStrictEqual(['120.5', '2', '120.5']);
  });

  test('os limiares do trecho único, recortados à faixa pedida', async () => {
    const runId = await createPriceRun();
    const all = await layersOf(runId);
    expect(all.thresholds).toStrictEqual([
      { from: PERIOD_START, to: at(DECISIONS - 1) + HOUR, buy: '2', sell: '-2' },
    ]);
    const part = await layersOf(runId, `?from=${at(5)}&to=${at(10)}`);
    expect(part.from).toBe(at(5));
    expect(part.to).toBe(at(10));
    expect(part.candleTimes).toStrictEqual([5, 6, 7, 8, 9].map((index) => at(index)));
    expect(part.thresholds).toStrictEqual([{ from: at(5), to: at(10), buy: '2', sell: '-2' }]);
  });

  test('estratégia sem regra de preço devolve lines vazio e mantém o placar', async () => {
    const versionId = await seedConfiguredStrategy(harness, {
      subject: SUBJECT_A,
      config: NO_PRICE_RULE_CONFIG,
      nonce: crypto.randomUUID(),
    });
    const runId = await createLiveRun(harness, { subject: SUBJECT_A, versionId });
    harness.runs.seed(runId, 'signals', [layerSignal(at(1), 1), layerSignal(at(2), 2)]);
    harness.runs.updateRun(runId, { lastCandleTime: at(2) });
    const layers = await layersOf(runId);
    expect(layers.lines).toStrictEqual([]);
    expect(layers.candleTimes).toStrictEqual([at(1), at(2)]);
    expect(layers.score).toStrictEqual(['-1', '0']);
  });

  test('execução ainda sem vela processada: listas vazias, não erro', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A, status: 'queued' });
    const layers = await layersOf(runId);
    expect(layers).toMatchObject({
      candleTimes: [],
      score: [],
      actions: [],
      atr: [],
      lines: [],
      thresholds: [],
    });
  });
});

describe('camadas: o teto de 1.000 velas e a faixa', () => {
  async function createLongBacktest(): Promise<string> {
    const runId = await createLiveRun(harness, {
      subject: SUBJECT_A,
      kind: 'backtest',
      status: 'completed',
    });
    harness.runs.updateRun(runId, { periodStart: NOW - 1_500 * HOUR, periodEnd: NOW });
    return runId;
  }

  test('1.000 velas passam; 1.001 é 400 to: range_too_large sem consultar o banco', async () => {
    const runId = await createLongBacktest();
    const allowed = await layersOf(runId, `?from=${NOW - 1_000 * HOUR}&to=${NOW}`);
    expect(allowed.to - allowed.from).toBe(1_000 * HOUR);
    harness.queries.length = 0;
    const response = await harness.call({
      subject: SUBJECT_A,
      path: `${RUNS}/${runId}${LAYERS}?from=${NOW - 1_001 * HOUR}&to=${NOW}`,
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorBody).error.details).toStrictEqual([
      { field: 'to', reason: 'range_too_large' },
    ]);
    expect(harness.queries).not.toContain('listLayerRows');
  });

  test('sem parâmetros: as últimas 1.000 velas da execução; só from: até o fim dela', async () => {
    const runId = await createLongBacktest();
    const latest = await layersOf(runId);
    expect(latest.to).toBe(NOW);
    expect(latest.from).toBe(NOW - 1_000 * HOUR);
    const fromOnly = await layersOf(runId, `?from=${NOW - 10 * HOUR}`);
    expect(fromOnly.from).toBe(NOW - 10 * HOUR);
    expect(fromOnly.to).toBe(NOW);
    const tooLong = await harness.call({
      subject: SUBJECT_A,
      path: `${RUNS}/${runId}${LAYERS}?from=${NOW - 1_400 * HOUR}`,
    });
    expect(tooLong.status).toBe(400);
  });

  test('a faixa pedida é recortada à da execução; fora dela é 400 from: outside_run', async () => {
    const runId = await createLongBacktest();
    const clipped = await layersOf(runId, `?from=${NOW - 5 * HOUR}&to=${NOW + 99 * HOUR}`);
    expect(clipped.from).toBe(NOW - 5 * HOUR);
    expect(clipped.to).toBe(NOW);
    const outside = await harness.call({
      subject: SUBJECT_A,
      path: `${RUNS}/${runId}${LAYERS}?from=${NOW + HOUR}&to=${NOW + 5 * HOUR}`,
    });
    expect(outside.status).toBe(400);
    expect(((await outside.json()) as ErrorBody).error.details).toStrictEqual([
      { field: 'from', reason: 'outside_run' },
    ]);
  });
});

describe('camadas no walk-forward: um limiar por janela de teste', () => {
  async function createWalkForward(): Promise<string> {
    const versionId = await seedConfiguredStrategy(harness, {
      subject: SUBJECT_A,
      config: PRICE_RULES_CONFIG,
      nonce: crypto.randomUUID(),
    });
    const runId = await createLiveRun(harness, {
      subject: SUBJECT_A,
      kind: 'walk_forward',
      status: 'completed',
      versionId,
    });
    harness.runs.seed(runId, 'windows', [
      windowRow({
        index: 0,
        testStart: at(5),
        testEnd: at(15),
        assignment: [
          { path: 'thresholds.buy', value: '1.5' },
          { path: 'rules.donchian-20.period', value: 10 },
        ],
      }),
      windowRow({
        index: 1,
        testStart: at(15),
        testEnd: at(25),
        assignment: [
          { path: 'thresholds.buy', value: '2' },
          { path: 'rules.donchian-20.period', value: 30 },
        ],
      }),
      windowRow({ index: 2, testStart: at(25), testEnd: at(35), assignment: undefined }),
    ]);
    harness.runs.seed(
      runId,
      'signals',
      Array.from({ length: 30 }, (_unused, offset) => layerSignal(at(5 + offset), offset)),
    );
    return runId;
  }

  test('um trecho por janela que terminou bem; a parada fica sem limiar, mas as barras aparecem', async () => {
    const layers = await layersOf(await createWalkForward());
    expect(layers.from).toBe(at(5));
    expect(layers.to).toBe(at(35));
    expect(layers.candleTimes).toHaveLength(30);
    expect(layers.thresholds).toStrictEqual([
      { from: at(5), to: at(15), buy: '1.5', sell: '-2' },
      { from: at(15), to: at(25), buy: '2', sell: '-2' },
    ]);
  });

  test('o período que muda entre janelas tira os números do rótulo; o que não muda os mantém', async () => {
    const layers = await layersOf(await createWalkForward());
    const labels = layers.lines.map((line) => line.label);
    expect(labels).toContain('Canal Donchian: topo');
    expect(labels).toContain('Canal Donchian: fundo');
    expect(labels).toContain('Média rápida (EMA 9)');
    expect(labels).toContain('Bollinger (20 velas, 2,5 desvios): média');
  });

  test('só as janelas lidas pelo walk-forward: 4 consultas no máximo', async () => {
    const runId = await createWalkForward();
    harness.queries.length = 0;
    await layersOf(runId);
    expect(harness.queries).toHaveLength(4);
    expect(new Set(harness.queries)).toStrictEqual(
      new Set(['findRun', 'findVersion', 'listWindows', 'listLayerRows']),
    );
  });
});

describe('acesso e validação', () => {
  test('exige token', async () => {
    const runId = await createPriceRun();
    expect((await harness.call({ path: `${RUNS}/${runId}${LAYERS}` })).status).toBe(401);
  });

  test('execução de outro usuário, inexistente, malformada e apagada dão o mesmo 404', async () => {
    const runId = await createPriceRun();
    const missing = await harness.call({
      subject: SUBJECT_B,
      path: `${RUNS}/${MISSING_ID}${LAYERS}`,
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${runId}${LAYERS}`,
      }),
      missingResourceResponse: missing,
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/xyz${LAYERS}`,
      }),
      missingResourceResponse: missing,
    });
    const deleted = await createLiveRun(harness, { subject: SUBJECT_B, status: 'cancelled' });
    await harness.call({ subject: SUBJECT_B, method: 'DELETE', path: `${RUNS}/${deleted}` });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${deleted}${LAYERS}`,
      }),
      missingResourceResponse: missing,
    });
  });

  test('backtest e walk-forward do dono respondem (sem 409)', async () => {
    for (const kind of ['backtest', 'walk_forward'] as const) {
      const runId = await createLiveRun(harness, { subject: SUBJECT_A, kind, status: 'completed' });
      const response = await harness.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}${LAYERS}`,
      });
      expect(response.status).toBe(200);
      await response.text();
    }
  });

  test('todos os erros de uma vez, nenhum eco de valor e parâmetro desconhecido recusado', async () => {
    const runId = await createPriceRun();
    const response = await harness.call({
      subject: SUBJECT_A,
      path: `${RUNS}/${runId}${LAYERS}?from=zzsecreto&to=qqsecreto&userId=x`,
    });
    const text = await response.text();
    expect(response.status).toBe(400);
    const fields = new Set((JSON.parse(text) as ErrorBody).error.details?.map((d) => d.field));
    expect(fields.has('from')).toBe(true);
    expect(fields.has('to')).toBe(true);
    expect(text).not.toContain('zzsecreto');
    expect(text).not.toContain('qqsecreto');
  });

  test.each([
    ['from=-5'],
    ['to=1.5'],
    ['limit=10'],
    ['columns=200'],
    [`from=${at(9)}&to=${at(9)}`],
  ])('com ?%s é 400', async (query) => {
    const runId = await createPriceRun();
    const response = await harness.call({
      subject: SUBJECT_A,
      path: `${RUNS}/${runId}${LAYERS}?${query}`,
    });
    expect(response.status).toBe(400);
  });

  test('to ≤ from é 400 to: must_be_after_from', async () => {
    const runId = await createPriceRun();
    const response = await harness.call({
      subject: SUBJECT_A,
      path: `${RUNS}/${runId}${LAYERS}?from=${at(9)}&to=${at(8)}`,
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorBody).error.details).toStrictEqual([
      { field: 'to', reason: 'must_be_after_from' },
    ]);
  });
});

describe('consultas e limite de requisições', () => {
  test('execução em andamento: no máximo 3 consultas, todas por chave', async () => {
    const runId = await createPriceRun();
    harness.queries.length = 0;
    await layersOf(runId);
    expect(harness.queries).toStrictEqual(['findRun', 'findVersion', 'listLayerRows']);
  });

  test('a resposta passa pelo esquema Zod documentado', async () => {
    const runId = await createPriceRun();
    const route = harness.routes.find(
      (candidate) => candidate.path === '/v1/runs/:runId/strategy-layers',
    );
    const { body } = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}${LAYERS}` }),
    );
    const parsed = route?.documentation?.successes[0]?.schema?.safeParse(
      (body as { data: unknown }).data,
    );
    expect(parsed?.success).toBe(true);
  });

  test('30 por minuto por usuário (a política do gráfico); o 31º é 429', async () => {
    const limited = await createRunsHarness({ candles: CLASSIC_CANDLES });
    try {
      const policy = limited.app.policies.RATE_LIMIT_POLICY.RUN_CHART;
      expect(policy.limit).toBe(30);
      const runId = await createLiveRun(limited, { subject: SUBJECT_A });
      for (let attempt = 0; attempt < policy.limit; attempt += 1) {
        const response = await limited.call({
          subject: SUBJECT_A,
          path: `${RUNS}/${runId}${LAYERS}`,
        });
        expect(response.status).toBe(200);
        await response.text();
      }
      const blocked = await limited.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}${LAYERS}` });
      expect(blocked.status).toBe(429);
      await blocked.text();
    } finally {
      await limited.stop();
    }
  });
});
