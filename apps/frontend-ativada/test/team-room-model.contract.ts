// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { decisionSchema } from '../src/runs/live-tracking/live-status.validation.js';
import { projectionsSchema } from '../src/runs/candle-chart/projections.validation.js';
import {
  analystStateOf,
  planSequence,
  REST_STEP,
  seatStateOf,
  totalMilliseconds,
} from '../src/runs/team-room/team-room-sequence.js';
import {
  MAX_SEQUENCE_MILLISECONDS,
  TEAM_ROOM_TIMELINE,
} from '../src/runs/team-room/team-room.constant.js';
import { buildAuditorView, buildTeamRoomView } from '../src/runs/team-room/team-room-view.js';
import {
  buildProjectionsResponse,
  buildProjectionsSummary,
} from './support/candle-chart-fixtures.js';
import { buildRoomDecision, type VoteSpec } from './support/team-room-fixtures.js';

function viewOf(votes: readonly VoteSpec[]): ReturnType<typeof buildTeamRoomView> {
  const decision = decisionSchema.parse(buildRoomDecision({ votes }));
  return buildTeamRoomView({ decision, triggers: undefined });
}

const RSI_AGAINST: VoteSpec = { ruleId: 'rsi-14', label: 'RSI', kind: 'rsi', vote: -1 };

describe('sala da equipe: das regras aos especialistas', () => {
  test('groups the rules by family in the fixed order and names only the families that exist', () => {
    const view = viewOf([
      { ruleId: 'obv-ema-20', label: 'OBV', kind: 'obv_trend', vote: 0 },
      RSI_AGAINST,
      { ruleId: 'macd-12-26-9', label: 'MACD', kind: 'macd', vote: 1 },
      { ruleId: 'ema-9-21', label: 'Médias', kind: 'ema_cross', vote: 1 },
    ]);
    expect(view.specialists.map((specialist) => specialist.name)).toEqual([
      'Tendência',
      'Reversão',
      'Volume',
    ]);
    expect(view.specialists[0]?.rules.map((rule) => rule.label)).toEqual(['MACD', 'Médias']);
  });

  test('a rule of an unknown kind goes to "Outras regras" instead of disappearing', () => {
    const view = viewOf([{ ruleId: 'x', label: 'Nova', kind: 'something_new', vote: 1 }]);
    expect(view.specialists.map((specialist) => specialist.name)).toEqual(['Outras regras']);
  });

  test('votes become the four looks: a favor, contra, neutro and sem leitura', () => {
    const view = viewOf([
      { ruleId: 'a', label: 'A', kind: 'rsi', vote: 1 },
      { ruleId: 'b', label: 'B', kind: 'rsi', vote: -1 },
      { ruleId: 'c', label: 'C', kind: 'rsi', vote: 0 },
      { ruleId: 'd', label: 'D', kind: 'rsi', vote: 0, isMissing: true },
    ]);
    expect(view.specialists[0]?.rules.map((rule) => rule.voteKind)).toEqual([
      'favor',
      'against',
      'neutral',
      'unread',
    ]);
  });

  test('tone: voter when a counted rule voted, normal when all are neutral, quiet when none counts', () => {
    expect(viewOf([RSI_AGAINST]).specialists[0]?.tone).toBe('voter');
    expect(viewOf([{ ...RSI_AGAINST, vote: 0 }]).specialists[0]?.tone).toBe('normal');
    expect(viewOf([{ ...RSI_AGAINST, weight: '0' }]).specialists[0]?.tone).toBe('quiet');
    expect(viewOf([{ ...RSI_AGAINST, isMissing: true }]).specialists[0]?.tone).toBe('quiet');
  });

  test('the placard repeats the server weights and says "fora do placar" when nothing counts', () => {
    expect(viewOf([RSI_AGAINST]).specialists[0]?.placard).toBe('peso 1');
    expect(viewOf([{ ...RSI_AGAINST, weight: '0' }]).specialists[0]?.placard).toBe(
      'fora do placar',
    );
    const mixed = viewOf([RSI_AGAINST, { ...RSI_AGAINST, ruleId: 'b', weight: '2' }]);
    expect(mixed.specialists[0]?.placard).toBe('pesos 1 · 2');
  });

  test('no opinion when no counted rule voted', () => {
    expect(viewOf([{ ...RSI_AGAINST, vote: 0 }]).hasOpinion).toBe(false);
    expect(viewOf([RSI_AGAINST]).hasOpinion).toBe(true);
  });

  test('the summary of the scoreboard carries the server sentence and the score against the threshold', () => {
    const view = viewOf([RSI_AGAINST]);
    expect(view.analyst.name).toBe('Resumo do placar da estratégia');
    expect(view.analyst.outcome.word).toBe('Esperou');
    expect(view.analyst.scoreText).toBe('+1 de +2');
    expect(view.analyst.message).toBe('Faltou 1 ponto: o RSI (55) está entre 30 e 70.');
  });
});

function summaryOf(overrides: Record<string, unknown>): ReturnType<typeof buildAuditorView> {
  const parsed = projectionsSchema.parse(
    buildProjectionsResponse({ summary: buildProjectionsSummary(overrides) }),
  );
  return buildAuditorView(parsed.summary);
}

describe('sala da equipe: o auditor', () => {
  test('repeats the hit rate against the coin flip with the interval from the server', () => {
    const auditor = summaryOf({});
    expect(auditor.rateText).toBe('49,42% (171 de 346)');
    expect(auditor.coinText).toBe('50,00%');
    expect(auditor.look.word).toBe('Igual à moeda ao ar');
    expect(auditor.intervalText).toBe(
      'Com 95% de confiança, o acerto verdadeiro está entre 44,20% e 54,67%.',
    );
  });

  test('below 30 counted predictions there is no rate, only the count', () => {
    const auditor = summaryOf({ counted: 29, hits: 20, verdict: 'too_few', wilson: null });
    expect(auditor.rateText).toBe('— (29 contadas)');
    expect(auditor.look.word).toBe('Poucas previsões');
    expect(auditor.intervalText).toBeUndefined();
  });
});

describe('sala da equipe: a sequência da vela nova', () => {
  test('the whole sequence, with the announcement, fits in 1.8 seconds up to five seats', () => {
    for (const seats of [1, 2, 3, 4, 5]) {
      expect(totalMilliseconds(seats, TEAM_ROOM_TIMELINE)).toBeLessThanOrEqual(
        MAX_SEQUENCE_MILLISECONDS,
      );
    }
  });

  test('the plan speaks seat by seat, then the summary thinks, speaks and returns to rest', () => {
    const plan = planSequence(2, TEAM_ROOM_TIMELINE);
    expect(plan.map((entry) => entry.step)).toEqual([1, 2, 3, 4, REST_STEP]);
    const times = plan.map((entry) => entry.at);
    expect(times).toEqual([...times].sort((left, right) => left - right));
  });

  test('seat states follow the step and rest means everybody has spoken', () => {
    expect(seatStateOf(0, 0)).toBe('thinking');
    expect(seatStateOf(0, 1)).toBe('spoken');
    expect(seatStateOf(1, 1)).toBe('thinking');
    expect(seatStateOf(3, REST_STEP)).toBe('spoken');
    expect(analystStateOf(2, 2)).toBe('idle');
    expect(analystStateOf(2, 3)).toBe('thinking');
    expect(analystStateOf(2, 4)).toBe('spoken');
    expect(analystStateOf(2, REST_STEP)).toBe('spoken');
  });
});

describe('sala da equipe: honestidade e código', () => {
  test('no new text promises, recommends or sounds sure', () => {
    const root = fileURLToPath(new URL('../src/runs/team-room', import.meta.url));
    const forbidden = /vai subir|vai cair|garantid|recomendamos|compre\b|confiante|lucro certo/i;
    const offenders = readdirSync(root)
      .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
      .filter((name) => forbidden.test(readFileSync(join(root, name), 'utf8')));
    expect(offenders).toEqual([]);
  });

  test('no Number, parseFloat or parseInt in the room: texts only move the comma', () => {
    const root = fileURLToPath(new URL('../src/runs/team-room', import.meta.url));
    const offenders = readdirSync(root)
      .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
      .filter((name) =>
        /\b(Number|parseFloat|parseInt)\s*\(|Number\.parse/.test(
          readFileSync(join(root, name), 'utf8'),
        ),
      );
    expect(offenders).toEqual([]);
  });
});
