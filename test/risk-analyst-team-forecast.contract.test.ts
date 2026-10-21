// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { SpecialistView } from '../packages/risk-analyst/src/index.js';
import { loadRiskAnalystApi } from './fixtures/risk-analyst/risk-analyst-api.fixture.js';

const { forecastTeam } = await loadRiskAnalystApi();

// T1.3 da spec 007 (ADR 0002, A12): a previsão da equipe e cada motivo de "sem previsão", com contas à mão e as bordas de
// 2/3 exatas (comparação em decimal sem dividir).

type Vote = -1 | 0 | 1 | null;

function view(key: SpecialistView['key'], vote: Vote, weight: string): SpecialistView {
  return {
    key,
    vote,
    isUnread: vote === null,
    predictions: 0,
    counted: 0,
    hits: 0,
    misses: 0,
    ties: 0,
    upMoves: 0,
    hitRate: null,
    upRate: null,
    verdict: weight === '0' ? 'even' : 'above',
    lower: null,
    upper: null,
    weight,
  };
}

const QUIET_MARKET = { atrRate: '0.01', atrPercentile95: '0.02', hasData: true } as const;

function forecast(
  specialists: readonly SpecialistView[],
  overrides = {},
): ReturnType<typeof forecastTeam> {
  return forecastTeam({ specialists, ...QUIET_MARKET, ...overrides });
}

describe('sem previsão, na precedência da A12', () => {
  test('sem dado: a equipe não tem o que ler (vence tudo)', () => {
    const result = forecast([view('reversion', 1, '0.4')], { hasData: false });
    expect(result).toMatchObject({ side: null, strength: null, noForecastReason: 'no_data' });
  });

  test('mercado agitado demais (ATR% acima do percentil 95) vence quem provou valor', () => {
    const team = [view('reversion', 1, '0.4')];
    expect(forecast(team, { atrRate: '0.0201' }).noForecastReason).toBe('too_volatile');
    expect(forecast(team, { atrRate: '0.02' }).noForecastReason).toBeNull();
  });

  test('ninguém provou valor: peso zero em todos', () => {
    const result = forecast([
      view('trend', 1, '0'),
      view('reversion', -1, '0'),
      view('volume', 0, '0'),
    ]);
    expect(result).toMatchObject({
      side: null,
      noForecastReason: 'no_proven_specialist',
      forWeight: '0',
      againstWeight: '0',
      provenWeight: '0',
    });
  });

  test('os que provaram valor estão neutros (ou sem leitura): sem previsão', () => {
    const result = forecast([
      view('reversion', 0, '0.4'),
      view('volume', null, '0.2'),
      view('trend', 1, '0'),
    ]);
    expect(result).toMatchObject({ noForecastReason: 'proven_neutral', provenWeight: '0.6' });
  });

  test('equipe dividida: o lado vencedor tem menos de 2/3 do peso de quem votou', () => {
    const result = forecast([view('reversion', 1, '0.463'), view('volume', -1, '0.4513')]);
    expect(result).toMatchObject({
      side: null,
      noForecastReason: 'split_team',
      forWeight: '0.463',
      againstWeight: '0.4513',
      provenWeight: '0.9143',
    });
  });

  test('a borda do 2/3: 2 contra 1 ainda é previsão; 2 contra 1,01 já é dividida', () => {
    const edge = forecast([view('reversion', 1, '2'), view('volume', -1, '1')]);
    expect(edge).toMatchObject({ side: 'up', strength: 'firm', noForecastReason: null });
    const split = forecast([view('reversion', 1, '2'), view('volume', -1, '1.01')]);
    expect(split.noForecastReason).toBe('split_team');
  });
});

describe('lado e força', () => {
  test('um só lado com peso: firme (todo o peso aprovado está nele)', () => {
    expect(forecast([view('reversion', 1, '0.46')])).toMatchObject({
      side: 'up',
      strength: 'firm',
      forWeight: '0.46',
      againstWeight: '0',
    });
    expect(forecast([view('reversion', -1, '0.46')])).toMatchObject({
      side: 'down',
      strength: 'firm',
      forWeight: '0',
      againstWeight: '0.46',
    });
  });

  test('força: o vencedor precisa de 2/3 de TODO o peso aprovado, neutros que provaram inclusos', () => {
    expect(forecast([view('reversion', 1, '2'), view('volume', 0, '1')]).strength).toBe('firm');
    expect(forecast([view('reversion', 1, '1.99'), view('volume', 0, '1')])).toMatchObject({
      side: 'up',
      strength: 'weak',
    });
  });

  test('a favor fraca: 0,463 a favor e 0,4513 neutro dá 0,5 do peso, abaixo de 2/3', () => {
    const result = forecast([view('reversion', 1, '0.463'), view('volume', 0, '0.4513')]);
    expect(result).toMatchObject({ side: 'up', strength: 'weak', provenWeight: '0.9143' });
  });

  test('a tendência da estratégia não vota nem pesa, mesmo com peso e voto', () => {
    const result = forecast([view('reversion', 1, '0.4'), view('strategy', -1, '0.9')]);
    expect(result).toMatchObject({
      side: 'up',
      strength: 'firm',
      againstWeight: '0',
      provenWeight: '0.4',
    });
  });

  test('voto contra com peso é contra; sem leitura entra só no peso aprovado', () => {
    const result = forecast([view('reversion', -1, '0.3'), view('volume', null, '0.1')]);
    expect(result).toMatchObject({ side: 'down', strength: 'firm', provenWeight: '0.4' });
  });
});
