// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';
import {
  createRunsHarness,
  HOUR,
  MISSING_ID,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';
import {
  at,
  createLiveRun,
  positionRow,
  PERIOD_START,
} from './fixtures/live-status/live-status-scenario.fixture.js';
import {
  buildCloseSeries,
  layerSignal,
  seedConfiguredStrategy,
  windowRow,
} from './fixtures/projections/projection-scenario.fixture.js';
import classicStrategy from './fixtures/strategy-engine/classic-scoreboard.strategy.json';

const RUNS = '/v1/runs';
const PROJECTIONS = '/projections';
const CLOSES = [100, 101, 100, 100, 99, 98] as const;
const SCORES = ['2', '-1', '1.5', '1', '0', '-2'] as const;

type Item = {
  candleTime: number;
  closedAt: number;
  side: string;
  strength: string | null;
  score: string;
  base: string;
  bandLow: string | null;
  bandHigh: string | null;
  nextClose: string | null;
  moveRate: string | null;
  result: string;
  isInside: boolean | null;
};
type Current = Record<string, unknown> & { status: string };
type Summary = Record<string, unknown> & {
  counted: number;
  verdict: string;
  byStrength: { strength: string; counted: number; hits: number; hitRate: string | null }[];
};
type Projections = {
  version: string;
  timeframe: string;
  current: Current;
  summary: Summary;
  items: Item[];
  nextCursor: string | null;
};
type ErrorBody = { error: { code: string; details?: { field: string; reason: string }[] } };

function closeAt(index: number): string {
  return `${CLOSES[index] ?? 90}.00000000`;
}

let harness: RunsHarness;

beforeAll(async () => {
  harness = await createRunsHarness({
    candles: buildCloseSeries({ count: 60, closeAt }),
  });
});

// O relógio do harness é fixo: cada teste abre uma janela nova do limite por minuto.
beforeEach(() => {
  harness.clock.now += 120_000;
});

afterAll(async () => {
  await harness.stop();
});

function signalRows(scores: readonly string[], firstIndex = 0): ReturnType<typeof layerSignal>[] {
  return scores.map((score, offset) =>
    layerSignal(at(firstIndex + offset), firstIndex + offset, {
      score,
      indicators: { 'risk:atr': 1.5 },
    }),
  );
}

async function createRun(params: {
  readonly kind?: 'live_paper' | 'backtest' | 'walk_forward';
  readonly status?: 'running' | 'completed' | 'queued';
  readonly scores?: readonly string[];
  readonly lastIndex?: number | undefined;
}): Promise<string> {
  const runId = await createLiveRun(harness, {
    subject: SUBJECT_A,
    kind: params.kind ?? 'live_paper',
    status: params.status ?? 'running',
  });
  const scores = params.scores ?? SCORES;
  harness.runs.seed(runId, 'signals', signalRows(scores));
  if (params.lastIndex !== undefined || scores.length > 0) {
    harness.runs.updateRun(runId, { lastCandleTime: at(params.lastIndex ?? scores.length - 1) });
  }
  return runId;
}

async function projectionsOf(runId: string, query = '', subject = SUBJECT_A): Promise<Projections> {
  const { status, body } = await readJson(
    await harness.call({ subject, path: `${RUNS}/${runId}${PROJECTIONS}${query}` }),
  );
  expect(status).toBe(200);
  return (body as { data: Projections }).data;
}

describe('simulação ao vivo rodando: a tendência, o resumo e as previsões', () => {
  test('o resumo conta o acerto do lado, o "sempre sobe", a faixa e a força, com a frase em porcentagem', async () => {
    const data = await projectionsOf(await createRun({}));
    expect(data.version).toBe('projection-1');
    expect(data.timeframe).toBe('1h');
    expect(JSON.stringify(data.summary['wilson'])).toMatch(
      /^\{"lower":"0\.\d+","upper":"0\.\d+"\}$/,
    );
    expect(data.summary).toStrictEqual({
      counted: 3,
      hits: 2,
      misses: 1,
      ties: 1,
      noSide: 1,
      pending: 1,
      upMoves: 1,
      banded: 4,
      inside: 4,
      hitRate: '0.6666',
      upRate: '0.3333',
      insideRate: '1',
      byStrength: [
        { strength: 'weak', counted: 2, hits: 1, hitRate: '0.5' },
        { strength: 'strong', counted: 0, hits: 0, hitRate: null },
        { strength: 'decided', counted: 1, hits: 1, hitRate: '1' },
      ],
      wilson: data.summary.wilson,
      verdict: 'too_few',
      message:
        "Acertou o lado em 66,66% (2 de 3). Moeda ao ar: 50%. 'Sempre sobe': 33,33%. Dentro da faixa: 100,00%.",
      verdictMessage: 'Ainda há poucas previsões para dizer se acerta mais que o acaso.',
    });
  });

  test('as previsões da mais recente para a mais antiga, cada uma com o resultado na vela seguinte', async () => {
    const { items } = await projectionsOf(await createRun({}));
    expect(items.map((item) => [item.candleTime, item.result])).toStrictEqual([
      [at(5), 'pending'],
      [at(4), 'no_side'],
      [at(3), 'miss'],
      [at(2), 'tie'],
      [at(1), 'hit'],
      [at(0), 'hit'],
    ]);
    expect(items[0]).toStrictEqual({
      candleTime: at(5),
      closedAt: at(5) + HOUR,
      side: 'sell',
      strength: 'decided',
      score: '-2',
      base: '98',
      bandLow: '96.5',
      bandHigh: '99.5',
      nextClose: null,
      moveRate: null,
      result: 'pending',
      isInside: null,
    });
    expect(items[1]).toMatchObject({
      side: 'none',
      strength: null,
      nextClose: '98',
      moveRate: '-0.0102',
      isInside: null,
    });
    expect(items[2]).toMatchObject({
      side: 'buy',
      strength: 'weak',
      nextClose: '99',
      moveRate: '-0.01',
      isInside: true,
    });
  });

  test('a tendência da última vela: livre e vendendo = ficar de fora, com a faixa em volta do fechamento', async () => {
    const { current } = await projectionsOf(await createRun({}));
    expect(current).toStrictEqual({
      status: 'available',
      candleTime: at(5),
      closedAt: at(5) + HOUR,
      horizonEndsAt: at(5) + 2 * HOUR,
      side: 'sell',
      stance: 'stay_out',
      strength: 'decided',
      score: '-2',
      threshold: '-2',
      base: '98',
      bandLow: '96.5',
      bandHigh: '99.5',
      atr: '1.5',
      label: 'Tende a FICAR DE FORA · decidiu',
      message: 'Placar −2 de −2 para vender.',
    });
  });

  test('comprada e com o placar vendendo, a postura é vender', async () => {
    const runId = await createRun({});
    harness.runs.seed(runId, 'positions', [
      positionRow({ key: 'aberta', openedIndex: 2, closedIndex: undefined }),
    ]);
    const { current } = await projectionsOf(runId);
    expect(current).toMatchObject({ stance: 'sell', label: 'Tende a VENDER · decidiu' });
  });

  test('placar a favor da compra e livre: comprar, forte', async () => {
    const runId = await createRun({ scores: ['0', '1.5'] });
    const { current } = await projectionsOf(runId);
    expect(current).toMatchObject({
      stance: 'buy',
      strength: 'strong',
      label: 'Tende a COMPRAR · forte',
      message: 'Placar +1,5 de +2 para comprar.',
    });
  });

  test('cada motivo de "sem previsão" com a frase do servidor', async () => {
    const neutral = await projectionsOf(await createRun({ scores: ['1', '0'] }));
    expect(neutral.current).toStrictEqual({
      status: 'unavailable',
      reason: 'neutral',
      message: 'O placar está em 0: nenhuma regra puxa para um lado.',
    });
    const warming = await createRun({ scores: [], lastIndex: 3 });
    expect((await projectionsOf(warming)).current).toStrictEqual({
      status: 'unavailable',
      reason: 'warming_up',
      message: 'A estratégia ainda está juntando velas para calcular as regras.',
    });
    const none = await createRun({ scores: [] });
    expect((await projectionsOf(none)).current).toStrictEqual({
      status: 'unavailable',
      reason: 'no_candle',
      message: 'Aguardando a primeira vela fechar.',
    });
    const stopped = await createRun({ status: 'completed' });
    expect((await projectionsOf(stopped)).current).toStrictEqual({
      status: 'unavailable',
      reason: 'not_running',
      message: 'A simulação não está rodando: não há próxima decisão.',
    });
  });

  test('simulação parada ou esperando dado não mostra a tendência da última vela, e o motivo é aditivo', async () => {
    const stalled = await createRun({});
    harness.runs.updateRun(stalled, { stalledSince: at(7) });
    const stalledView = await projectionsOf(stalled);
    expect(stalledView.current).toStrictEqual({
      status: 'unavailable',
      reason: 'stalled',
      message:
        'A simulação está parada: a última previsão ficou velha e a próxima só volta quando ela voltar.',
    });
    expect(stalledView.summary.counted).toBeGreaterThan(0);
    expect(stalledView.items.length).toBeGreaterThan(0);
    const waiting = await createRun({});
    harness.runs.updateRun(waiting, { waitingSince: at(7), waitingOpenTime: at(6) });
    expect((await projectionsOf(waiting)).current).toStrictEqual({
      status: 'unavailable',
      reason: 'waiting_for_data',
      message:
        'A simulação espera os dados do mercado: a previsão volta quando as velas que faltam chegarem.',
    });
    const bothStalledAndStopped = await createRun({ status: 'completed' });
    harness.runs.updateRun(bothStalledAndStopped, { stalledSince: at(7) });
    expect((await projectionsOf(bothStalledAndStopped)).current).toMatchObject({
      reason: 'not_running',
    });
  });

  test('a leitura das posições que falha degrada só a tendência: o resumo e as previsões seguem', async () => {
    const runId = await createRun({});
    const original = harness.runs.liveStatus.listPositionsAround;
    Object.assign(harness.runs.liveStatus, {
      listPositionsAround: () => Promise.reject(new Error('banco indisponível')),
    });
    try {
      const view = await projectionsOf(runId);
      expect(view.current).toStrictEqual({
        status: 'unavailable',
        reason: 'read_failed',
        message: 'Não foi possível ler a posição agora: a tendência volta no próximo pedido.',
      });
      expect(view.summary.counted).toBeGreaterThan(0);
      expect(view.items.length).toBeGreaterThan(0);
      expect(harness.reportedErrors).toHaveLength(0);
    } finally {
      Object.assign(harness.runs.liveStatus, { listPositionsAround: original });
    }
  });

  test('a precedência: parada vence placar neutro', async () => {
    const runId = await createRun({ scores: ['1', '0'], status: 'completed' });
    expect((await projectionsOf(runId)).current).toMatchObject({ reason: 'not_running' });
  });
});

describe('backtest e walk-forward', () => {
  test('o backtest não tem tendência atual, mas traz o resumo e as previsões (a vela seguinte da última já fechou)', async () => {
    const runId = await createRun({ kind: 'backtest', status: 'completed' });
    const data = await projectionsOf(runId);
    expect(data.current).toStrictEqual({
      status: 'unavailable',
      reason: 'not_running',
      message:
        'Este é um teste no histórico: não há próxima decisão. O histórico de acertos está abaixo.',
    });
    expect(data.summary.counted).toBe(4);
    expect(data.items).toHaveLength(6);
  });

  test('um backtest AINDA rodando também não tem tendência atual (só a ao vivo tem)', async () => {
    const runId = await createRun({ kind: 'backtest', status: 'running' });
    expect((await projectionsOf(runId)).current).toMatchObject({ reason: 'not_running' });
  });

  test('o walk-forward conta só as janelas de teste que terminaram bem, cada uma com o limiar dela', async () => {
    const versionId = await seedConfiguredStrategy(harness, {
      subject: SUBJECT_A,
      config: classicStrategy,
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
        testStart: at(0),
        testEnd: at(3),
        assignment: [{ path: 'thresholds.buy', value: '1' }],
      }),
      windowRow({ index: 1, testStart: at(3), testEnd: at(6), assignment: undefined }),
    ]);
    harness.runs.seed(runId, 'signals', signalRows(SCORES));
    const data = await projectionsOf(runId);
    expect(data.items.map((item) => item.candleTime)).toStrictEqual([at(2), at(1), at(0)]);
    expect(data.items.at(0)).toMatchObject({ score: '1.5', strength: 'decided' });
    expect(data.summary).toMatchObject({ hits: 2, misses: 0, ties: 1, noSide: 0, pending: 0 });
    expect(data.current).toMatchObject({ reason: 'not_running' });
  });
});

describe('vela seguinte ausente e paginação', () => {
  test('vela dentro da faixa mas ausente em candles é lacuna; a pendente é a que está fora da faixa', async () => {
    const gapped = await createRunsHarness({
      candles: buildCloseSeries({ count: 60, closeAt }).filter((_c, index) => index !== 3),
    });
    try {
      const runId = await createLiveRun(gapped, { subject: SUBJECT_A });
      gapped.runs.seed(runId, 'signals', [
        layerSignal(at(1), 1, { score: '1', indicators: { 'risk:atr': 1.5 } }),
        layerSignal(at(2), 2, { score: '1', indicators: { 'risk:atr': 1.5 } }),
        layerSignal(at(4), 4, { score: '1', indicators: { 'risk:atr': 1.5 } }),
      ]);
      gapped.runs.updateRun(runId, { lastCandleTime: at(4) });
      const { body } = await readJson(
        await gapped.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}${PROJECTIONS}` }),
      );
      const items = (body as { data: Projections }).data.items;
      expect(items.map((item) => item.result)).toStrictEqual(['pending', 'gap', 'miss']);
    } finally {
      await gapped.stop();
    }
  });

  test('páginas por cursor concatenam a lista inteira, sem repetir; o resumo e a tendência vêm só na primeira', async () => {
    const runId = await createRun({});
    const first = await projectionsOf(runId, '?limit=4');
    expect(first.items).toHaveLength(4);
    expect(first.nextCursor).not.toBeNull();
    const second = await projectionsOf(runId, `?limit=4&cursor=${first.nextCursor}`);
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].map((item) => item.candleTime)).toStrictEqual(
      [5, 4, 3, 2, 1, 0].map((index) => at(index)),
    );
    expect(first.summary).toBeDefined();
    expect(first.current).toBeDefined();
    expect(second.summary).toBeUndefined();
    expect(second.current).toBeUndefined();
  });

  test('a primeira página tem 24 previsões por padrão', async () => {
    const scores = Array.from({ length: 30 }, () => '1');
    const runId = await createRun({ scores });
    const page = await projectionsOf(runId);
    expect(page.items).toHaveLength(24);
    expect(page.nextCursor).not.toBeNull();
  });

  test('a primeira página faz 5 consultas por chave; a página por cursor não refaz o resumo nem a tendência', async () => {
    const runId = await createRun({});
    harness.queries.length = 0;
    await projectionsOf(runId);
    expect(harness.queries).toStrictEqual([
      'findRun',
      'findVersion',
      'summarizeProjections',
      'listProjectionItems',
      'listPositionsAround',
    ]);
    const { nextCursor } = await projectionsOf(runId, '?limit=2');
    harness.queries.length = 0;
    await projectionsOf(runId, `?limit=2&cursor=${nextCursor}`);
    expect(harness.queries).toStrictEqual(['findRun', 'findVersion', 'listProjectionItems']);
  });
});

describe('acesso e validação', () => {
  test('exige token', async () => {
    const runId = await createRun({});
    expect((await harness.call({ path: `${RUNS}/${runId}${PROJECTIONS}` })).status).toBe(401);
  });

  test('execução de outro usuário, inexistente, malformada e apagada dão o mesmo 404', async () => {
    const runId = await createRun({});
    const missing = await harness.call({
      subject: SUBJECT_B,
      path: `${RUNS}/${MISSING_ID}${PROJECTIONS}`,
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${runId}${PROJECTIONS}`,
      }),
      missingResourceResponse: missing,
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/xyz${PROJECTIONS}`,
      }),
      missingResourceResponse: missing,
    });
    const deleted = await createLiveRun(harness, { subject: SUBJECT_B, status: 'cancelled' });
    await harness.call({ subject: SUBJECT_B, method: 'DELETE', path: `${RUNS}/${deleted}` });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${deleted}${PROJECTIONS}`,
      }),
      missingResourceResponse: missing,
    });
  });

  test.each([['limit=0'], ['limit=101'], ['limit=abc'], ['cursor=%%%'], ['order=asc'], ['from=1']])(
    'com ?%s é 400',
    async (query) => {
      const runId = await createRun({});
      const response = await harness.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}${PROJECTIONS}?${query}`,
      });
      expect(response.status).toBe(400);
    },
  );

  test('cursor com formato certo mas de outro tipo é 400', async () => {
    const runId = await createRun({});
    const bad = btoa(JSON.stringify({ c: 1, k: 'x' })).replaceAll('=', '');
    const response = await harness.call({
      subject: SUBJECT_A,
      path: `${RUNS}/${runId}${PROJECTIONS}?cursor=${bad}`,
    });
    expect(response.status).toBe(400);
  });

  test('todos os erros de uma vez e nenhum eco de valor', async () => {
    const runId = await createRun({});
    const response = await harness.call({
      subject: SUBJECT_A,
      path: `${RUNS}/${runId}${PROJECTIONS}?limit=zzsecreto&cursor=!!qqsecreto&userId=x`,
    });
    const text = await response.text();
    expect(response.status).toBe(400);
    const fields = new Set((JSON.parse(text) as ErrorBody).error.details?.map((d) => d.field));
    expect(fields.has('limit')).toBe(true);
    expect(text).not.toContain('zzsecreto');
    expect(text).not.toContain('qqsecreto');
  });

  test('a resposta passa pelo esquema Zod documentado', async () => {
    const runId = await createRun({});
    const route = harness.routes.find(
      (candidate) => candidate.path === '/v1/runs/:runId/projections',
    );
    const data = await projectionsOf(runId);
    expect(route?.documentation?.successes[0]?.schema?.safeParse(data).success).toBe(true);
    const neutral = await projectionsOf(await createRun({ scores: ['0'] }));
    expect(route?.documentation?.successes[0]?.schema?.safeParse(neutral).success).toBe(true);
  });
});

describe('limite de requisições', () => {
  test('o balde de 60 por minuto é o do acompanhamento; o 61º é 429', async () => {
    const limited = await createRunsHarness({ candles: buildCloseSeries({ count: 60, closeAt }) });
    try {
      const policy = limited.app.policies.RATE_LIMIT_POLICY.RUN_LIVE_STATUS;
      expect(policy.limit).toBe(60);
      const runId = await createLiveRun(limited, { subject: SUBJECT_A });
      for (let attempt = 0; attempt < policy.limit; attempt += 1) {
        const response = await limited.call({
          subject: SUBJECT_A,
          path: `${RUNS}/${runId}${PROJECTIONS}`,
        });
        expect(response.status).toBe(200);
        await response.text();
      }
      const blocked = await limited.call({
        subject: SUBJECT_A,
        path: `${RUNS}/${runId}${PROJECTIONS}`,
      });
      expect(blocked.status).toBe(429);
      await blocked.text();
    } finally {
      await limited.stop();
    }
  });

  test('a faixa da execução começa no início dela (a primeira decisão é a vela anterior)', () => {
    expect(at(0)).toBe(PERIOD_START - HOUR);
  });
});
