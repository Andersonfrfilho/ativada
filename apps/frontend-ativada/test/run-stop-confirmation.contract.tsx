// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

import { RunProgressCard } from '../src/runs/RunProgressCard.component.js';
import { runDetailSchema } from '../src/runs/run.validation.js';
import { buildRun } from './support/run-fixtures.js';
import { dataResponse } from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';

afterEach(cleanup);

const STOP_PATH = '/v1/runs/run-1/stop';

function showCard(): ReturnType<typeof renderApp> {
  const run = runDetailSchema.parse(
    buildRun({ kind: 'live_paper', status: 'running', periodEnd: null }),
  );
  return renderApp({
    path: '/',
    isAuthenticated: true,
    routes: [{ method: 'POST', path: STOP_PATH, respond: (): Response => dataResponse({}) }],
    probe: <RunProgressCard run={run} />,
  });
}

describe('cancelar a simulação ao vivo pede confirmação', () => {
  test('the first click only arms: nothing is sent, and the confirm button gets the focus', async () => {
    const { fake } = showCard();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar simulação' }));
    const confirm = await screen.findByRole('button', { name: 'Confirmar: cancelar simulação' });
    expect(document.activeElement).toBe(confirm);
    expect(fake.callsTo('POST', STOP_PATH)).toHaveLength(0);
  });

  test('the second click sends the stop exactly once', async () => {
    const { fake } = showCard();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar simulação' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar: cancelar simulação' }));
    await waitFor(() => expect(fake.callsTo('POST', STOP_PATH)).toHaveLength(1));
  });

  test('Voltar and Escape disarm without sending', async () => {
    const { fake } = showCard();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar simulação' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }));
    expect(screen.queryByRole('button', { name: /^Confirmar/ }) === null).toBe(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar simulação' }));
    fireEvent.keyDown(await screen.findByRole('button', { name: /^Confirmar/ }), {
      key: 'Escape',
    });
    expect(screen.queryByRole('button', { name: /^Confirmar/ }) === null).toBe(true);
    expect(fake.callsTo('POST', STOP_PATH)).toHaveLength(0);
  });
});
