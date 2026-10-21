// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { ANALYST_GOLDEN } from './fixtures/risk-analyst/analyst-golden.fixture.js';
import {
  buildGoldenCases,
  GOLDEN_CASE_SPECS,
  recordGoldenCase,
} from './fixtures/risk-analyst/analyst-golden-cases.fixture.js';
import { summarizeAuditor } from './fixtures/risk-analyst/auditor-oracle.fixture.js';
import { loadRiskAnalystApi } from './fixtures/risk-analyst/risk-analyst-api.fixture.js';

const api = await loadRiskAnalystApi();
const cases = buildGoldenCases(api);

// T1.4 da spec 007 (RNF03): o dourado LITERAL da regra `analyst-1`. Mesma entrada, mesma decisão e mesmas frases, byte a
// byte, no recorte real de 15 min e num mercado sintético. Mudar a regra exige `analyst-2` e o dourado regravado
// (`bun run scripts/record-risk-analyst-golden.ts`).

const D = 900_000;
const SPECIALISTS = ['trend', 'reversion', 'volume', 'sentiment'] as const;

describe('dourado analyst-1', () => {
  test('os 12 casos do dourado são exatamente os do gravador', () => {
    expect(cases.map((golden) => golden.id)).toStrictEqual(
      GOLDEN_CASE_SPECS.map((spec) => spec.id),
    );
    expect(Object.keys(ANALYST_GOLDEN)).toStrictEqual(cases.map((golden) => golden.id));
  });

  for (const { id, input } of cases) {
    test(`${id}: decisão e frases iguais ao dourado`, () => {
      const golden = ANALYST_GOLDEN[id];
      if (golden === undefined) throw new Error(`sem dourado para ${id}`);
      expect(recordGoldenCase(api, input)).toBe(golden);
    });
  }

  for (const { id, input } of cases) {
    test(`${id}: a tabela da equipe repete o oráculo do auditor`, () => {
      const decision = api.decideAnalyst(input);
      const window = {
        decisionTime: input.candleTime,
        timeframeMilliseconds: D,
        windowCandles: 2880,
      };
      const expectations = [
        ...SPECIALISTS.map((key) => [key, input.team[key]] as const),
        ['strategy', input.strategyVotes] as const,
      ];
      for (const [key, series] of expectations) {
        const view = decision.specialists.find((candidate) => candidate.key === key);
        const oracle = summarizeAuditor(series, window);
        expect(view).toMatchObject({
          predictions: oracle.predictions,
          counted: oracle.counted,
          hits: oracle.hits,
          misses: oracle.misses,
          ties: oracle.ties,
          upMoves: oracle.upMoves,
          hitRate: oracle.hitRate,
          upRate: oracle.upRate,
          verdict: oracle.verdict,
          lower: oracle.lower,
          upper: oracle.upper,
          weight: key === 'strategy' ? '0' : oracle.weight,
        });
      }
    });
  }

  test('o dourado cobre o que importa: pausas, previsão a favor, o auditor aprovando e reprovando, saída por tempo', () => {
    const decisions = cases.map((golden) => api.decideAnalyst(golden.input));
    const postures = new Set(decisions.map((decision) => decision.posture));
    expect(postures.has('pause')).toBe(true);
    expect(postures.size).toBeGreaterThanOrEqual(3);
    const verdicts = new Set(
      decisions.flatMap((decision) => decision.specialists.map((view) => view.verdict)),
    );
    expect(verdicts.has('above')).toBe(true);
    expect(verdicts.has('below')).toBe(true);
    expect(decisions.some((decision) => decision.forecast.side === 'up')).toBe(true);
    expect(decisions.some((decision) => decision.timeExitDue)).toBe(true);
    const reasons = new Set<string>(decisions.map((decision) => decision.reason));
    for (const lock of ['daily_loss', 'loss_streak', 'trade_count', 'goal_room']) {
      expect(
        reasons.has(lock) ||
          decisions.some((d) => d.locks.some((l) => l.key === lock && l.isActive)),
      ).toBe(true);
    }
  });

  test('nenhum caso do dourado passa de 1 vezes o risco da estratégia', () => {
    for (const golden of cases) {
      const decision = api.decideAnalyst(golden.input);
      expect(['0', '0.25', '0.5', '1']).toContain(decision.riskScale);
    }
  });
});
