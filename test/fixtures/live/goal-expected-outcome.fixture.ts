// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createEngine } from '../../../packages/strategy-engine/src/index.js';
import {
  CLASSIC_STRATEGY,
  REAL_DATASETS,
  type RealDataset,
} from '../strategy-engine/signal/classic-signals.fixture.js';
import { classicSetup, LEAD_IN_CANDLES } from './live-scenarios.fixture.js';

export const ETH_DAILY = REAL_DATASETS[1] as RealDataset;
const INITIAL = 10_000;
const SCALE = 100_000_000n;

export type Spec = { targetRate: string; maxLossRate: string; horizonDays: number };
export type Expected = {
  readonly outcome: 'reached' | 'stopped' | 'expired';
  readonly runOutcome: 'goal_reached' | 'goal_stopped' | 'goal_expired';
  readonly candleIndex: number;
};

function scaled(text: string): bigint {
  const [whole = '0', fraction = ''] = text.replace('-', '').split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, '0').slice(0, 8));
}

function ceilScaled(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

// O desfecho esperado, achado por varredura independente do código de produção da meta: a primeira vez, depois do início
// da simulação, em que o vale toca a perda máxima (antes do alvo no mesmo candle), o fechamento alcança o alvo ou o prazo acaba.
export function expectedGoalOutcome(spec: Spec): Expected {
  const setup = classicSetup(ETH_DAILY);
  const engine = createEngine();
  let state = engine.createInitialState({ strategy: CLASSIC_STRATEGY, run: setup });
  const initial = BigInt(INITIAL) * SCALE;
  const target = ceilScaled(initial * (SCALE + scaled(spec.targetRate)), SCALE);
  const stop = ceilScaled(initial * (SCALE - scaled(spec.maxLossRate)), SCALE);
  for (const [index, candle] of ETH_DAILY.candles.entries()) {
    const result = engine.step({ strategy: CLASSIC_STRATEGY, run: setup, state, candle });
    state = result.state;
    const elapsed = index - LEAD_IN_CANDLES + 1;
    const point = result.decisions.equityPoint;
    if (elapsed < 1 || point === null) continue;
    if (scaled(point.equityAtLow) <= stop) {
      return { outcome: 'stopped', runOutcome: 'goal_stopped', candleIndex: index };
    }
    if (scaled(point.equity) >= target) {
      return { outcome: 'reached', runOutcome: 'goal_reached', candleIndex: index };
    }
    if (elapsed >= spec.horizonDays) {
      return { outcome: 'expired', runOutcome: 'goal_expired', candleIndex: index };
    }
  }
  throw new Error('a meta não teve desfecho nos candles do conjunto');
}

const NEVER_STOPS = '0.99';
export const GOAL_SPECS: Readonly<Record<string, Spec>> = {
  reached: { targetRate: '0.002', maxLossRate: NEVER_STOPS, horizonDays: 90 },
  stopped: { targetRate: '5', maxLossRate: '0.002', horizonDays: 90 },
  expired: { targetRate: '5', maxLossRate: NEVER_STOPS, horizonDays: 7 },
};
