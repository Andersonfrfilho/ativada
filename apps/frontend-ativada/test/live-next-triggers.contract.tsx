// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { screen, within } from '@testing-library/react';

import { ruleTriggerSchema } from '../src/runs/live-tracking/live-status.validation.js';
import { buildScoreScale } from '../src/runs/live-tracking/scoreboard-scale.js';
import { formatCountdown, formatAge } from '../src/runs/live-tracking/live-pulse.js';
import { describeNeed, describeDistance } from '../src/runs/live-tracking/trigger-text.js';
import { buildLiveStatusResponse } from './support/live-status-fixtures.js';
import {
  buildRunSection,
  createLiveHarness,
  HOUR,
  LIVE_PERIOD_START,
  openLiveDetail,
} from './support/live-tracking-harness.js';

const DONCHIAN = {
  ruleId: 'donchian-20',
  label: 'Rompimento Donchian',
  kind: 'donchian',
  vote: 0,
  weight: '1',
  isMet: false,
  metric: 'close_price',
  direction: 'above',
  basis: 'exact',
  current: '12.707',
  threshold: '13.1',
  distance: '0.393',
  distanceRate: '0.0309',
  message: 'o preço precisa fechar acima de 13,10 (hoje 12,707, faltam 3,09%)',
};

const EMA = {
  ruleId: 'ema-20-50',
  label: 'Médias EMA 20 × 50',
  kind: 'ema_cross',
  vote: -1,
  weight: '1.5',
  isMet: false,
  metric: 'macd_gap',
  direction: 'above',
  basis: 'indicative',
  current: '-0.05',
  threshold: '0',
  distance: '0.05',
  distanceRate: null,
  message: 'o MACD precisa passar a linha de sinal',
};

function triggersOf(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'available',
    state: 'awaiting_entry',
    score: '-2.5',
    scoreThreshold: '2',
    scoreGap: '4.5',
    message: 'Faltam 4,5 pontos de 2 para comprar.',
    rules: [DONCHIAN, EMA],
    ...overrides,
  };
}

describe('régua do placar', () => {
  test('places the score and the threshold on a -4..+4 ruler (the redesign values)', () => {
    const scale = buildScoreScale({ score: '-2.5', threshold: '2', weights: ['1', '1.5', '1'] });
    expect(scale).toEqual({ limit: 4, scorePercent: 18.75, thresholdPercent: 75 });
  });

  test('grows the ruler to the sum of the weights and keeps a sell threshold on the left', () => {
    const scale = buildScoreScale({ score: '1', threshold: '-2', weights: ['3', '3', '2.5'] });
    expect(scale?.limit).toBe(9);
    expect(scale?.thresholdPercent).toBeCloseTo(38.88, 1);
  });

  test('text that is not a number draws nothing', () => {
    expect(buildScoreScale({ score: 'x', threshold: '2', weights: [] })).toBeUndefined();
  });
});

describe('textos do pulso e dos gatilhos', () => {
  test('countdown is mm:ss, then h:mm:ss, and never negative', () => {
    expect([83_000, 59_000, 3_725_000, -5].map(formatCountdown)).toEqual([
      '01:23',
      '00:59',
      '1:02:05',
      '00:00',
    ]);
  });

  test('age is seconds, minutes, hours', () => {
    expect([3_000, 125_000, 7_300_000].map(formatAge)).toEqual(['há 3 s', 'há 2 min', 'há 2 h']);
  });

  test('what the rule needs and how far it is, with exact or approximate marked', () => {
    const donchian = ruleTriggerSchema.parse(DONCHIAN);
    expect(describeNeed(donchian)).toBe('fechar acima de 13,10');
    expect(describeDistance(donchian)).toEqual({ text: '+3,09%', basis: 'exata' });
    const ema = ruleTriggerSchema.parse(EMA);
    expect(describeNeed(ema)).toBe('MACD acima da linha de sinal');
    expect(describeDistance(ema)).toEqual({ text: 'depende da próxima vela', basis: undefined });
    expect(describeDistance(ruleTriggerSchema.parse({ ...DONCHIAN, isMet: true })).text).toBe(
      'já atendida',
    );
  });
});

describe('"O que falta para comprar agora" (T3.3)', () => {
  test('awaiting entry: ruler, gap sentence and one row per rule with now, needs and distance', async () => {
    const harness = createLiveHarness({
      liveStatus: buildLiveStatusResponse({ triggers: triggersOf() }),
    });
    openLiveDetail(harness);
    const card = await screen.findByRole('region', { name: 'O que falta para comprar agora' });
    expect(
      within(card).getByRole('img', { name: /Pontuação −2,5; compra a partir de \+2/ }),
    ).toBeDefined();
    expect(within(card).getByText('Faltam 4,5 pontos de 2 para comprar.')).toBeDefined();
    const rows = within(card).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText('12,707')).toBeDefined();
    expect(within(rows[0] as HTMLElement).getByText('fechar acima de 13,10')).toBeDefined();
    expect(within(rows[0] as HTMLElement).getByText('+3,09%')).toBeDefined();
    expect(within(rows[0] as HTMLElement).getByText('0 neutra')).toBeDefined();
    expect(within(rows[1] as HTMLElement).getByText('−1,5 contra')).toBeDefined();
    expect(within(card).getByText(/Isto não é previsão/)).toBeDefined();
  });

  test('holding: the block asks what is missing to sell', async () => {
    const harness = createLiveHarness({
      liveStatus: buildLiveStatusResponse({
        triggers: triggersOf({
          state: 'holding',
          scoreThreshold: '-2',
          score: '1',
          message: 'Faltam 3 pontos de -2 para vender.',
          rules: [],
        }),
      }),
    });
    openLiveDetail(harness);
    const card = await screen.findByRole('region', { name: 'O que falta para vender agora' });
    expect(within(card).getByRole('img', { name: /vende a partir de −2/ })).toBeDefined();
  });

  test.each([
    ['no_candle', 'Aguardando a primeira vela fechar.'],
    ['not_running', 'A simulação foi parada: não há gatilho a calcular.'],
    ['warming_up', 'O gatilho do rompimento precisa de duas velas decididas.'],
  ])('unavailable (%s): the block says why instead of numbers', async (reason, message) => {
    const harness = createLiveHarness({
      liveStatus: buildLiveStatusResponse({ triggers: { status: 'unavailable', reason, message } }),
    });
    openLiveDetail(harness);
    const card = await screen.findByRole('region', { name: 'O que falta para comprar agora' });
    expect(within(card).getByText(message)).toBeDefined();
    expect(within(card).queryByRole('table')).toBeNull();
  });
});

describe('linha de pulso', () => {
  test('says running, the last decision and the countdown to the next one', async () => {
    const harness = createLiveHarness();
    openLiveDetail(harness);
    const pulse = await screen.findByRole('region', { name: 'Simulação rodando agora' });
    expect(within(pulse).getByText('Rodando')).toBeDefined();
    expect(within(pulse).getByText(/Última decisão/)).toBeDefined();
    expect(within(pulse).getByText('esperou')).toBeDefined();
    expect(within(pulse).getByText(/Próxima às/)).toBeDefined();
    expect(within(pulse).getByText(/^\d{2}:\d{2}$|^\d+:\d{2}:\d{2}$/)).toBeDefined();
    expect(within(pulse).getByText(/Simulador ativo · servidor respondeu há \d+ s/)).toBeDefined();
  });

  test('a stalled simulation says "Parada" with an icon and no countdown', async () => {
    const harness = createLiveHarness({
      liveStatus: buildLiveStatusResponse({
        run: buildRunSection({ stalledSince: LIVE_PERIOD_START + HOUR }),
      }),
    });
    openLiveDetail(harness);
    const pulse = await screen.findByRole('region', { name: 'Simulação rodando agora' });
    expect(within(pulse).getByText('Parada')).toBeDefined();
    expect(within(pulse).queryByText(/Próxima às/)).toBeNull();
  });
});
