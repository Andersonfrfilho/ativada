// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type {
  AnalystDecision,
  AnalystInput,
  AnalystPosition,
  SpecialistKey,
} from '../packages/risk-analyst/src/index.js';
import {
  buildScenarioInput,
  CANDLE,
  closedPosition,
  createRandom,
  openPosition,
  type ScenarioOptions,
} from './fixtures/risk-analyst/decision-scenario.fixture.js';
import { loadRiskAnalystApi } from './fixtures/risk-analyst/risk-analyst-api.fixture.js';

const { decideAnalyst } = await loadRiskAnalystApi();

// T1.3 da spec 007 (ADR 0002, "Contratos de teste esperados"): 2.000 sorteios da regra `analyst-1`. Em todos: tamanho ≤ 1,
// trava ativa dá PAUSA, equipe contra dá PAUSA, o analista nunca emite comando de entrada nem barra uma saída, e a decisão
// é determinística e não olha o futuro.

const DRAWS = 2000;
const LENGTH = 130;
const GOAL = { targetRate: '0.03', maxLossRate: '0.1', horizonDays: 7 };
const SCALES = ['0', '0.25', '0.5', '1'];
const ALLOWED_KINDS = ['halt', 'resume', 'exit_position'];
const VOTES = [-1, 0, 1, null] as const;

type Random = () => number;

function pick<TItem>(random: Random, items: readonly TItem[]): TItem {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('lista vazia');
  return item;
}

function chance(random: Random, probability: number): boolean {
  return random() < probability;
}

function drawPositions(random: Random, candleTime: number): AnalystPosition[] {
  const count = Math.floor(random() * 10);
  return Array.from({ length: count }, () => {
    const openedCandleTime = candleTime - Math.floor(random() * 100) * CANDLE;
    if (chance(random, 0.4)) return openPosition(openedCandleTime);
    return closedPosition({
      openedCandleTime,
      closedCandleTime: Math.min(candleTime, openedCandleTime + Math.floor(random() * 8) * CANDLE),
      netProfit: pick(random, ['-1', '-0.5', '0', '2']),
    });
  });
}

function drawOptions(random: Random): ScenarioOptions {
  const start = (10_000 + Math.floor(random() * 16)) * CANDLE;
  const candleTime = start + (LENGTH - 1) * CANDLE;
  const winners: SpecialistKey[] = (['reversion', 'volume', 'trend'] as const).filter(() =>
    chance(random, 0.5),
  );
  return {
    length: LENGTH,
    start,
    currentVolume: pick(random, ['0', '3.9', '4', '5', '7', '9', '10', '15', '30', '100']),
    currentAtr: pick(random, ['0', '2', '5', '20', '25.3', '200']),
    winners,
    votes: {
      trend: pick(random, VOTES),
      reversion: pick(random, VOTES),
      volume: pick(random, VOTES),
      sentiment: pick(random, VOTES),
    },
    strategyVote: pick(random, VOTES),
    wallet: {
      equity: pick(random, ['900', '989', '990', '995', '1000', '1050']),
      equityReference: pick(random, [null, '1000', '1100']),
      isHalted: chance(random, 0.4),
      lastHaltReason: pick(random, [null, 'analyst_pause', 'goal_reached', 'user_stop']),
      positions: drawPositions(random, candleTime),
    },
    goal: chance(random, 0.5) ? GOAL : null,
    riskPerTrade: pick(random, ['0.01', '0.05']),
    isWaitingForData: chance(random, 0.08),
    isCatchingUp: chance(random, 0.08),
    missingCandleIndexes: chance(random, 0.08) ? [Math.floor(random() * LENGTH)] : [],
    warmUpCandles: chance(random, 0.08) ? 100 : 0,
  };
}

function withFuture(input: AnalystInput): AnalystInput {
  const future = (step: number): AnalystInput['candles'][number] => ({
    openTime: input.candleTime + step * CANDLE,
    close: '1',
    volume: '99999',
  });
  const poisoned = (step: number): AnalystInput['team']['trend'][number] => ({
    openTime: input.candleTime + step * CANDLE,
    close: '1',
    vote: -1,
    isMissing: false,
    atr: '9999',
  });
  return {
    ...input,
    candles: [...input.candles, future(1), future(2)],
    team: {
      trend: [...input.team.trend, poisoned(1)],
      reversion: [...input.team.reversion, poisoned(1)],
      volume: [...input.team.volume, poisoned(1)],
      sentiment: [...input.team.sentiment, poisoned(1)],
    },
    strategyVotes: [...input.strategyVotes, poisoned(1)],
  };
}

function checkSizeAndPosture(decision: AnalystDecision): void {
  expect(SCALES).toContain(decision.riskScale);
  expect(Number(decision.riskScale)).toBeLessThanOrEqual(1);
  expect(decision.riskScale === '0').toBe(decision.posture === 'pause');
  if (decision.locks.some((lock) => lock.isActive)) expect(decision.posture).toBe('pause');
  if (decision.forecast.side === 'down') expect(decision.posture).toBe('pause');
  if (decision.posture === 'caution') expect(decision.forecast.side).toBeNull();
  if (decision.posture === 'normal' || decision.posture === 'confident') {
    expect(decision.forecast.side).toBe('up');
  }
  if (decision.posture === 'confident') expect(decision.forecast.strength).toBe('firm');
  if (decision.entryGate === 'open') {
    expect(decision.posture).not.toBe('pause');
    expect(decision.isOnCadence).toBe(true);
  }
}

function checkCommands(decision: AnalystDecision, input: AnalystInput): void {
  const { wallet } = input;
  const hasOpenPosition = wallet.positions.some((position) => position.closedCandleTime === null);
  const kinds = decision.commands.map((command) => command.kind);
  for (const kind of kinds) expect(ALLOWED_KINDS).toContain(kind);
  expect(new Set(kinds).size).toBe(kinds.length);
  for (const command of decision.commands) {
    expect(command.commandId).toBe(`analyst:${decision.candleTime}:${command.kind}`);
  }
  expect(kinds.includes('halt')).toBe(decision.entryGate === 'closed' && !wallet.isHalted);
  const isOwnHalt = wallet.isHalted && wallet.lastHaltReason === 'analyst_pause';
  expect(kinds.includes('resume')).toBe(decision.entryGate === 'open' && isOwnHalt);
  // A saída por tempo nunca é barrada: nem por pausa, nem por porta fechada, nem por carteira parada.
  expect(kinds.includes('exit_position')).toBe(decision.timeExitDue && hasOpenPosition);
}

function checkFailures(decision: AnalystDecision, input: AnalystInput): void {
  if (input.isWaitingForData || input.isCatchingUp) {
    expect(decision).toMatchObject({ posture: 'pause', reason: 'no_data' });
  }
  if (decision.reason === 'no_data') {
    expect(decision.entryGate).toBe('closed');
    expect(decision.forecast.side).toBeNull();
  }
  const firstLock = decision.locks.find((lock) => lock.isActive);
  if (decision.posture === 'pause' && decision.reason !== 'no_data' && firstLock !== undefined) {
    expect(decision.reason).toBe(firstLock.key);
  }
  for (const view of decision.specialists) {
    if (view.weight !== '0') expect(view.verdict).toBe('above');
    if (view.key === 'strategy') expect(view.weight).toBe('0');
  }
}

describe('2.000 sorteios da regra analyst-1', () => {
  const random = createRandom(20_261_015);
  const draws = Array.from({ length: DRAWS }, (_unused, index) => {
    const input = buildScenarioInput(drawOptions(random));
    return { index, input, decision: decideAnalyst(input) };
  });
  const decisions = draws.map((draw) => draw.decision);

  test('tamanho ≤ 1, trava → pausa, equipe contra → pausa, postura coerente com a previsão', () => {
    for (const { decision } of draws) checkSizeAndPosture(decision);
  });

  test('só halt, resume e exit_position; resume só do halt dele; a saída por tempo nunca é barrada', () => {
    for (const { decision, input } of draws) checkCommands(decision, input);
  });

  test('falta de dado pausa sem previsão e a pausa por trava diz a primeira trava ativa', () => {
    for (const { decision, input } of draws) checkFailures(decision, input);
  });

  test('o sorteio exercita todas as posturas e os dois lados da porta', () => {
    expect(new Set(decisions.map((decision) => decision.posture))).toStrictEqual(
      new Set(['pause', 'caution', 'normal', 'confident']),
    );
    expect(new Set(decisions.map((decision) => decision.entryGate))).toStrictEqual(
      new Set(['open', 'closed']),
    );
    expect(
      new Set(decisions.flatMap((decision) => decision.commands.map((c) => c.kind))),
    ).toStrictEqual(new Set(['halt', 'resume', 'exit_position']));
    expect(new Set(decisions.map((decision) => decision.reason)).size).toBeGreaterThanOrEqual(10);
  });

  test('mesma entrada, mesma decisão, byte a byte (um a cada quatro sorteios)', () => {
    for (const { index, input, decision } of draws) {
      if (index % 4 !== 0) continue;
      expect(JSON.stringify(decideAnalyst(input))).toBe(JSON.stringify(decision));
    }
  });

  test('velas e votos depois de t não mudam a decisão (um a cada cinco sorteios)', () => {
    for (const { index, input, decision } of draws) {
      if (index % 5 !== 0) continue;
      expect(decideAnalyst(withFuture(input))).toStrictEqual(decision);
    }
  });
});
