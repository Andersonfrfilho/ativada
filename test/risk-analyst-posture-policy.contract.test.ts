// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type {
  ChoosePostureParams,
  MarketReadings,
  RiskLock,
  TeamForecast,
} from '../packages/risk-analyst/src/index.js';
import { loadRiskAnalystApi } from './fixtures/risk-analyst/risk-analyst-api.fixture.js';

const {
  ANALYST_RULES,
  chooseCadence,
  choosePosture,
  detectNoData,
  isOnCadence,
  LOCK_KEYS,
  resolveEntryGate,
  riskScaleOf,
} = await loadRiskAnalystApi();

// T1.3 da spec 007 (ADR 0002, A10, A11 e A13): dado, ritmo, janela de entrada e postura, com cada borda do volume
// (0,4, 0,7, 1 e 1,5) e do percentil 90 exata.

const READINGS: MarketReadings = {
  relativeVolume: '1',
  atrRate: '0.01',
  atrPercentile90: '0.015',
  atrPercentile95: '0.02',
  momentumShort: '0.001',
  momentumLong: '0.002',
  roundTripCost: '0.003',
  moveToCost: '3.33',
};

function readingsWith(overrides: Partial<MarketReadings>): MarketReadings {
  return { ...READINGS, ...overrides };
}

const NO_LOCKS: readonly RiskLock[] = LOCK_KEYS.map((key) => ({
  key,
  current: '0',
  limit: '1',
  isActive: false,
  isApplicable: true,
}));

function locksWith(...activeKeys: readonly (typeof LOCK_KEYS)[number][]): readonly RiskLock[] {
  return NO_LOCKS.map((lock) => ({ ...lock, isActive: activeKeys.includes(lock.key) }));
}

const UP_FIRM: TeamForecast = {
  side: 'up',
  strength: 'firm',
  noForecastReason: null,
  forWeight: '0.4',
  againstWeight: '0',
  provenWeight: '0.4',
};

function forecastWith(overrides: Partial<TeamForecast>): TeamForecast {
  return { ...UP_FIRM, ...overrides };
}

function choose(overrides: Partial<ChoosePostureParams>): ReturnType<typeof choosePosture> {
  return choosePosture({
    noData: null,
    locks: NO_LOCKS,
    readings: READINGS,
    forecast: UP_FIRM,
    ...overrides,
  });
}

describe('etapa 1 — dado (A10)', () => {
  const clean = { isWaitingForData: false, isCatchingUp: false, readings: READINGS };

  test('mercado completo não tem falta de dado', () => {
    expect(detectNoData(clean)).toBeNull();
  });

  test('a precedência: espera por dado, vela atrasada, vela faltando, aquecendo', () => {
    const all = {
      isWaitingForData: true,
      isCatchingUp: true,
      readings: readingsWith({ relativeVolume: null, atrRate: null }),
    };
    expect(detectNoData(all)).toBe('waiting_for_data');
    expect(detectNoData({ ...all, isWaitingForData: false })).toBe('late_candle');
    expect(detectNoData({ ...all, isWaitingForData: false, isCatchingUp: false })).toBe(
      'missing_candles',
    );
    expect(detectNoData({ ...clean, readings: readingsWith({ atrRate: null }) })).toBe(
      'warming_up',
    );
  });

  test('sem os percentis (menos de 96 amostras de ATR) também é aquecendo', () => {
    expect(detectNoData({ ...clean, readings: readingsWith({ atrPercentile90: null }) })).toBe(
      'warming_up',
    );
    expect(detectNoData({ ...clean, readings: readingsWith({ atrPercentile95: null }) })).toBe(
      'warming_up',
    );
  });
});

describe('etapa 3 — ritmo pelo volume relativo (A11)', () => {
  test.each([
    [null, 15],
    ['0', 240],
    ['0.39', 240],
    ['0.4', 240],
    ['0.6999', 240],
    ['0.7', 60],
    ['1', 60],
    ['1.4999', 60],
    ['1.5', 15],
    ['7', 15],
  ] as const)('volume %s → olha a cada %i min', (volume, minutes) => {
    expect(chooseCadence(volume)).toBe(minutes);
  });

  test('a janela de entrada: a vela FECHA na hora cheia (1 h) ou no múltiplo de 4 h (UTC)', () => {
    const at = (hour: number, minute: number): number => Date.UTC(2026, 9, 14, hour, minute);
    expect(isOnCadence({ candleTime: at(13, 45), cadenceMinutes: 60 })).toBe(true);
    expect(isOnCadence({ candleTime: at(14, 0), cadenceMinutes: 60 })).toBe(false);
    expect(isOnCadence({ candleTime: at(13, 45), cadenceMinutes: 240 })).toBe(false);
    expect(isOnCadence({ candleTime: at(15, 45), cadenceMinutes: 240 })).toBe(true);
    expect(isOnCadence({ candleTime: at(23, 45), cadenceMinutes: 240 })).toBe(true);
    expect(isOnCadence({ candleTime: at(14, 0), cadenceMinutes: 15 })).toBe(true);
    expect(isOnCadence({ candleTime: at(14, 15), cadenceMinutes: 15 })).toBe(true);
  });

  test('a porta só abre com postura diferente de pausa E dentro da janela', () => {
    expect(resolveEntryGate({ posture: 'confident', isOnCadence: true })).toBe('open');
    expect(resolveEntryGate({ posture: 'caution', isOnCadence: true })).toBe('open');
    expect(resolveEntryGate({ posture: 'normal', isOnCadence: false })).toBe('closed');
    expect(resolveEntryGate({ posture: 'pause', isOnCadence: true })).toBe('closed');
  });
});

describe('etapas 1 a 4 fecham a porta, nesta precedência', () => {
  test('falta de dado vence travas, mercado parado e equipe contra', () => {
    const choice = choose({
      noData: 'warming_up',
      locks: locksWith('daily_loss'),
      readings: readingsWith({ relativeVolume: '0.1' }),
      forecast: forecastWith({ side: 'down' }),
    });
    expect(choice).toStrictEqual({
      posture: 'pause',
      reason: 'no_data',
      reasonDetail: 'warming_up',
    });
  });

  test('a PRIMEIRA trava ativa dá o motivo, na ordem da A10', () => {
    for (const [index, key] of LOCK_KEYS.entries()) {
      const later = LOCK_KEYS.slice(index);
      expect(choose({ locks: locksWith(...later) })).toStrictEqual({
        posture: 'pause',
        reason: key,
        reasonDetail: null,
      });
    }
  });

  test('uma trava ativa vence mercado parado e equipe contra', () => {
    const choice = choose({
      locks: locksWith('move_cost'),
      readings: readingsWith({ relativeVolume: '0.1' }),
      forecast: forecastWith({ side: 'down' }),
    });
    expect(choice.reason).toBe('move_cost');
  });

  test('mercado parado: volume abaixo de 0,4 pausa; 0,4 exato não', () => {
    expect(choose({ readings: readingsWith({ relativeVolume: '0.39' }) })).toStrictEqual({
      posture: 'pause',
      reason: 'quiet_market',
      reasonDetail: null,
    });
    expect(choose({ readings: readingsWith({ relativeVolume: '0.4' }) }).posture).not.toBe('pause');
    expect(choose({ readings: readingsWith({ relativeVolume: '0' }) }).reason).toBe('quiet_market');
  });

  test('equipe contra pausa, e vence a leitura de volume baixo', () => {
    expect(choose({ forecast: forecastWith({ side: 'down' }) })).toStrictEqual({
      posture: 'pause',
      reason: 'team_against',
      reasonDetail: null,
    });
  });
});

describe('etapa 5 — postura e tamanho (A13)', () => {
  test('sem previsão é CAUTELA com o motivo da equipe', () => {
    const forecast = forecastWith({ side: null, strength: null, noForecastReason: 'split_team' });
    expect(choose({ forecast })).toStrictEqual({
      posture: 'caution',
      reason: 'no_forecast',
      reasonDetail: 'split_team',
    });
  });

  test('a favor fraca é MODERADA', () => {
    expect(choose({ forecast: forecastWith({ strength: 'weak' }) })).toStrictEqual({
      posture: 'normal',
      reason: 'weak_forecast',
      reasonDetail: null,
    });
  });

  test('a favor firme com volume ≥ 1 e ATR% ≤ percentil 90 é LIBERADA, nas duas bordas exatas', () => {
    const edge = readingsWith({ relativeVolume: '1', atrRate: '0.015', atrPercentile90: '0.015' });
    expect(choose({ readings: edge })).toStrictEqual({
      posture: 'confident',
      reason: 'firm_forecast',
      reasonDetail: null,
    });
  });

  test('firme com volume abaixo de 1 vira MODERADA ("volume baixo")', () => {
    const readings = readingsWith({ relativeVolume: '0.9999' });
    expect(choose({ readings })).toStrictEqual({
      posture: 'normal',
      reason: 'firm_forecast_capped',
      reasonDetail: 'low_volume',
    });
  });

  test('firme com oscilação acima do percentil 90 vira MODERADA ("oscilação alta")', () => {
    const readings = readingsWith({ atrRate: '0.0151', atrPercentile90: '0.015' });
    expect(choose({ readings })).toStrictEqual({
      posture: 'normal',
      reason: 'firm_forecast_capped',
      reasonDetail: 'high_volatility',
    });
  });

  test('as duas condições falhando: o volume é o motivo dito', () => {
    const readings = readingsWith({
      relativeVolume: '0.5',
      atrRate: '0.02',
      atrPercentile90: '0.015',
    });
    expect(choose({ readings }).reasonDetail).toBe('low_volume');
  });

  test('o tamanho é uma fração fechada do risco da estratégia e nunca passa de 1', () => {
    expect(riskScaleOf('pause')).toBe('0');
    expect(riskScaleOf('caution')).toBe('0.25');
    expect(riskScaleOf('normal')).toBe('0.5');
    expect(riskScaleOf('confident')).toBe('1');
    expect(Object.values(ANALYST_RULES.riskScale).every((scale) => Number(scale) <= 1)).toBe(true);
  });
});
