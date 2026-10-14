// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { LiveGoalProgress } from '../apps/api-ativada/src/runs/live-status/live-goal-progress.js';
import type { RunRecord } from '../packages/database/src/index.js';
import { decideGoalStep, loadGoalTracking } from '../apps/worker-ativada/src/live/goal-step.js';
import {
  computeGoalLevels,
  toEngineDecimal,
  type EngineCandle,
  type GoalSpec,
} from '../packages/strategy-engine/src/index.js';
import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';
import { createSeededRandom } from './fixtures/backtest/synthetic-candles.fixture.js';
import { ceilDivide, fromScaled, toScaled } from './fixtures/live-status/scaled-decimal.fixture.js';
import { buildReferenceRun } from './fixtures/strategy-engine/engine-scenarios.fixture.js';

// As contas vêm do módulo carregado pela raiz da API (a de produção, ou a cópia mutada do teste de mutantes).
const app = await loadApiApp();
const { computeLiveGoalProgress } = app.liveGoalProgress;

const MONEY_SCALE = 8;
const RATE_SCALE = 12;
const SAMPLES = 2_000;
const DAY = 86_400_000;
const PERIOD_START = Date.UTC(2026, 9, 13, 15);
const GOAL: GoalSpec = { targetRate: '0.03', maxLossRate: '0.05', horizonDays: 7 };

function progressAt(current: string, now = PERIOD_START): LiveGoalProgress {
  return computeLiveGoalProgress({
    goal: GOAL,
    initial: '1000',
    current,
    periodStart: PERIOD_START,
    now,
  });
}

function randomRate(random: () => number): string {
  return `0.${String(1 + Math.floor(random() * 99)).padStart(2, '0')}`;
}

describe('progresso da meta da simulação ao vivo (ADR 0002, spec 008, L8)', () => {
  test('o exemplo da spec: +3% em 7 dias sobre 1.000 USDT, perda máxima de 5%', () => {
    expect(progressAt('1000', PERIOD_START + DAY + 5 * 3_600_000)).toStrictEqual({
      targetRate: '0.03',
      targetAmount: '1030',
      remainingAmount: '30',
      remainingRate: '0.03',
      deadlineAt: PERIOD_START + 7 * DAY,
      remainingMilliseconds: 6 * DAY - 5 * 3_600_000,
      maxLossRate: '0.05',
      floorAmount: '950',
      lossRoomAmount: '50',
    });
  });

  test('no meio do caminho: falta o que resta e cabe o que sobra até o piso', () => {
    const progress = progressAt('1012.5');
    expect(progress.remainingAmount).toBe('17.5');
    expect(progress.remainingRate).toBe('0.0175');
    expect(progress.lossRoomAmount).toBe('62.5');
  });

  test('alvo alcançado ou passado: nada falta (nunca negativo)', () => {
    expect(progressAt('1030').remainingAmount).toBe('0');
    expect(progressAt('1030').remainingRate).toBe('0');
    expect(progressAt('1100').remainingAmount).toBe('0');
  });

  test('piso alcançado ou passado: nada cabe de queda (nunca negativo)', () => {
    expect(progressAt('950').lossRoomAmount).toBe('0');
    expect(progressAt('900').lossRoomAmount).toBe('0');
    expect(progressAt('900').remainingAmount).toBe('130');
  });

  test('o que falta sobe e o que cabe desce no oitavo decimal', () => {
    const progress = computeLiveGoalProgress({
      goal: GOAL,
      initial: '1000.12345678',
      current: '1000.12345678',
      periodStart: PERIOD_START,
      now: PERIOD_START,
    });
    expect(progress.targetAmount).toBe('1030.12716049');
    expect(progress.remainingAmount).toBe('30.00370371');
    expect(progress.floorAmount).toBe('950.11728395');
    expect(progress.lossRoomAmount).toBe('50.00617283');
  });

  test('prazo encerrado: o tempo restante para em zero', () => {
    expect(progressAt('1000', PERIOD_START + 7 * DAY).remainingMilliseconds).toBe(0);
    expect(progressAt('1000', PERIOD_START + 9 * DAY).remainingMilliseconds).toBe(0);
    expect(progressAt('1000', PERIOD_START + 7 * DAY - 1).remainingMilliseconds).toBe(1);
  });

  test(`propriedade em ${SAMPLES} sorteios: nunca negativo, falta para cima, cabe para baixo e os níveis são os de computeGoalLevels`, () => {
    const random = createSeededRandom(31);
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const initial = BigInt(1 + Math.floor(random() * 5_000_000_000_000));
      const current = BigInt(Math.floor(random() * 10_000_000_000_000));
      const goal: GoalSpec = {
        targetRate: randomRate(random),
        maxLossRate: randomRate(random),
        horizonDays: 1 + Math.floor(random() * 90),
      };
      const initialText = fromScaled(initial, MONEY_SCALE);
      const progress = computeLiveGoalProgress({
        goal,
        initial: initialText,
        current: fromScaled(current, MONEY_SCALE),
        periodStart: PERIOD_START,
        now: PERIOD_START,
      });
      const levels = computeGoalLevels({ initial: toEngineDecimal(initialText), goal });
      expect(progress.targetAmount).toBe(levels.target.toFixed());
      expect(progress.floorAmount).toBe(levels.stop.toFixed());
      const target = toScaled(progress.targetAmount, MONEY_SCALE);
      const floor = toScaled(progress.floorAmount, MONEY_SCALE);
      const remaining = toScaled(progress.remainingAmount, MONEY_SCALE);
      const lossRoom = toScaled(progress.lossRoomAmount, MONEY_SCALE);
      expect(remaining).toBe(target > current ? target - current : 0n);
      expect(lossRoom).toBe(current > floor ? current - floor : 0n);
      expect(toScaled(progress.remainingRate, RATE_SCALE)).toBe(
        ceilDivide(remaining * 10n ** BigInt(RATE_SCALE), initial),
      );
      expect(remaining >= 0n && lossRoom >= 0n).toBe(true);
    }
  });
});

const RUN_SETUP = buildReferenceRun({ symbol: 'BTCUSDT', timeframe: '1h' });
const TIMEFRAMES = [
  ['15m', 900_000],
  ['1h', 3_600_000],
  ['4h', 14_400_000],
  ['1d', DAY],
] as const;

function candleOpening(openTime: number, duration: number): EngineCandle {
  return {
    symbol: 'BTCUSDT',
    timeframe: '1h',
    openTime,
    closeTime: openTime + duration - 1,
    open: '100',
    high: '101',
    low: '99',
    close: '100',
    volume: '1',
  };
}

describe('o prazo da meta é o instante em que o worker dá o desfecho "expirou"', () => {
  test.each(TIMEFRAMES)(
    'vela de %s: o candle que expira fecha exatamente em deadlineAt',
    (_name, duration) => {
      const run = {
        id: 'run-1',
        kind: 'live_paper',
        periodStart: PERIOD_START,
        request: { goal: GOAL },
        goalId: 'goal-1',
      } as unknown as RunRecord;
      const tracking = loadGoalTracking({ run, setup: RUN_SETUP, durationMilliseconds: duration });
      if (tracking === undefined) throw new Error('sem acompanhamento da meta');
      const candlesInGoal = (GOAL.horizonDays * DAY) / duration;
      const equityPoint = {
        candleOpenTime: 0,
        equity: '10100',
        equityAtLow: '9900',
        benchmark: '10000',
      };
      const expiry: number[] = [];
      for (let index = 0; index < candlesInGoal + 2; index += 1) {
        const candle = candleOpening(PERIOD_START + index * duration, duration);
        if (decideGoalStep({ tracking, candle, equityPoint })?.outcome === 'expired') {
          expiry.push(candle.closeTime + 1);
        }
      }
      expect(expiry[0]).toBe(progressAt('1000').deadlineAt);
    },
  );
});
