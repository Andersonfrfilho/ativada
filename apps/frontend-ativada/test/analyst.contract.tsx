// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { afterEach, describe, expect, test } from 'bun:test';

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { useLiveStream } from '../src/live/useLiveStream.hook.js';
import { AnalystSection } from '../src/runs/analyst/AnalystSection.component.js';
import {
  analystRoutes,
  buildAnalystResponse,
  buildDecided,
  buildFailed,
  buildUnavailable,
  createAnalystHarness,
  MOVE_COST_REASON,
  PAUSE_LINE,
  QUARTER_HOUR,
  ANALYST_DISCLAIMER,
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

// O aviso do stream só chega se alguém escuta o stream (no app, o AppShell).
function Probe(): ReactElement {
  useLiveStream(noop, noop);
  return <AnalystSection runId={LIVE_RUN_ID} />;
}

function open(harness: AnalystHarness): RenderedApp {
  return renderApp({
    path: '/',
    isAuthenticated: true,
    routes: [
      {
        method: 'GET',
        path: '/v1/me',
        respond: (): Response =>
          Response.json({
            data: {
              id: 'user-1',
              displayName: null,
              displayCurrency: 'BRL',
              timezone: 'America/Sao_Paulo',
              alertTelegramEnabled: false,
              telegramLinked: false,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          }),
      },
      ...analystRoutes(harness),
    ],
    probe: <Probe />,
  });
}

async function cardOf(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: 'Analista de risco' });
}

describe('cartão do analista: as quatro posturas', () => {
  test.each([
    ['pause', 'PAUSA', 'warn', '0', 'nenhuma entrada nova'],
    ['caution', 'CAUTELA', 'warn', '0.25', '¼ do risco da estratégia'],
    ['normal', 'MODERADA', 'info', '0.5', '½ do risco da estratégia'],
    ['confident', 'LIBERADA', 'buy', '1', 'o risco inteiro da estratégia'],
  ])('%s: palavra %s, cor %s e tamanho "%s"', async (posture, word, tone, riskScale, size) => {
    const harness = createAnalystHarness({
      analyst: buildAnalystResponse({
        current: buildDecided({ posture, postureLabel: word, riskScale }),
      }),
    });
    open(harness);
    const card = within(await cardOf());
    const chip = card.getByText(word);
    expect(chip.className).toContain(tone);
    expect(chip.querySelector('svg')).not.toBeNull();
    expect(card.getByText(size)).toBeDefined();
  });

  test('o texto do servidor: postura, motivo, ritmo e duração, sem nada calculado no painel', async () => {
    open(createAnalystHarness());
    const card = within(await cardOf());
    expect(card.getByText(PAUSE_LINE)).toBeDefined();
    expect(card.getAllByText(MOVE_COST_REASON).length).toBeGreaterThan(0);
    expect(
      card.getByText('Volume 0,77× o normal das últimas 24 horas: olha o mercado a cada 1 hora.'),
    ).toBeDefined();
    expect(card.getByText('a cada 1 hora')).toBeDefined();
    expect(card.getByText('até 60 min')).toBeDefined();
    expect(card.getByText(ANALYST_DISCLAIMER)).toBeDefined();
    expect(card.getByText('Sem previsão')).toBeDefined();
  });
});

describe('cartão do analista: modo sombra', () => {
  test('o selo diz que o analista só observa', async () => {
    open(createAnalystHarness());
    const card = within(await cardOf());
    expect(card.getByText('modo sombra: o analista só observa')).toBeDefined();
  });

  test('em outro modo o selo não aparece', async () => {
    const harness = createAnalystHarness({
      analyst: buildAnalystResponse({
        mode: 'govern',
        modeMessage: 'O analista está decidindo o ritmo e o tamanho desta simulação.',
      }),
    });
    open(harness);
    const card = within(await cardOf());
    await card.findByText('PAUSA');
    expect(card.queryByText('modo sombra: o analista só observa')).toBeNull();
  });
});

describe('equipe e auditor', () => {
  test('uma linha por especialista com voto, acerto, situação e peso do servidor', async () => {
    open(createAnalystHarness());
    const table = within(await screen.findByRole('table'));
    const rows = table.getAllByRole('row');
    expect(rows).toHaveLength(6);
    const reversion = within(rows[2] as HTMLElement);
    expect(reversion.getByText('Reversão')).toBeDefined();
    expect(reversion.getByText('a favor')).toBeDefined();
    expect(reversion.getByText('55,64% (1.420 de 2.552)')).toBeDefined();
    expect(reversion.getByText('provou valor')).toBeDefined();
    expect(reversion.getByText('0,04')).toBeDefined();
    expect(reversion.getByText('O RSI (28,4) está abaixo de 30.')).toBeDefined();
    const strategy = within(rows[5] as HTMLElement);
    expect(strategy.getByText('Tendência da estratégia')).toBeDefined();
    expect(strategy.getByText('não vota')).toBeDefined();
  });

  test('sem leitura e em observação aparecem com palavra e sem taxa inventada', async () => {
    open(createAnalystHarness());
    const table = within(await screen.findByRole('table'));
    expect(table.getByText('sem leitura')).toBeDefined();
    expect(table.getByText('— (12 contadas)')).toBeDefined();
    expect(table.getByText('em observação: menos de 30')).toBeDefined();
    expect(table.getByText('Sem leitura do Fear & Greed há mais de 48 horas.')).toBeDefined();
  });
});

describe('travas e meta somada', () => {
  test('as cinco travas à vista; a ativa tem "ativa", cadeado e a frase do motivo', async () => {
    open(createAnalystHarness());
    const locks = within(await screen.findByRole('region', { name: 'Travas' }));
    expect(locks.getAllByRole('listitem')).toHaveLength(5);
    expect(locks.getByText('Perdas seguidas: 0 de 3')).toBeDefined();
    expect(locks.getByText('Folga até a perda máxima: sem meta, não se aplica')).toBeDefined();
    expect(locks.getAllByText('ativa')).toHaveLength(1);
    expect(locks.getByText(MOVE_COST_REASON)).toBeDefined();
    expect(locks.getByText('não se aplica')).toBeDefined();
  });

  test('a meta somada é a frase do servidor', async () => {
    const message = 'Meta: +10,00% no prazo. Somado até aqui: +3,00% em 1 operação. Falta 7,00%.';
    const harness = createAnalystHarness({
      analyst: buildAnalystResponse({
        goalProgress: {
          targetRate: '0.1',
          summedRate: '0.03',
          remainingRate: '0.07',
          trades: 1,
          message,
        },
      }),
    });
    open(harness);
    expect(await screen.findByText(message)).toBeDefined();
  });
});

describe('sem decisão para mostrar', () => {
  test.each([
    ['no_candle', 'Aguardando a primeira vela de 15 min fechar.'],
    ['warming_up', 'O analista ainda está juntando histórico do par.'],
    ['not_running', 'A simulação não está rodando: o analista não decide.'],
    ['stalled', 'A simulação parou de avançar; o analista volta quando ela voltar.'],
    [
      'waiting_for_data',
      'A simulação espera velas que faltam; o analista volta quando elas chegarem.',
    ],
    ['failed', 'O analista não conseguiu decidir nesta vela; a simulação seguiu sem ele.'],
  ])('%s mostra a frase do servidor', async (reason, message) => {
    const harness = createAnalystHarness({
      analyst: buildAnalystResponse({ current: buildUnavailable(reason, message), locks: [] }),
    });
    open(harness);
    const card = within(await cardOf());
    expect((await card.findByRole('status')).textContent).toBe(message);
    expect(card.getByText('sem decisão')).toBeDefined();
    expect(card.queryByRole('table')).toBeNull();
  });
});

describe('estados da consulta', () => {
  test('carregando e erro com "Tentar de novo"', async () => {
    const harness = createAnalystHarness({ analyst: 'failing' });
    open(harness);
    const card = within(await cardOf());
    expect((await card.findByRole('alert')).textContent).toBe(
      'Não deu para carregar o analista agora.',
    );
    harness.analyst = buildAnalystResponse();
    fireEvent.click(card.getByRole('button', { name: 'Tentar de novo' }));
    await card.findByText('PAUSA');
  });

  test('simulação sem analista (409): nenhum cartão e nenhum erro', async () => {
    const app = open(createAnalystHarness({ analyst: 'disabled' }));
    await waitFor(() =>
      expect(app.fake.callsTo('GET', `/v1/runs/${LIVE_RUN_ID}/analyst`)).toHaveLength(1),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('region', { name: 'Analista de risco' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(app.fake.callsTo('GET', `/v1/runs/${LIVE_RUN_ID}/analyst/decisions`)).toHaveLength(0);
  });

  test('o aviso do stream refaz a consulta e o cartão muda sem recarregar', async () => {
    const harness = createAnalystHarness();
    const app = open(harness);
    const card = within(await cardOf());
    await card.findByText('PAUSA');
    harness.analyst = buildAnalystResponse({
      current: buildDecided({
        candleTime: FIXTURE_CANDLE_TIME + QUARTER_HOUR,
        posture: 'confident',
        postureLabel: 'LIBERADA',
        riskScale: '1',
        message: 'Postura agora: LIBERADA',
      }),
    });
    act(() =>
      app.stream.emit({ type: 'event', runId: LIVE_RUN_ID, kind: 'analyst', eventId: 'e1', at: 1 }),
    );
    await card.findByText('LIBERADA', undefined, { timeout: 3000 });
    expect(card.queryByText('PAUSA')).toBeNull();
  });
});

describe('decisões anteriores', () => {
  test('uma linha por vela, a falha como "sem decisão" e "Ver decisões anteriores" por cursor', async () => {
    const harness = createAnalystHarness({
      decisionPages: [
        {
          items: [
            buildDecided({ candleTime: FIXTURE_CANDLE_TIME }),
            buildFailed(FIXTURE_CANDLE_TIME - QUARTER_HOUR),
          ],
          nextCursor: 'page-1',
        },
        {
          items: [
            buildDecided({
              candleTime: FIXTURE_CANDLE_TIME - 2 * QUARTER_HOUR,
              posture: 'normal',
              postureLabel: 'MODERADA',
              reasonMessage: 'Tendência para cima, fraca: menos de 2/3 do peso aprovado a favor.',
            }),
          ],
          nextCursor: null,
        },
      ],
    });
    open(harness);
    const history = within(await screen.findByRole('region', { name: 'Decisões do analista' }));
    const items = await history.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(
      history.getByText('O analista não conseguiu decidir nesta vela; a simulação seguiu sem ele.'),
    ).toBeDefined();
    fireEvent.click(history.getByRole('button', { name: 'Ver decisões anteriores' }));
    await history.findByText('MODERADA');
    expect(history.getAllByRole('listitem')).toHaveLength(3);
    expect(history.queryByRole('button', { name: 'Ver decisões anteriores' })).toBeNull();
  });

  test('sem decisões gravadas diz que ainda não decidiu nenhuma vela', async () => {
    open(createAnalystHarness({ decisionPages: [{ items: [], nextCursor: null }] }));
    const history = within(await screen.findByRole('region', { name: 'Decisões do analista' }));
    await history.findByText('O analista ainda não decidiu nenhuma vela.');
  });
});

describe('honestidade', () => {
  test('nada no cartão promete resultado ou manda comprar', async () => {
    open(createAnalystHarness());
    const card = await cardOf();
    await within(card).findByText('PAUSA');
    expect(card.textContent).not.toMatch(
      /vai subir|vai cair|garantid|recomendamos|compre\b|venda\b|confiante/i,
    );
    expect(card.textContent).toContain('Tendência, não promessa');
    expect(card.textContent).toContain('dinheiro fictício');
  });
});
