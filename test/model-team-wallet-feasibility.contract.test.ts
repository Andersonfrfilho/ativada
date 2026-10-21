// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  applyTeamSignal,
  MODEL_TEAM_STRATEGY,
  MODEL_TEAM_STRATEGY_NAME,
  toTeamSignal,
  type TeamDecisionRecord,
} from '../packages/model-agents/src/index.js';
import {
  computeStrategyLeadInCandles,
  createEngine,
  EngineInputError,
  type EngineState,
  type SignalDecision,
  type WalletDecisions,
} from '../packages/strategy-engine/src/index.js';
import { buildReport } from './fixtures/model-agents/team-report.fixture.js';
import {
  buildTeamCandles,
  buildTeamRunSetup,
  QUARTER_HOUR,
} from './fixtures/model-teams/team-candles.fixture.js';

// T3.1 da spec 015 (plan D9): o `walletStep` avulso aceita o sinal sintético da equipe e a ordem executa em `t + 1`, com o
// stop e o alvo da configuração de risco. Nenhum arquivo do motor é tocado.

const GOLDEN_STRATEGY_HASH = '8dad5fe7c154715ff07018b9d6fb7c9711decc25a1acbff9e858fea0585fe289';
const BUY_INDEX_OFFSET = 3;

const engine = createEngine();
const run = buildTeamRunSetup();
const lead = computeStrategyLeadInCandles(MODEL_TEAM_STRATEGY.config);
const candles = buildTeamCandles(lead + 40);
const BUY_INDEX = lead + BUY_INDEX_OFFSET;

function recordAt(index: number): TeamDecisionRecord | null {
  if (index !== BUY_INDEX) return null;
  return { status: 'decided', opinionId: 'opinion-feasibility', report: buildReport('buy') };
}

type StepLog = {
  readonly index: number;
  readonly signal: SignalDecision | null;
  readonly wallet: WalletDecisions;
};

// O que o passo da equipe faz, peça por peça: `signalStep` real, troca da decisão, `walletStep` avulso.
function playScenario(): readonly StepLog[] {
  let state: EngineState = engine.createInitialState({ strategy: MODEL_TEAM_STRATEGY, run });
  const logs: StepLog[] = [];
  candles.forEach((candle, index) => {
    const real = engine.signalStep({
      strategy: MODEL_TEAM_STRATEGY,
      market: run.parameters,
      state: state.signal,
      candle,
    });
    const team = toTeamSignal({
      record: recordAt(index),
      hasPosition: state.wallet.position !== null,
      candleOpenTime: candle.openTime,
    });
    const signal = real.signal === null ? null : applyTeamSignal(real.signal, team);
    const wallet = engine.walletStep({
      strategy: MODEL_TEAM_STRATEGY,
      run,
      state: state.wallet,
      candle,
      signal,
    });
    state = { ...state, signal: real.state, wallet: wallet.state };
    logs.push({ index, signal, wallet: wallet.decisions });
  });
  return logs;
}

describe('a versão fixa model-team-1', () => {
  test('o hash está preso e a regra tem período menor ou igual ao do ATR', () => {
    expect(MODEL_TEAM_STRATEGY_NAME).toBe('model-team-1');
    expect(MODEL_TEAM_STRATEGY.configHash).toBe(GOLDEN_STRATEGY_HASH);
    const [rule] = MODEL_TEAM_STRATEGY.config.rules;
    expect(rule?.kind).toBe('rsi');
    expect(rule !== undefined && 'period' in rule ? rule.period : Infinity).toBeLessThanOrEqual(
      MODEL_TEAM_STRATEGY.config.risk.atrPeriod,
    );
  });

  test('o aquecimento fica sem sinal e depois o sinal real chega', () => {
    const logs = playScenario();
    const first = logs.findIndex((entry) => entry.signal !== null);
    expect(first).toBeGreaterThanOrEqual(MODEL_TEAM_STRATEGY.config.risk.atrPeriod);
    expect(first).toBeLessThanOrEqual(lead);
    expect(logs.slice(0, first).every((entry) => entry.signal === null)).toBe(true);
    expect(logs.slice(first).every((entry) => entry.signal !== null)).toBe(true);
  });
});

describe('o sinal sintético da equipe no walletStep avulso', () => {
  const logs = playScenario();
  const buyLog = logs[BUY_INDEX];
  const nextLog = logs[BUY_INDEX + 1];

  test('o sinal de compra mantém hash, lacuna e indicadores do sinal real e não leva votos', () => {
    expect(buyLog?.signal?.action).toBe('BUY');
    expect(buyLog?.signal?.score).toBe('100');
    expect(buyLog?.signal?.votes).toEqual([]);
    expect(buyLog?.signal?.configHash).toBe(MODEL_TEAM_STRATEGY.configHash);
    expect(buyLog?.signal?.confirmedGapCandles).toBe(0);
    expect(buyLog?.signal?.indicators['risk:atr']).toBeGreaterThan(0);
  });

  test('a guarda aceita e a ordem de compra nasce em t, sem preencher em t', () => {
    expect(buyLog?.wallet.orders.map((order) => order.status)).toEqual(['created']);
    expect(buyLog?.wallet.fills).toEqual([]);
  });

  test('a compra executa na ABERTURA de t + 1 com stop e alvo da configuração de risco', () => {
    const fill = nextLog?.wallet.fills[0];
    const opened = nextLog?.wallet.openedPositions[0];
    expect(fill?.side).toBe('buy');
    expect(fill?.candleOpenTime).toBe(candles[BUY_INDEX + 1]?.openTime);
    expect(Number(fill?.price)).toBeGreaterThanOrEqual(Number(candles[BUY_INDEX + 1]?.open));
    const atr = buyLog?.signal?.indicators['risk:atr'] ?? 0;
    const entry = Number(opened?.entryPrice);
    expect(entry - Number(opened?.stopPrice)).toBeCloseTo(2 * atr, 1);
    expect(Number(opened?.targetPrice) - entry).toBeCloseTo(3 * atr, 1);
  });

  test('nenhuma ordem aparece antes da vela de decisão', () => {
    const before = logs.slice(0, BUY_INDEX);
    expect(before.every((entry) => entry.wallet.orders.length === 0)).toBe(true);
    expect((candles[BUY_INDEX + 1]?.openTime ?? 0) - (candles[BUY_INDEX]?.openTime ?? 0)).toBe(
      QUARTER_HOUR,
    );
  });

  test('a guarda continua recusando um sinal de outra versão da estratégia', () => {
    const state = engine.createInitialState({ strategy: MODEL_TEAM_STRATEGY, run });
    const candle = candles[0];
    if (candle === undefined || buyLog?.signal == null) throw new Error('cenário incompleto');
    const foreign = { ...buyLog.signal, configHash: 'f'.repeat(64) };
    expect(() =>
      engine.walletStep({
        strategy: MODEL_TEAM_STRATEGY,
        run,
        state: state.wallet,
        candle,
        signal: foreign,
      }),
    ).toThrow(EngineInputError);
  });
});
