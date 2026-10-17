// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { MODEL_AGENTS_MUTANT_TARGET } from './fixtures/model-agents/model-agents-mutation.fixture.js';
import {
  removeMutantCopies,
  runSourceMutant,
  type MutantVerdict,
  type SourceEdit,
  type SourceMutant,
} from './fixtures/walk-forward/walk-forward-mutation.fixture.js';

// T1.5 da spec 015: cada mutante é uma cópia de `packages/model-agents/src` com UMA regra quebrada; os contratos do pacote
// rodam contra ela num processo à parte e PRECISAM falhar. Mutante vivo = contrato frouxo.

const MUTANT_TIMEOUT_MILLISECONDS = 900_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: SourceMutant = { name: 'CONTROL', edits: [] };
const AUDITOR = 'opinion-auditor.ts';
const SIGNAL = 'team-signal.ts';
const LEVELS = 'team-levels.ts';
const HYGIENE = 'reason-hygiene.ts';
const COST = 'model-cost.ts';
const BUDGET = 'budget-policy.ts';
const CIRCUIT = 'provider-circuit.ts';
const SCHEMA = 'team-report.schema.ts';

function edit(file: string, find: string, replace: string, occurrences = 1): SourceEdit[] {
  return [{ file, find, replace, occurrences }];
}

const AUDITOR_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'AUDIT_COUNTS_ON_DEMAND',
    edits: edit(
      AUDITOR,
      'reading.kind !== OPINION_KIND.SCHEDULED || reading.status',
      'reading.status',
    ),
  },
  {
    name: 'AUDIT_COUNTS_HOLD',
    edits: edit(AUDITOR, 'return hasSide && reading.candleTime', 'return reading.candleTime'),
  },
  {
    name: 'AUDIT_WINDOW_START_EXCLUSIVE',
    edits: edit(AUDITOR, 'reading.candleTime >= windowStart', 'reading.candleTime > windowStart'),
  },
  {
    name: 'AUDIT_TIE_IS_NOT_DETECTED',
    edits: edit(AUDITOR, 'if (direction === 0) {', 'if (direction === 99) {'),
  },
  {
    name: 'AUDIT_SELL_JUDGED_LIKE_BUY',
    edits: edit(AUDITOR, 'direction > 0 === isBuy', 'direction > 0 !== isBuy'),
  },
  {
    name: 'AUDIT_GAP_COUNTS_AS_MISS',
    edits: edit(AUDITOR, 'tally.gaps += 1;', 'tally.gaps += 1;\n    tally.misses += 1;'),
  },
  {
    name: 'AUDIT_RATE_ROUNDS_UP',
    edits: edit(
      AUDITOR,
      'RATE_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR',
      'RATE_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL',
    ),
  },
  {
    name: 'AUDIT_VERDICT_COUNTS_TIES_AS_HITS',
    edits: edit(AUDITOR, 'hits: tally.hits, counted', 'hits: tally.hits + tally.ties, counted'),
  },
  {
    name: 'AUDIT_CONFIDENCE_ON_HIT_GOES_TO_MISS',
    edits: edit(
      AUDITOR,
      'tally.hitConfidenceSum += confidence;',
      'tally.missConfidenceSum += confidence;',
    ),
  },
];

const SIGNAL_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'SIGNAL_BUY_WITH_POSITION_IS_NOT_IGNORED',
    edits: edit(SIGNAL, 'TEAM_ACTION.BUY && params.hasPosition', 'TEAM_ACTION.BUY && false'),
  },
  {
    name: 'SIGNAL_SELL_WITHOUT_POSITION_SHORTS',
    edits: edit(SIGNAL, 'TEAM_ACTION.SELL && !params.hasPosition', 'TEAM_ACTION.SELL && false'),
  },
  {
    name: 'SIGNAL_SELL_SCORE_HAS_THE_BUY_SIGN',
    edits: edit(SIGNAL, "SELL: '-100'", "SELL: '100'"),
  },
  {
    name: 'SIGNAL_PENDING_IS_REPORTED_AS_MISSING',
    edits: edit(
      SIGNAL,
      'noReading(params, NO_READING_CODE.PENDING)',
      'noReading(params, NO_READING_CODE.MISSING)',
    ),
  },
  {
    name: 'SIGNAL_FAILURE_CODE_IS_DROPPED',
    edits: edit(
      SIGNAL,
      'noReading(params, record.failureCode)',
      'noReading(params, NO_READING_CODE.MISSING)',
    ),
  },
  {
    name: 'SIGNAL_LOOKS_AT_THE_NEXT_CANDLE',
    edits: edit(
      SIGNAL,
      'candleOpenTime: params.candleOpenTime,',
      'candleOpenTime: params.candleOpenTime + 900_000,',
      3,
    ),
  },
];

const LEVELS_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'LEVELS_STOP_EQUAL_TO_ENTRY_ALLOWED',
    edits: edit(LEVELS, 'stop.lessThan(entry)', 'stop.lessThanOrEqualTo(entry)'),
  },
  {
    name: 'LEVELS_TARGET_EQUAL_TO_ENTRY_ALLOWED',
    edits: edit(LEVELS, 'entry.lessThan(target)', 'entry.lessThanOrEqualTo(target)'),
  },
  {
    name: 'LEVELS_ENTRY_TOLERANCE_EXCLUSIVE',
    edits: edit(
      LEVELS,
      '.lessThanOrEqualTo(params.base.times(params.percent))',
      '.lessThan(params.base.times(params.percent))',
    ),
  },
  {
    name: 'LEVELS_MINIMUM_STOP_EXCLUSIVE',
    edits: edit(
      LEVELS,
      'greaterThanOrEqualTo(entry.times(params.minStopPercent))',
      'greaterThan(entry.times(params.minStopPercent))',
    ),
  },
  {
    name: 'LEVELS_SELL_MAY_CARRY_PRICES',
    edits: edit(
      LEVELS,
      'return hasPrice ? LEVELS_VERDICT.INVALID : LEVELS_VERDICT.VALID;',
      'return LEVELS_VERDICT.VALID;',
    ),
  },
  {
    name: 'LEVELS_ENTRY_FAR_FROM_CLOSE_ALLOWED',
    edits: edit(LEVELS, 'return isNearClose && isStopFarEnough;', 'return isStopFarEnough;'),
  },
];

const HYGIENE_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'REASON_LIMIT_IS_161',
    edits: edit(SCHEMA, 'REPORT_TEXT_MAX_LENGTH = 160', 'REPORT_TEXT_MAX_LENGTH = 161'),
  },
  {
    name: 'CONFIDENCE_LIMIT_IS_101',
    edits: edit(SCHEMA, 'REPORT_CONFIDENCE_MAX = 100', 'REPORT_CONFIDENCE_MAX = 101'),
  },
  {
    name: 'HYGIENE_LINE_BREAK_GLUES_WORDS',
    edits: edit(HYGIENE, '[9, 10, 13, 0x2028, 0x2029]', '[9, 0x2028, 0x2029]'),
  },
  {
    name: 'HYGIENE_FORBIDDEN_WORD_IS_CASE_SENSITIVE',
    edits: edit(HYGIENE, 'const lowerText = text.toLowerCase();', 'const lowerText = text;'),
  },
  {
    name: 'HYGIENE_CERTEZA_IS_ALLOWED',
    edits: edit(HYGIENE, "'certeza',", "'certezaxx',"),
  },
  {
    name: 'HYGIENE_HIDDEN_ROLE_IS_NOT_REPORTED',
    edits: edit(HYGIENE, '.filter(([, result]) => result.reasonHidden)', '.filter(() => false)'),
  },
];

const MONEY_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'COST_ROUNDS_DOWN',
    edits: edit(
      COST,
      'COST_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL',
      'COST_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR',
    ),
  },
  {
    name: 'COST_THINKING_IS_FREE',
    edits: edit(
      COST,
      'outputTokens: usage.outputTokens + usage.thinkingTokens,',
      'outputTokens: usage.outputTokens,',
    ),
  },
  {
    name: 'RESERVATION_IGNORES_THE_THINKING_CEILING',
    edits: edit(
      COST,
      'outputTokens: params.maxOutputTokens + params.maxThinkingTokens,',
      'outputTokens: params.maxOutputTokens,',
    ),
  },
  {
    name: 'INPUT_ESTIMATE_ROUNDS_DOWN',
    edits: edit(COST, 'Math.ceil(promptLength', 'Math.floor(promptLength'),
  },
  {
    name: 'BUDGET_EXACT_LIMIT_IS_DENIED',
    edits: edit(BUDGET, '.greaterThan(params.limit)', '.greaterThanOrEqualTo(params.limit)'),
  },
  {
    name: 'BUDGET_MONTH_USES_THE_DAY_TOTAL',
    edits: edit(BUDGET, 'used: usage.monthUsd', 'used: usage.dayUsd'),
  },
];

const CIRCUIT_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'CIRCUIT_OPENS_ONLY_AT_FOUR_FAILURES',
    edits: edit(CIRCUIT, 'consecutiveFailuresToOpen: 3,', 'consecutiveFailuresToOpen: 4,'),
  },
  {
    name: 'CIRCUIT_RETRY_AFTER_IS_UNCAPPED',
    edits: edit(
      CIRCUIT,
      'Math.min(requested, CIRCUIT_RULES.rateLimitCapMilliseconds)',
      'requested',
    ),
  },
  {
    name: 'CIRCUIT_REJECTED_KEY_OPENS_ONLY_TEN_MINUTES',
    edits: edit(
      CIRCUIT,
      "openFor('key_rejected', nowMilliseconds, CIRCUIT_RULES.rejectedOpenMilliseconds)",
      "openFor('key_rejected', nowMilliseconds, CIRCUIT_RULES.unavailableOpenMilliseconds)",
    ),
  },
  {
    name: 'CIRCUIT_HALF_OPEN_ALLOWS_MANY_PROBES',
    edits: edit(
      CIRCUIT,
      "if (state.kind === 'half_open') return { isPermitted: false, state };",
      "if (state.kind === 'half_open') return { isPermitted: true, state };",
    ),
  },
  {
    name: 'CIRCUIT_PROBE_WAITS_ONE_MORE_MILLISECOND',
    edits: edit(
      CIRCUIT,
      'if (nowMilliseconds < state.until)',
      'if (nowMilliseconds <= state.until)',
    ),
  },
  {
    name: 'CIRCUIT_SUCCESS_KEEPS_THE_STATE',
    edits: edit(CIRCUIT, 'return createClosedCircuit();', 'return state;'),
  },
  {
    name: 'CIRCUIT_VIEW_IGNORES_EXPIRY',
    edits: edit(CIRCUIT, 'nowMilliseconds >= state.until', 'false'),
  },
];

const MUTANTS: readonly SourceMutant[] = [
  ...AUDITOR_MUTANTS,
  ...SIGNAL_MUTANTS,
  ...LEVELS_MUTANTS,
  ...HYGIENE_MUTANTS,
  ...MONEY_MUTANTS,
  ...CIRCUIT_MUTANTS,
];

describe('model-agents: o contrato reprova cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(MODEL_AGENTS_MUTANT_TARGET, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(() => removeMutantCopies(MODEL_AGENTS_MUTANT_TARGET));

  test('a cópia sem edição passa nos mesmos testes: o arnês é sólido', () => {
    expect(verdicts.get(CONTROL.name)).toStrictEqual({
      exitCode: 0,
      failedTests: 0,
      hasLoadError: false,
    });
  });

  test('são pelo menos 15 mutantes, todos com nome distinto', () => {
    expect(MUTANTS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(MUTANTS.map((mutant) => mutant.name)).size).toBe(MUTANTS.length);
  });

  test.each(MUTANTS.map((mutant) => [mutant.name, mutant] as const))('%s', (_name, mutant) => {
    const verdict = verdicts.get(mutant.name);
    expect(verdict?.hasLoadError).toBe(false);
    expect(verdict?.exitCode).not.toBe(0);
    expect(verdict?.failedTests ?? 0).toBeGreaterThan(0);
  });
});
