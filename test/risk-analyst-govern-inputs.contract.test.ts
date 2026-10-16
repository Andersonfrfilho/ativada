// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { AnalystDecision } from '../packages/risk-analyst/src/index.js';
import {
  buildScenarioInput,
  CANDLE,
  createRandom,
  SCENARIO_TIME,
} from './fixtures/risk-analyst/decision-scenario.fixture.js';
import { loadRiskAnalystApi } from './fixtures/risk-analyst/risk-analyst-api.fixture.js';

const { decideAnalyst, toGovernInputs } = await loadRiskAnalystApi();

// T4.2a da spec 007 (ADR 0002 A21): a tradução PURA da decisão para as entradas do passo no governar. Mesma função no worker e
// no contrafactual. Contas à mão e 2.000 sorteios de propriedades.

const CANDLE_TIME = SCENARIO_TIME;
const CANDLE_WINDOW = { openTime: CANDLE_TIME, closeTime: CANDLE_TIME + CANDLE };
const BASE: AnalystDecision = decideAnalyst(buildScenarioInput());
const SCALES = ['0', '0.25', '0.5', '1'] as const;
const DRAWS = 2000;

type Overrides = {
  readonly entryGate: AnalystDecision['entryGate'];
  readonly riskScale: string;
  readonly timeExitDue: boolean;
};

function decisionWith(overrides: Partial<Overrides>): AnalystDecision {
  return { ...BASE, ...overrides };
}

function govern(params: {
  readonly decision: AnalystDecision | undefined;
  readonly hasPosition?: boolean;
  readonly isGoalEnded?: boolean;
}): ReturnType<typeof toGovernInputs> {
  return toGovernInputs({
    decision: params.decision,
    wallet: { hasPosition: params.hasPosition ?? false },
    candle: CANDLE_WINDOW,
    isGoalEnded: params.isGoalEnded ?? false,
  });
}

const TIME_EXIT = {
  commandId: `analyst:${CANDLE_TIME}:exit_position`,
  issuedAt: CANDLE_TIME + CANDLE,
  kind: 'exit_position',
  reason: 'analyst_timeout',
} as const;

describe('toGovernInputs: contas à mão', () => {
  test.each([...SCALES])(
    'porta aberta com tamanho %s devolve a mesma escala e nenhum comando',
    (scale) => {
      const inputs = govern({ decision: decisionWith({ entryGate: 'open', riskScale: scale }) });
      expect(inputs).toStrictEqual({ commands: [], entryRiskScale: scale });
    },
  );

  test('porta fechada (pausa ou fora do ritmo) dá escala 0 mesmo com tamanho 1', () => {
    const inputs = govern({ decision: decisionWith({ entryGate: 'closed', riskScale: '1' }) });
    expect(inputs).toStrictEqual({ commands: [], entryRiskScale: '0' });
  });

  test('falha do analista = escala 0 e nenhum comando, com ou sem posição', () => {
    for (const hasPosition of [true, false]) {
      expect(govern({ decision: undefined, hasPosition })).toStrictEqual({
        commands: [],
        entryRiskScale: '0',
      });
    }
  });

  test('a saída por tempo com posição vira exit_position/analyst_timeout, com id e instante do fechamento', () => {
    const inputs = govern({
      decision: decisionWith({ entryGate: 'open', riskScale: '0.5', timeExitDue: true }),
      hasPosition: true,
    });
    expect(inputs).toStrictEqual({ commands: [TIME_EXIT], entryRiskScale: '0.5' });
  });

  test('a SAÍDA nunca é bloqueada: porta fechada e escala 0 ainda mandam sair', () => {
    const inputs = govern({
      decision: decisionWith({ entryGate: 'closed', riskScale: '0', timeExitDue: true }),
      hasPosition: true,
    });
    expect(inputs).toStrictEqual({ commands: [TIME_EXIT], entryRiskScale: '0' });
  });

  test('saída por tempo devida sem posição aberta não manda nada', () => {
    const decision = decisionWith({ entryGate: 'open', riskScale: '1', timeExitDue: true });
    expect(govern({ decision, hasPosition: false }).commands).toStrictEqual([]);
  });

  test('posição aberta com a saída por tempo ainda não devida não manda nada', () => {
    const decision = decisionWith({ entryGate: 'open', riskScale: '1', timeExitDue: false });
    expect(govern({ decision, hasPosition: true }).commands).toStrictEqual([]);
  });

  test('meta decidida: o analista não manda comando (a meta encerra), mesmo com saída por tempo devida', () => {
    const decision = decisionWith({ entryGate: 'open', riskScale: '1', timeExitDue: true });
    const inputs = govern({ decision, hasPosition: true, isGoalEnded: true });
    expect(inputs.commands).toStrictEqual([]);
  });

  test('tamanho fora do conjunto fechado vira pausa (nunca passa de 1)', () => {
    for (const riskScale of ['2', '1.5', '0.75', '1.0', '-0.25', '', 'abc']) {
      const inputs = govern({ decision: decisionWith({ entryGate: 'open', riskScale }) });
      expect(inputs.entryRiskScale).toBe('0');
    }
  });

  test('decisão real: a regra em pausa dá escala 0 e a liberada dá 1', () => {
    const paused = decideAnalyst(buildScenarioInput({ isWaitingForData: true }));
    expect(paused.posture).toBe('pause');
    expect(govern({ decision: paused }).entryRiskScale).toBe('0');
    const released = decideAnalyst(
      buildScenarioInput({
        winners: ['reversion'],
        votes: { reversion: 1 },
        currentVolume: '15',
        currentAtr: '20',
      }),
    );
    expect(String(govern({ decision: released }).entryRiskScale)).toBe(
      released.entryGate === 'open' ? released.riskScale : '0',
    );
  });
});

function drawDecision(random: () => number): AnalystDecision | undefined {
  if (random() < 0.15) return undefined;
  const scales = [...SCALES, '2', '0.75', 'x'];
  return decisionWith({
    entryGate: random() < 0.5 ? 'open' : 'closed',
    riskScale: scales[Math.floor(random() * scales.length)] ?? '0',
    timeExitDue: random() < 0.5,
  });
}

describe('toGovernInputs: propriedades em 2.000 sorteios', () => {
  test('falha dá 0; nunca acima de 1; exit_position nunca suprimido; meta decidida dá nenhum comando', () => {
    const random = createRandom(20_261_016);
    for (let draw = 0; draw < DRAWS; draw += 1) {
      const decision = drawDecision(random);
      const hasPosition = random() < 0.5;
      const isGoalEnded = random() < 0.25;
      const inputs = govern({ decision, hasPosition, isGoalEnded });
      expect(SCALES).toContain(inputs.entryRiskScale);
      expect(Number(inputs.entryRiskScale)).toBeLessThanOrEqual(1);
      expect(inputs.commands.length).toBeLessThanOrEqual(1);
      for (const command of inputs.commands) expect(command.kind).toBe('exit_position');
      if (decision === undefined) {
        expect(inputs).toStrictEqual({ commands: [], entryRiskScale: '0' });
        continue;
      }
      if (isGoalEnded) expect(inputs.commands).toStrictEqual([]);
      const isDue = decision.timeExitDue && hasPosition && !isGoalEnded;
      expect(inputs.commands).toStrictEqual(isDue ? [TIME_EXIT] : []);
      if (decision.entryGate === 'closed') expect(inputs.entryRiskScale).toBe('0');
      else if (SCALES.some((scale) => scale === decision.riskScale)) {
        expect(String(inputs.entryRiskScale)).toBe(decision.riskScale);
      } else expect(inputs.entryRiskScale).toBe('0');
    }
  });

  test('a escala nunca passa do tamanho que a regra decidiu', () => {
    const random = createRandom(7);
    for (let draw = 0; draw < DRAWS; draw += 1) {
      const decision = drawDecision(random);
      if (decision === undefined) continue;
      const inputs = govern({ decision, hasPosition: random() < 0.5 });
      const decided = SCALES.some((scale) => scale === decision.riskScale)
        ? Number(decision.riskScale)
        : 0;
      expect(Number(inputs.entryRiskScale)).toBeLessThanOrEqual(decided);
    }
  });
});
