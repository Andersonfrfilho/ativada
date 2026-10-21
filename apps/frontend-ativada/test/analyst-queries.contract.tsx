// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { afterEach, describe, expect, test } from 'bun:test';

import { useQueryClient } from '@tanstack/react-query';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

import { useLiveStream } from '../src/live/useLiveStream.hook.js';
import { useAnalystDecisionsQuery, useAnalystQuery } from '../src/runs/analyst/analyst.query.js';
import { analystDecisionSchema, analystSchema } from '../src/runs/analyst/analyst.validation.js';
import {
  analystRoutes,
  buildAnalystResponse,
  buildDecided,
  buildFailed,
  buildUnavailable,
  createAnalystHarness,
  QUARTER_HOUR,
  type AnalystHarness,
} from './support/analyst-fixtures.js';
import { FIXTURE_CANDLE_TIME } from './support/live-status-fixtures.js';
import { LIVE_RUN_ID } from './support/live-tracking-harness.js';
import { renderApp, type RenderedApp } from './support/render-app.js';

afterEach(() => {
  cleanup();
});

function noop(): void {
  return;
}

function Probe(): ReactElement {
  useLiveStream(noop, noop);
  const analyst = useAnalystQuery(LIVE_RUN_ID);
  const isEnabled = analyst.data?.isEnabled === true;
  const decisions = useAnalystDecisionsQuery(LIVE_RUN_ID, isEnabled);
  const queryClient = useQueryClient();
  const keys = queryClient
    .getQueryCache()
    .getAll()
    .map((query) => JSON.stringify(query.queryKey))
    .sort()
    .join('|');
  const state =
    analyst.data === undefined
      ? analyst.isError
        ? 'error'
        : 'loading'
      : isEnabled
        ? 'enabled'
        : 'disabled';
  const items = decisions.data?.pages.flatMap((page) => page.items).length ?? 0;
  return (
    <div>
      <p data-testid="state">{state}</p>
      <p data-testid="keys">{keys}</p>
      <p data-testid="items">{items}</p>
      <button type="button" onClick={() => void decisions.fetchNextPage()}>
        mais
      </button>
    </div>
  );
}

function open(harness: AnalystHarness): RenderedApp {
  return renderApp({
    path: '/',
    isAuthenticated: true,
    routes: analystRoutes(harness),
    probe: <Probe />,
  });
}

describe('o espelho do contrato (Zod)', () => {
  test('aceita a resposta do servidor e recusa valor fora do contrato', () => {
    expect(analystSchema.safeParse(buildAnalystResponse()).success).toBe(true);
    const badPosture = buildAnalystResponse({ current: buildDecided({ posture: 'confiante' }) });
    expect(analystSchema.safeParse(badPosture).success).toBe(false);
    const badNumber = buildAnalystResponse({ current: { ...buildDecided(), riskScale: 'NaN' } });
    expect(analystSchema.safeParse(badNumber).success).toBe(false);
    const unknownReason = buildAnalystResponse({ current: buildUnavailable('sumiu', 'x') });
    expect(analystSchema.safeParse(unknownReason).success).toBe(false);
    const withoutMotive = { ...buildDecided(), specialists: [{ key: 'trend' }] };
    expect(analystSchema.safeParse(buildAnalystResponse({ current: withoutMotive })).success).toBe(
      false,
    );
  });

  test('o histórico aceita decisão e falha, e recusa status desconhecido', () => {
    expect(analystDecisionSchema.safeParse(buildDecided()).success).toBe(true);
    expect(analystDecisionSchema.safeParse(buildFailed(FIXTURE_CANDLE_TIME)).success).toBe(true);
    expect(analystDecisionSchema.safeParse({ status: 'pending' }).success).toBe(false);
  });
});

describe('consultas sob a raiz runs', () => {
  test('a chave do analista e a das decisões moram sob ["runs", runId]', async () => {
    open(createAnalystHarness());
    await waitFor(() => expect(screen.getByTestId('items').textContent).toBe('1'));
    const keys = screen.getByTestId('keys').textContent ?? '';
    expect(keys).toContain(JSON.stringify(['runs', LIVE_RUN_ID, 'analyst']));
    expect(keys).toContain(JSON.stringify(['runs', LIVE_RUN_ID, 'analyst-decisions']));
  });

  test('simulação sem analista (409 ANALYST_NOT_ENABLED) vira "desligado", sem erro e sem pedir as decisões', async () => {
    const app = open(createAnalystHarness({ analyst: 'disabled' }));
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('disabled'));
    expect(app.fake.callsTo('GET', `/v1/runs/${LIVE_RUN_ID}/analyst/decisions`)).toHaveLength(0);
  });

  test('falha do servidor é erro de verdade (o cartão mostra "Tentar de novo")', async () => {
    open(createAnalystHarness({ analyst: 'failing' }));
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('error'));
  });

  test('o aviso do stream refaz o analista e as decisões sem recarregar a tela', async () => {
    const harness = createAnalystHarness();
    const app = open(harness);
    await waitFor(() => expect(screen.getByTestId('items').textContent).toBe('1'));
    const analystPath = `/v1/runs/${LIVE_RUN_ID}/analyst`;
    expect(app.fake.callsTo('GET', analystPath)).toHaveLength(1);
    harness.decisionPages = [
      {
        items: [
          buildDecided({ candleTime: FIXTURE_CANDLE_TIME + QUARTER_HOUR }),
          buildDecided({ candleTime: FIXTURE_CANDLE_TIME }),
        ],
        nextCursor: null,
      },
    ];
    act(() =>
      app.stream.emit({ type: 'event', runId: LIVE_RUN_ID, kind: 'analyst', eventId: 'e1', at: 1 }),
    );
    await waitFor(() => expect(screen.getByTestId('items').textContent).toBe('2'), {
      timeout: 3000,
    });
    expect(app.fake.callsTo('GET', analystPath).length).toBeGreaterThan(1);
  });

  test('as decisões vêm por cursor: a seguinte é pedida com o cursor da página anterior', async () => {
    const harness = createAnalystHarness({
      decisionPages: [
        { items: [buildDecided()], nextCursor: 'page-1' },
        { items: [buildFailed(FIXTURE_CANDLE_TIME - QUARTER_HOUR)], nextCursor: null },
      ],
    });
    const app = open(harness);
    await waitFor(() => expect(screen.getByTestId('items').textContent).toBe('1'));
    fireEvent.click(screen.getByRole('button', { name: 'mais' }));
    await waitFor(() => expect(screen.getByTestId('items').textContent).toBe('2'));
    const calls = app.fake.callsTo('GET', `/v1/runs/${LIVE_RUN_ID}/analyst/decisions`);
    expect(calls.map((call) => call.query.get('cursor'))).toStrictEqual([null, 'page-1']);
    expect(calls.map((call) => call.query.get('limit'))).toStrictEqual(['24', '24']);
  });
});
