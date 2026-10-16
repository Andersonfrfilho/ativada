// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { HTTP_STATUS } from '@ativada/environment';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { dataResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { buildCombination, buildEvaluation, buildGoal } from './support/goal-fixtures.js';
import { renderApp } from './support/render-app.js';
import { buildRun } from './support/run-fixtures.js';

const LEGEND = 'De quanto em quanto tempo olhar o mercado';
const SIMULATE = 'Simular esta meta com Placar clássico';
const ANALYST = 'Deixar o analista de risco decidir';
const LOCKED =
  'A vela fica travada em 15 minutos: o analista olha o mercado a cada vela de 15 minutos.';
const FEES =
  'Cada ida e volta (compra e venda) custa 0,30% do valor, entre taxa e deslizamento. O analista só libera uma entrada quando o movimento típico paga pelo menos o dobro disso.';
const SHADOW =
  'Modo sombra: o analista só observa e mostra o que faria; a simulação segue a estratégia sem mudança.';

function open(extra: readonly FakeRoute[] = []): ReturnType<typeof renderApp> {
  return renderApp({
    path: '/metas/goal-1',
    isAuthenticated: true,
    routes: [
      ...extra,
      {
        method: 'GET',
        path: '/v1/goals/goal-1',
        respond: (): Response => dataResponse(buildGoal()),
      },
      {
        method: 'GET',
        path: '/v1/goals/goal-1/evaluation',
        respond: (): Response => dataResponse(buildEvaluation([buildCombination()])),
      },
      { method: 'GET', path: '/v1/runs', respond: (): Response => pageResponse([]) },
    ],
  });
}

function acceptRun(): FakeRoute {
  return {
    method: 'POST',
    path: '/v1/runs',
    respond: (): Response =>
      dataResponse(
        buildRun({ id: 'run-new', kind: 'live_paper', status: 'running', timeframe: '15m' }),
        HTTP_STATUS.ACCEPTED,
      ),
  };
}

describe('opção "Deixar o analista de risco decidir"', () => {
  test('começa desligada, sem nenhum aviso do analista', async () => {
    open();
    const group = await screen.findByRole('group', { name: LEGEND });
    const box = screen.getByRole('checkbox', { name: ANALYST });
    expect(box).toHaveProperty('checked', false);
    expect(group.textContent).not.toContain(LOCKED);
    expect(screen.getByRole('radio', { name: '1 hora' })).toHaveProperty('checked', true);
    expect(screen.getByRole('radio', { name: '1 hora' })).toHaveProperty('disabled', false);
  });

  test('ligada, trava a vela em 15 min, explica a taxa da ida e volta e avisa que é modo sombra', async () => {
    open();
    fireEvent.click(await screen.findByRole('checkbox', { name: ANALYST }));
    const group = await screen.findByRole('group', { name: LEGEND });
    expect(screen.getByRole('radio', { name: '15 minutos' })).toHaveProperty('checked', true);
    for (const name of ['15 minutos', '1 hora', '4 horas', '1 dia']) {
      expect(screen.getByRole('radio', { name })).toHaveProperty('disabled', true);
    }
    expect(group.textContent).toContain(LOCKED);
    expect(group.textContent).toContain(FEES);
    expect(group.textContent).toContain(SHADOW);
  });

  test('desligada de novo volta para 1 hora e libera as opções', async () => {
    open();
    const box = await screen.findByRole('checkbox', { name: ANALYST });
    fireEvent.click(box);
    fireEvent.click(box);
    expect(screen.getByRole('radio', { name: '1 hora' })).toHaveProperty('checked', true);
    expect(screen.getByRole('radio', { name: '1 hora' })).toHaveProperty('disabled', false);
    expect((await screen.findByRole('group', { name: LEGEND })).textContent).not.toContain(LOCKED);
  });

  test('o termo "analista de risco" tem a dica do glossário', async () => {
    open();
    await screen.findByRole('checkbox', { name: ANALYST });
    expect(screen.getByRole('button', { name: 'O que é Analista de risco?' })).toBeDefined();
  });
});

describe('criando a simulação', () => {
  test('com o analista: vela de 15 min e analyst em modo sombra', async () => {
    const { fake } = open([acceptRun()]);
    fireEvent.click(await screen.findByRole('checkbox', { name: ANALYST }));
    fireEvent.click(await screen.findByRole('button', { name: SIMULATE }));
    await waitFor(() => expect(fake.callsTo('POST', '/v1/runs')).toHaveLength(1));
    expect(fake.callsTo('POST', '/v1/runs')[0]?.body).toMatchObject({
      timeframe: '15m',
      analyst: { mode: 'shadow' },
    });
  });

  test('sem o analista nada muda: nenhuma chave analyst no pedido', async () => {
    const { fake } = open([acceptRun()]);
    fireEvent.click(await screen.findByRole('button', { name: SIMULATE }));
    await waitFor(() => expect(fake.callsTo('POST', '/v1/runs')).toHaveLength(1));
    const body = fake.callsTo('POST', '/v1/runs')[0]?.body;
    expect(body).toMatchObject({ timeframe: '1h' });
    expect(Object.keys(body as object)).not.toContain('analyst');
  });
});
