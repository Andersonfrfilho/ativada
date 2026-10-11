// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { FearGreedEntry } from '../packages/database/src/index.js';
import {
  createRunsHarness,
  readJson,
  SUBJECT_A,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';

const SENTIMENT_PATH = '/v1/market/sentiment';

let latest: FearGreedEntry | undefined;
let lookups = 0;
let harness: RunsHarness;

beforeAll(async () => {
  harness = await createRunsHarness({
    extraRoutes: (app) =>
      app.sentimentRoutes.createSentimentRoutes({
        getSentiment: app.sentimentUseCase.createGetSentimentUseCase({
          sentiments: {
            findLatest: () => {
              lookups += 1;
              return Promise.resolve(latest);
            },
          },
        }),
      }),
  });
});

afterAll(async () => {
  await harness.stop();
});

describe('GET /v1/market/sentiment', () => {
  test('exige token', async () => {
    expect((await harness.call({ path: SENTIMENT_PATH })).status).toBe(401);
    expect(lookups).toBe(0);
  });

  test('devolve o valor, a classificação, a data e o crédito da fonte', async () => {
    latest = { date: '2026-10-11', fearGreed: 27, classification: 'Fear' };
    const { status, body } = await readJson(
      await harness.call({ subject: SUBJECT_A, path: SENTIMENT_PATH }),
    );
    expect(status).toBe(200);
    expect(body).toStrictEqual({
      data: {
        fearGreed: 27,
        classification: 'Fear',
        date: '2026-10-11',
        source: {
          name: 'alternative.me',
          creditText: 'Fear & Greed Index por alternative.me',
          url: 'https://alternative.me/crypto/fear-and-greed-index/',
        },
      },
    });
  });

  test('sem classificação gravada, ela vem nula (nunca inventada)', async () => {
    latest = { date: '2026-10-10', fearGreed: 80, classification: undefined };
    const { body } = await readJson(
      await harness.call({ subject: SUBJECT_A, path: SENTIMENT_PATH }),
    );
    expect((body as { data: { classification: unknown } }).data.classification).toBeNull();
  });

  test('a resposta bate com o esquema documentado', async () => {
    latest = { date: '2026-10-11', fearGreed: 0, classification: 'Extreme Fear' };
    const route = harness.routes.find((candidate) => candidate.path === SENTIMENT_PATH);
    const { body } = await readJson(
      await harness.call({ subject: SUBJECT_A, path: SENTIMENT_PATH }),
    );
    const schema = route?.documentation?.successes[0]?.schema;
    expect(schema?.safeParse((body as { data: unknown }).data).success).toBe(true);
  });

  test('sem nenhum valor gravado: 404 SENTIMENT_UNAVAILABLE, nunca um zero inventado', async () => {
    latest = undefined;
    const { status, body } = await readJson(
      await harness.call({ subject: SUBJECT_A, path: SENTIMENT_PATH }),
    );
    expect(status).toBe(404);
    expect((body as { error: { code: string } }).error.code).toBe('SENTIMENT_UNAVAILABLE');
  });

  test('só aceita GET, e a rota está documentada', async () => {
    const response = await harness.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: SENTIMENT_PATH,
    });
    expect(response.status).toBe(405);
    const route = harness.routes.find((candidate) => candidate.path === SENTIMENT_PATH);
    expect(route?.documentation?.summary).toContain('alternative.me');
  });
});
