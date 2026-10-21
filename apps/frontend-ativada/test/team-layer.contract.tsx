// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

import { readChartPreferences } from '../src/runs/candle-chart/chart-preferences.js';
import { createDisplayMapping, slotOpens } from '../src/runs/candle-chart/display-mapping.js';
import {
  buildBands,
  buildNotes,
  buildPlaques,
  buildTeamLayer,
  type TeamLayerInput,
} from '../src/runs/candle-chart/team-layer.js';
import {
  FIXTURE_FROM,
  FIXTURE_HOUR,
  showCandleCard,
  type CandleCardHarness,
} from './support/candle-card-harness.js';
import type { FakeChartSurface } from './support/fake-chart-surface.js';
import {
  buildComparisonItem,
  buildRecommendation,
  buildRunModelTeams,
  buildTeamState,
  createModelTeamsHarness,
  modelTeamsRoutes,
  QUARTER,
} from './support/model-teams-fixtures.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const T = 1_760_000_100_000 - (1_760_000_100_000 % QUARTER);

function inputWith(overrides: Partial<TeamLayerInput> = {}): TeamLayerInput {
  return {
    comparison: [buildComparisonItem(T)],
    teams: [
      buildTeamState('nina', { recent: [buildRecommendation('nina', { candleTime: T })] }),
      buildTeamState('lucas', { recent: [] }),
    ],
    mapping: undefined,
    runMilliseconds: QUARTER,
    chartEnd: undefined,
    ...overrides,
  };
}

describe('camada "Equipes ◆": plaquinhas (RF18)', () => {
  test('uma plaquinha por equipe que decidiu, com inicial, ícone e palavra; falha e pendente não desenham', () => {
    const plaques = buildPlaques(inputWith());
    expect(plaques.map((plaque) => plaque.text)).toEqual(['◆N ↗ comprar', '◆L — esperar']);
    expect(plaques.map((plaque) => plaque.action)).toEqual(['buy', 'hold']);
    expect(plaques.every((plaque) => plaque.time === T / 1_000)).toBe(true);
  });

  test('na vela de 3 min a plaquinha cai na PRIMEIRA vela depois do fechamento da decidida (sem lookahead)', () => {
    const mapping = createDisplayMapping(QUARTER, QUARTER / 5);
    if (mapping === undefined) throw new Error('mapeamento esperado');
    const [first] = buildPlaques(inputWith({ mapping }));
    const firstSlot = slotOpens(T, mapping)[0];
    expect(first?.time).toBe((firstSlot ?? 0) / 1_000);
    expect((first?.time ?? 0) * 1_000).toBeGreaterThanOrEqual(T + QUARTER);
  });
});

describe('camada "Equipes ◆": faixas de entrada, alvo e proteção (RF18)', () => {
  test('a faixa da última compra vale só em [t + 15 min, t + 30 min), em degraus nas velas de 3 min', () => {
    const [band] = buildBands(inputWith({ chartEnd: T + 10 * QUARTER }));
    expect(band?.tag).toBe('◆N');
    expect(band?.entryTime).toBe((T + QUARTER) / 1_000);
    expect(band?.exitTime).toBe((T + 2 * QUARTER) / 1_000);
    expect([band?.entry, band?.target, band?.stop]).toEqual([100, 103.5, 98.4]);
  });

  test('a faixa que ainda vale vai até a ponta do gráfico; nunca começa antes do fechamento', () => {
    const [band] = buildBands(inputWith({ chartEnd: T + QUARTER }));
    expect(band?.exitTime).toBeNull();
    for (const item of buildBands(inputWith())) {
      expect(item.entryTime * 1_000).toBeGreaterThanOrEqual(T + QUARTER);
    }
  });

  test('só a ÚLTIMA compra de cada equipe vira faixa; venda, espera e compra sem níveis não', () => {
    const older = buildRecommendation('nina', { candleTime: T - QUARTER });
    const newest = buildRecommendation('nina', { candleTime: T });
    const sell = buildRecommendation('lucas', {
      action: 'sell',
      actionLabel: 'vender',
      levels: null,
    });
    const bands = buildBands(
      inputWith({
        teams: [
          buildTeamState('nina', { recent: [newest, older] }),
          buildTeamState('lucas', { recent: [sell] }),
        ],
      }),
    );
    expect(bands).toHaveLength(1);
    expect(bands[0]?.key).toBe(`team:nina:${T}`);
  });
});

describe('camada "Equipes ◆": balão', () => {
  test('a nota fica na chave da vela DECIDIDA e leva os preços quando a ficha os tem', () => {
    const notes = buildNotes(inputWith());
    expect(notes.get(T)).toEqual([
      '◆ Nina: ↗ comprar · entrada 100,00 · alvo 103,50 · proteção 98,40',
      '◆ Lucas: — esperar',
    ]);
    expect(buildTeamLayer(inputWith()).notes.size).toBe(1);
  });
});

function surfaceOf(harness: CandleCardHarness): FakeChartSurface {
  const surface = harness.surfaces.find((candidate) => !candidate.isDestroyed());
  if (surface === undefined) throw new Error('nenhuma superfície viva');
  return surface;
}

function list(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('lista esperada');
  return value.map((item: unknown) => {
    if (typeof item !== 'object' || item === null) throw new Error('objeto esperado');
    return Object.fromEntries(Object.entries(item));
  });
}

function showLive(kind: string): CandleCardHarness {
  const decided = FIXTURE_FROM + 5 * FIXTURE_HOUR;
  const harness = createModelTeamsHarness(
    buildRunModelTeams({
      teams: [
        buildTeamState('nina', {
          recent: [buildRecommendation('nina', { candleTime: decided })],
        }),
        buildTeamState('lucas', { recent: [] }),
        buildTeamState('olivia', { recent: [] }),
      ],
    }),
  );
  harness.comparison = [buildComparisonItem(decided)];
  return showCandleCard({
    kind,
    extraRoutes: modelTeamsRoutes(harness, 'run-1'),
  });
}

describe('camada "Equipes ◆" no gráfico', () => {
  test('vem desligada: nenhuma consulta, nenhuma plaquinha; ligar consulta, desenha e fica lembrada', async () => {
    const harness = showLive('live_paper');
    await waitFor(() => expect(surfaceOf(harness).callsOf('setCandles').length).toBeGreaterThan(0));
    const button = await screen.findByRole('button', { name: /Equipes ◆/ });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(harness.app.fake.callsTo('GET', '/v1/runs/run-1/model-teams/comparison')).toHaveLength(
      0,
    );
    expect(list(surfaceOf(harness).callsOf('setTeamPlaques').at(-1)?.[0] ?? [])).toHaveLength(0);
    fireEvent.click(button);
    await waitFor(() =>
      expect(list(surfaceOf(harness).callsOf('setTeamPlaques').at(-1)?.[0] ?? []).length).toBe(2),
    );
    const plaques = list(surfaceOf(harness).callsOf('setTeamPlaques').at(-1)?.[0]);
    expect(plaques.map((plaque) => plaque['text'])).toContain('◆N ↗ comprar');
    const boxes = list(surfaceOf(harness).callsOf('setLevels').at(-1)?.[0]);
    expect(boxes.some((box) => box['tag'] === '◆N')).toBe(true);
    expect(readChartPreferences().layers.teams).toBe(true);
    expect(document.body.textContent).toContain('Não é ordem nem recomendação');
    fireEvent.click(screen.getByRole('button', { name: /Equipes ◆/ }));
    await waitFor(() =>
      expect(list(surfaceOf(harness).callsOf('setTeamPlaques').at(-1)?.[0] ?? [])).toHaveLength(0),
    );
  });

  test('num backtest a camada não existe', async () => {
    const harness = showLive('backtest');
    await waitFor(() => expect(surfaceOf(harness).callsOf('setCandles').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: /Equipes ◆/ })).toBeNull();
  });
});
