// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { groupDecisions, mergeDecisions } from '../src/runs/live-tracking/decision-groups.js';
import { decisionSchema } from '../src/runs/live-tracking/live-status.validation.js';
import { buildLiveStatusResponse } from './support/live-status-fixtures.js';
import {
  buildDecisionAt,
  createLiveHarness,
  LIVE_BASE,
  LIVE_RUN_ID,
  openLiveDetail,
  type LiveHarness,
} from './support/live-tracking-harness.js';

const TABLE_CARD = { name: 'O que a estratégia decidiu a cada hora' } as const;
const SAME_REASON = 'Mercado fraco: 2 regras contra, nenhuma a favor. Sem posição, nada a vender.';

function liveWith(items: Record<string, unknown>[], nextCursor: string | null): LiveHarness {
  return createLiveHarness({
    liveStatus: buildLiveStatusResponse({ decisions: { items, nextCursor } }),
  });
}

function weak(
  hoursBefore: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return buildDecisionAt(hoursBefore, { score: '-2.5', message: SAME_REASON, ...overrides });
}

function parse(value: Record<string, unknown>): ReturnType<typeof decisionSchema.parse> {
  return decisionSchema.parse(value);
}

describe('agrupar decisões iguais', () => {
  test('equal consecutive candles collapse behind the most recent one', () => {
    const list = [0, 1, 2, 3, 4].map((hours) => parse(weak(hours)));
    const groups = groupDecisions(list);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.head.candleTime).toBe(list[0]?.candleTime);
    expect(groups[0]?.hidden).toHaveLength(4);
  });

  test('a different score or reason breaks the run and one equal candle is not hidden', () => {
    const list = [
      parse(weak(0)),
      parse(weak(1, { score: '-4' })),
      parse(weak(2)),
      parse(weak(3)),
      parse(weak(4, { message: 'Outro motivo.' })),
    ];
    const groups = groupDecisions(list);
    expect(groups.map((group) => group.hidden.length)).toEqual([0, 0, 0, 0, 0]);
  });

  test('the fresh live-status line wins over the same candle kept in an older page', () => {
    const stale = parse(weak(0, { outcome: 'buy_pending', message: 'Pediu compra.' }));
    const fresh = parse(weak(0, { outcome: 'bought', message: 'Comprou.' }));
    expect(mergeDecisions([[stale], [fresh]])[0]?.outcome).toBe('bought');
  });

  test('merging drops a repeated candle and keeps the newest first', () => {
    const first = [parse(weak(0)), parse(weak(1))];
    const second = [parse(weak(1)), parse(weak(2))];
    expect(mergeDecisions([second, first]).map((item) => item.candleTime)).toEqual(
      [0, 1, 2].map((hours) => parse(weak(hours)).candleTime),
    );
  });
});

describe('tabela "O que a estratégia decidiu" (T3.2)', () => {
  test('lists the newest first, with the sentence and the score against the threshold', async () => {
    const harness = liveWith(
      [
        buildDecisionAt(0, { message: 'Faltou 1 ponto: o MACD ainda está negativo.' }),
        buildDecisionAt(1, {
          outcome: 'bought',
          action: 'BUY',
          score: '2.5',
          message: 'Comprou: 2 de 3 regras a favor.',
        }),
      ],
      null,
    );
    openLiveDetail(harness);
    const card = await screen.findByRole('region', TABLE_CARD);
    const rows = within(card).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText('Esperou')).toBeDefined();
    expect(within(rows[0] as HTMLElement).getByText('+1 de +2')).toBeDefined();
    expect(
      within(rows[0] as HTMLElement).getByText('Faltou 1 ponto: o MACD ainda está negativo.'),
    ).toBeDefined();
    expect(within(rows[1] as HTMLElement).getByText('Comprou')).toBeDefined();
    expect(within(rows[1] as HTMLElement).getByText('+2,5 de +2')).toBeDefined();
    expect(within(card).getByText(/horários|GMT/)).toBeDefined();
  });

  test('a pending buy and an exit have their own word, and one decision is singular', async () => {
    const harness = liveWith(
      [buildDecisionAt(0, { outcome: 'buy_pending', action: 'BUY', message: 'Pediu compra.' })],
      null,
    );
    openLiveDetail(harness);
    const card = await screen.findByRole('region', TABLE_CARD);
    expect(within(card).getByText('Pediu compra')).toBeDefined();
    expect(within(card).getByText(/^1 decisão mostrada/)).toBeDefined();
    expect(within(card).queryByText(/1 decisões/)).toBeNull();
  });

  test('an exit shows "Saiu" with the sentence of the server', async () => {
    openLiveDetail(
      liveWith(
        [buildDecisionAt(0, { outcome: 'exited', message: 'Vendeu no stop (95,50).' })],
        null,
      ),
    );
    const card = await screen.findByRole('region', TABLE_CARD);
    expect(within(card).getByText('Saiu')).toBeDefined();
    expect(within(card).getByText('Vendeu no stop (95,50).')).toBeDefined();
  });

  test('a vote with weight zero says it is out because of the trend filter', async () => {
    const votes = [
      {
        ruleId: 'b',
        label: 'Bollinger',
        kind: 'bollinger',
        vote: -1,
        weight: '0',
        isMissing: false,
        reading: null,
      },
    ];
    openLiveDetail(liveWith([buildDecisionAt(0, { votes })], null));
    const card = await screen.findByRole('region', TABLE_CARD);
    fireEvent.click(within(card).getByRole('button', { name: 'ver votos' }));
    expect(within(card).getByText('fora (filtro de tendência)')).toBeDefined();
    expect(within(card).queryByText(/contra/)).toBeNull();
  });

  test('"ver votos" opens the rules by button with aria-expanded and shows the technical detail folded', async () => {
    openLiveDetail(liveWith([buildDecisionAt(0)], null));
    const card = await screen.findByRole('region', TABLE_CARD);
    const toggle = within(card).getByRole('button', { name: 'ver votos' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    const opened = within(card).getByRole('button', { name: 'esconder votos' });
    expect(opened.getAttribute('aria-expanded')).toBe('true');
    expect(within(card).getByText(/RSI:/)).toBeDefined();
    expect(within(card).getByText('0 neutra')).toBeDefined();
    expect(within(card).getByText(/leitura 55/)).toBeDefined();
    expect(within(card).getByText('Detalhe técnico')).toBeDefined();
    expect(within(card).getByText('score 1 < buy 2')).toBeDefined();
    fireEvent.click(opened);
    expect(within(card).queryByText('Detalhe técnico')).toBeNull();
  });

  test('votes carry sign and word, never only a colour', async () => {
    const votes = [
      {
        ruleId: 'a',
        label: 'Médias',
        kind: 'ema_cross',
        vote: -1,
        weight: '1.5',
        isMissing: false,
        reading: null,
      },
      {
        ruleId: 'b',
        label: 'Rompimento',
        kind: 'donchian',
        vote: 1,
        weight: '2',
        isMissing: false,
        reading: null,
      },
    ];
    openLiveDetail(liveWith([buildDecisionAt(0, { votes })], null));
    const card = await screen.findByRole('region', TABLE_CARD);
    fireEvent.click(within(card).getByRole('button', { name: 'ver votos' }));
    expect(within(card).getByText('−1,5 contra')).toBeDefined();
    expect(within(card).getByText('+2 a favor')).toBeDefined();
  });

  test('equal hours fold into one line that opens by button', async () => {
    const items = [0, 1, 2, 3, 4].map((hours) => weak(hours));
    openLiveDetail(liveWith(items, null));
    const card = await screen.findByRole('region', TABLE_CARD);
    expect(within(card).getAllByRole('row')).toHaveLength(3);
    const toggle = within(card).getByRole('button', { name: 'Mostrar 4 horas iguais' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBeNull();
    const rangeText = within(card).getByText(/mesma decisão e mesmo motivo/).textContent ?? '';
    expect(rangeText).toMatch(
      /de \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} a \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:/,
    );
    fireEvent.click(toggle);
    expect(within(card).getAllByRole('row')).toHaveLength(7);
    const controlled = within(card)
      .getByRole('button', { name: 'Esconder' })
      .getAttribute('aria-controls')
      ?.split(' ');
    expect(controlled).toHaveLength(4);
    for (const id of controlled ?? []) expect(card.querySelector(`[id="${id}"]`)).not.toBeNull();
    expect(
      within(card).getByRole('button', { name: 'Esconder' }).getAttribute('aria-expanded'),
    ).toBe('true');
  });

  test('opens short: the 8 newest decisions, and "Ver mais" shows the rest', async () => {
    const items = Array.from({ length: 12 }, (_, hours) =>
      buildDecisionAt(hours, { score: String(hours), message: `Motivo ${hours}` }),
    );
    openLiveDetail(liveWith(items, null));
    const card = await screen.findByRole('region', TABLE_CARD);
    expect(within(card).getAllByRole('row')).toHaveLength(9);
    fireEvent.click(within(card).getByRole('button', { name: 'Ver mais 4 decisões' }));
    expect(within(card).getAllByRole('row')).toHaveLength(13);
    expect(within(card).queryByRole('button', { name: /Ver mais/ })).toBeNull();
  });

  test('"Ver decisões anteriores" pages by cursor and disappears at the end', async () => {
    const newest = [0, 1].map((hours) => buildDecisionAt(hours, { score: String(hours + 1) }));
    const harness = liveWith(newest, 'page-1');
    harness.decisionPages = [
      { items: [...newest, buildDecisionAt(2, { score: '3' })], nextCursor: 'page-1' },
      { items: [buildDecisionAt(3, { score: '4' })], nextCursor: null },
    ];
    const app = openLiveDetail(harness);
    const card = await screen.findByRole('region', TABLE_CARD);
    expect(within(card).getAllByRole('row')).toHaveLength(3);
    fireEvent.click(within(card).getByRole('button', { name: 'Ver decisões anteriores' }));
    await waitFor(() => expect(within(card).getAllByRole('row')).toHaveLength(4));
    const first = app.fake.callsTo('GET', `${LIVE_BASE}/decisions`)[0]?.query;
    expect([first?.get('limit'), first?.get('cursor')]).toEqual(['48', null]);
    fireEvent.click(within(card).getByRole('button', { name: 'Ver decisões anteriores' }));
    await waitFor(() => expect(within(card).getAllByRole('row')).toHaveLength(5));
    const second = app.fake.callsTo('GET', `${LIVE_BASE}/decisions`)[1]?.query;
    expect([second?.get('limit'), second?.get('cursor')]).toEqual(['24', 'page-1']);
    expect(within(card).queryByRole('button', { name: 'Ver decisões anteriores' })).toBeNull();
  });

  test('a stream notice adds the new line on top without reloading the page', async () => {
    const harness = liveWith([buildDecisionAt(1, { score: '1' })], null);
    const app = openLiveDetail(harness);
    const card = await screen.findByRole('region', TABLE_CARD);
    expect(within(card).getAllByRole('row')).toHaveLength(2);
    harness.liveStatus = buildLiveStatusResponse({
      decisions: {
        items: [
          buildDecisionAt(0, { score: '0', message: 'Faltaram 2 pontos: nova vela.' }),
          buildDecisionAt(1, { score: '1' }),
        ],
        nextCursor: null,
      },
    });
    act(() =>
      app.stream.emit({ type: 'event', runId: LIVE_RUN_ID, kind: 'fill', eventId: 'e1', at: 1 }),
    );
    await waitFor(() => expect(within(card).getAllByRole('row')).toHaveLength(3));
    expect(within(card).getByText('Faltaram 2 pontos: nova vela.')).toBeDefined();
  });
});
