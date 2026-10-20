// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { buildPlanLevels } from '../src/runs/candle-chart/plan-levels.js';
import type { BalconyAgent } from '../src/runs/team-room/balcony/balcony-agents.js';
import { humanizeReading } from '../src/runs/trading-room/reading-text.js';
import { buildRoomOpinions, summarize } from '../src/runs/trading-room/room-opinions.js';
import { tradePlanSchema, type TradePlan } from '../src/runs/trading-room/trade-plan.validation.js';
import {
  buildAvailableTeam,
  buildAwaitingPlan,
  buildHoldingPlan,
  buildTradePlan,
  buildUnavailablePlan,
} from './support/trade-plan-fixtures.js';

// Spec 011, Fase 3, S2: o plano do servidor no painel. Só formatação: nenhum número nasce aqui.

function parse(value: Record<string, unknown>): TradePlan {
  return tradePlanSchema.parse(value);
}

function agent(overrides: Partial<BalconyAgent>): BalconyAgent {
  return {
    slot: 'tiago',
    kind: 'rule',
    teamKey: undefined,
    name: 'Tiago',
    roleShort: 'Tendência',
    roleFull: 'Especialista em Tendência',
    figureRole: 'trend',
    family: 'trend',
    tone: 'voter',
    seal: { icon: 'info', word: 'Sem medida' },
    vote: { tone: 'buy', icon: 'arrowUp', word: 'a favor' },
    line: 'EMA rápida 101.000',
    lineTerm: undefined,
    placard: 'peso 1',
    horizon: undefined,
    facts: [],
    ariaLabel: 'Tiago',
    ...overrides,
  };
}

describe('trade-plan schema', () => {
  test('accepts the three plan shapes and both team shapes', () => {
    expect(parse(buildTradePlan()).plan.status).toBe('awaiting_entry');
    expect(parse(buildTradePlan(buildHoldingPlan())).plan.status).toBe('holding');
    const unavailable = parse(
      buildTradePlan(buildUnavailablePlan(), [
        buildAvailableTeam(),
        {
          status: 'unavailable',
          teamKey: 'nina',
          displayName: 'Nina',
          wallet: null,
          reason: 'no_entry',
          reportId: null,
          candleTime: null,
          action: 'hold',
          confidence: 40,
          message: 'A Nina ficaria de fora.',
        },
      ]),
    );
    expect(unavailable.teams.map((team) => team.status)).toEqual(['available', 'unavailable']);
  });

  test('refuses a value outside the contract', () => {
    const badReason = buildTradePlan({ ...buildUnavailablePlan(), reason: 'bogus' });
    expect(tradePlanSchema.safeParse(badReason).success).toBe(false);
    const badPrice = buildTradePlan({ ...buildAwaitingPlan(), currentPrice: 'NaN' });
    expect(tradePlanSchema.safeParse(badPrice).success).toBe(false);
  });
});

describe('plan levels on the screen', () => {
  test('awaiting entry draws the simulated buy, the target and the stop with the price in the label', () => {
    const levels = buildPlanLevels(parse(buildTradePlan()).plan) ?? [];
    expect(levels.map((level) => [level.role, level.title])).toEqual([
      ['entry', 'Compra simulada 100.010,00'],
      ['target', 'Alvo 103.100,00'],
      ['stop', 'Proteção 97.000,00'],
    ]);
  });

  test('holding draws the entry; without a plan the old level stays', () => {
    const held = buildPlanLevels(parse(buildTradePlan(buildHoldingPlan())).plan) ?? [];
    expect(held[0]?.title).toBe('Entrada 100.000,00');
    expect(buildPlanLevels(parse(buildTradePlan(buildUnavailablePlan())).plan)).toBeUndefined();
    expect(buildPlanLevels(undefined)).toBeUndefined();
  });
});

describe('room opinions', () => {
  const alice = agent({
    slot: 'alice',
    name: 'Alice',
    roleShort: 'Risco sênior',
    family: undefined,
  });
  const olivia = agent({
    slot: 'olivia',
    kind: 'model',
    teamKey: 'olivia',
    name: 'Olívia',
    roleShort: 'OpenAI',
  });

  test('the leader carries the server plan: buy, target, predicted profit after costs and stop', () => {
    const [leader] = buildRoomOpinions({
      agents: [alice],
      models: [],
      tradePlan: parse(buildTradePlan()),
    });
    expect(leader?.rows.map((row) => [row.label, row.value, row.detail])).toEqual([
      ['Comprar a', '100.010,00', undefined],
      ['Vender no alvo', '103.100,00', undefined],
      ['Lucro previsto no alvo', '+3,06%', '+7,65 USDT fict.'],
      ['Proteção', '97.000,00', '-3,13%'],
    ]);
    expect(leader === undefined ? [] : summarize(leader)).toEqual([
      '100.010,00 → 103.100,00',
      'prot. 97.000,00',
    ]);
  });

  test('a rule agent has no levels of its own: it repeats the team plan', () => {
    const [tiago] = buildRoomOpinions({
      agents: [agent({})],
      models: [],
      tradePlan: parse(buildTradePlan()),
    });
    expect(tiago?.rows).toEqual([]);
    expect(tiago?.note).toBe(
      'Plano da equipe: comprar a 100.010,00 · alvo 103.100,00 · lucro previsto +3,06%',
    );
    expect(tiago?.intent.word).toBe('a favor');
  });

  test('a quiet rule agent is out of the score; no plan gives the server sentence', () => {
    const quiet = agent({ tone: 'quiet' });
    const plan = parse(buildTradePlan(buildUnavailablePlan()));
    const [renata] = buildRoomOpinions({ agents: [quiet], models: [], tradePlan: plan });
    expect(renata?.isOut).toBe(true);
    expect(renata?.note).toBe('Ainda não há vela fechada.');
    const [leader] = buildRoomOpinions({ agents: [alice], models: [], tradePlan: plan });
    expect(leader?.rows).toEqual([]);
    expect(leader?.note).toBe('Ainda não há vela fechada.');
  });

  test('a model team brings its own levels, confidence and wallet', () => {
    const plan = parse(buildTradePlan(buildAwaitingPlan(), [buildAvailableTeam()]));
    const [model] = buildRoomOpinions({ agents: [], models: [olivia], tradePlan: plan });
    expect(model?.kind).toBe('model');
    expect(model?.rows[0]).toEqual({ label: 'Comprar a', value: '99.900,00', tone: 'buy' });
    expect(model?.confidence).toBe(72);
    expect(model?.wallet).toBe('Carteira dela: +5,00%');
  });
});

describe('readings for people', () => {
  test('huge indicator numbers become mi/bi with the typographic minus; small ones keep 2 places', () => {
    expect(humanizeReading('OBV×EMA 20 ema -961.233.115,7845')).toBe(
      'OBV×EMA 20 ema −961,2\u00a0mi',
    );
    expect(humanizeReading('RSI 54,3456')).toBe('RSI 54,35');
    expect(humanizeReading('EMA rápida 101.000')).toBe('EMA rápida 101.000');
  });
});
