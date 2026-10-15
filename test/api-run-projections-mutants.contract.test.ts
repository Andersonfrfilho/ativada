// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  PROJECTIONS_MUTANT_TARGET,
  STATISTICS_MUTANT_TARGET,
} from './fixtures/api-routes/api-routes-mutation.fixture.js';
import {
  removeMutantCopies,
  runSourceMutant,
  type MutantTarget,
  type MutantVerdict,
  type SourceEdit,
  type SourceMutant,
} from './fixtures/walk-forward/walk-forward-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 900_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: SourceMutant = { name: 'CONTROL', edits: [] };
const DIRECTORY = 'runs/projections';
const RULE = `${DIRECTORY}/projection-rule.ts`;
const MESSAGES = `${DIRECTORY}/projection-messages.ts`;
const SUMMARY = `${DIRECTORY}/projection-summary.ts`;
const ITEMS = `${DIRECTORY}/projection-items.ts`;
const CURRENT = `${DIRECTORY}/projection-current.ts`;
const CONTEXT = `${DIRECTORY}/projection-context.ts`;
const SEGMENTS = `${DIRECTORY}/threshold-segments.ts`;
const LINES = `${DIRECTORY}/strategy-layer-lines.ts`;
const PROJECTIONS_USE_CASE = `${DIRECTORY}/projections.use-case.ts`;
const PROJECTIONS_ROUTE = `${DIRECTORY}/projections.route.ts`;
const PROJECTIONS_SCHEMA = `${DIRECTORY}/projections.schema.ts`;
const LAYERS_USE_CASE = `${DIRECTORY}/strategy-layers.use-case.ts`;
const LAYERS_ROUTE = `${DIRECTORY}/strategy-layers.route.ts`;
const LAYERS_SCHEMA = `${DIRECTORY}/strategy-layers.schema.ts`;
const WILSON = 'wilson-interval.ts';
const USER_ACCESS = 'access: ROUTE_ACCESS.USER,';
const PUBLIC_ACCESS = 'access: ROUTE_ACCESS.PUBLIC,';
const FOREIGN_RUN_ERROR = "throw new Error('execução de outro dono');";

function edit(file: string, find: string, replace: string, occurrences = 1): SourceEdit[] {
  return [{ file, find, replace, occurrences }];
}

const ACCESS_AND_VALIDATION: readonly SourceMutant[] = [
  {
    name: 'PROJECTIONS_OF_FOREIGN_RUN_ANSWERS_DIFFERENTLY',
    edits: edit(
      CONTEXT,
      'if (run === undefined) throw new RunNotFoundError();',
      `if (run === undefined) ${FOREIGN_RUN_ERROR}`,
    ),
  },
  {
    name: 'PROJECTIONS_ROUTE_IS_PUBLIC',
    edits: edit(PROJECTIONS_ROUTE, USER_ACCESS, PUBLIC_ACCESS),
  },
  { name: 'LAYERS_ROUTE_IS_PUBLIC', edits: edit(LAYERS_ROUTE, USER_ACCESS, PUBLIC_ACCESS) },
  {
    name: 'PROJECTIONS_WITHOUT_RATE_LIMIT',
    edits: edit(PROJECTIONS_ROUTE, '    rateLimitPolicy: RATE_LIMIT_POLICY.RUN_LIVE_STATUS,\n', ''),
  },
  {
    name: 'LAYERS_WITHOUT_RATE_LIMIT',
    edits: edit(LAYERS_ROUTE, '    rateLimitPolicy: RATE_LIMIT_POLICY.RUN_CHART,\n', ''),
  },
  {
    name: 'PROJECTIONS_ACCEPT_ANY_QUERY',
    edits: edit(
      PROJECTIONS_SCHEMA,
      'z.strictObject(PAGE_QUERY_SHAPE)',
      'z.looseObject(PAGE_QUERY_SHAPE)',
    ),
  },
  {
    name: 'LAYERS_ACCEPT_ANY_QUERY',
    edits: edit(
      LAYERS_SCHEMA,
      '.strictObject({ ...RANGE_QUERY_SHAPE })',
      '.looseObject({ ...RANGE_QUERY_SHAPE })',
    ),
  },
  {
    name: 'PROJECTIONS_CURSOR_NOT_VALIDATED',
    edits: edit(
      PROJECTIONS_ROUTE,
      'if (query.cursor !== undefined && before === undefined) throw invalidCursorError();',
      '',
    ),
  },
  {
    name: 'PROJECTIONS_DEFAULT_PAGE_IS_NOT_24',
    edits: edit(
      PROJECTIONS_ROUTE,
      'query.limit ?? PROJECTIONS_PAGE_SIZE.DEFAULT',
      'query.limit ?? PROJECTIONS_PAGE_SIZE.MAXIMUM',
    ),
  },
  {
    name: 'PROJECTIONS_IGNORE_THE_LIMIT',
    edits: edit(PROJECTIONS_USE_CASE, 'limit: input.limit,', 'limit: 24,'),
  },
  {
    name: 'PROJECTIONS_IGNORE_THE_CURSOR',
    edits: edit(PROJECTIONS_USE_CASE, 'before: input.before,', 'before: undefined,'),
  },
  {
    name: 'PROJECTIONS_NEVER_RETURN_A_NEXT_CURSOR',
    edits: edit(
      PROJECTIONS_USE_CASE,
      'nextCursor: page.nextBefore === undefined ? null : encodeTimeCursor(page.nextBefore),',
      'nextCursor: null,',
    ),
  },
];

const LAYERS_RANGE_AND_LINES: readonly SourceMutant[] = [
  {
    name: 'LAYERS_CAP_OFF_BY_ONE',
    edits: edit(
      LAYERS_USE_CASE,
      'range.to - range.from > maximum',
      'range.to - range.from >= maximum',
    ),
  },
  {
    name: 'LAYERS_CAP_REMOVED',
    edits: edit(
      LAYERS_USE_CASE,
      'range.to - range.from > maximum',
      'range.to - range.from > maximum * 1000',
    ),
  },
  {
    name: 'LAYERS_DEFAULT_WINDOW_IS_HALF',
    edits: edit(LAYERS_USE_CASE, 'to - maximum)', 'to - maximum / 2)'),
  },
  {
    name: 'LAYERS_TO_NOT_CLIPPED_BEFORE_THE_DEFAULT_FROM',
    edits: edit(
      LAYERS_USE_CASE,
      'Math.min(query.to ?? runRange.to, runRange.to)',
      'query.to ?? runRange.to',
    ),
  },
  {
    name: 'LAYERS_THRESHOLDS_NOT_CLIPPED',
    edits: edit(
      LAYERS_USE_CASE,
      'from: Math.max(segment.from, range.from),',
      'from: segment.from,',
    ),
  },
  {
    name: 'LAYERS_ATR_FROM_THE_WRONG_KEY',
    edits: edit(
      LAYERS_USE_CASE,
      'readIndicatorText(row.indicators, RISK_ATR_INDICATOR_ID)',
      "readIndicatorText(row.indicators, 'risk:atx')",
    ),
  },
  {
    name: 'LAYERS_EMPTY_VIEW_KEEPS_THE_LINES',
    edits: edit(
      LAYERS_USE_CASE,
      '    lines: [],\n  };\n}\n\n// As camadas do gráfico',
      '  };\n}\n\n// As camadas do gráfico',
    ),
  },
  {
    name: 'DONCHIAN_ROLES_SWAPPED',
    edits: edit(
      LINES,
      "{ output: 'upper', role: LAYER_LINE_ROLE.CHANNEL_UPPER, label: `${name}: topo` }",
      "{ output: 'upper', role: LAYER_LINE_ROLE.CHANNEL_LOWER, label: `${name}: topo` }",
    ),
  },
  {
    name: 'BOLLINGER_DEVIATIONS_WITH_A_DOT',
    edits: edit(LINES, 'formatPoints(rule.deviations)', 'rule.deviations'),
  },
  {
    name: 'WALK_FORWARD_LABELS_ALWAYS_KEEP_THE_NUMBERS',
    edits: edit(
      LINES,
      'return used !== undefined && canonicalJson(used) === original;',
      'return true;',
    ),
  },
  {
    name: 'FIRST_THRESHOLD_SEGMENT_STARTS_AT_THE_RUN_START',
    edits: edit(
      SEGMENTS,
      'from: runRange.from - params.durationMilliseconds',
      'from: runRange.from',
    ),
  },
  {
    name: 'WALK_FORWARD_WINDOWS_USE_THE_BASE_THRESHOLDS',
    edits: edit(
      SEGMENTS,
      'toSegment({ from: window.testStart, to: window.testEnd }, config)',
      'toSegment({ from: window.testStart, to: window.testEnd }, params.base)',
    ),
  },
  {
    name: 'WALK_FORWARD_PARKED_WINDOW_INCLUDED',
    edits: edit(SEGMENTS, 'window.status === WALK_FORWARD_WINDOW_STATUS.OK', 'true'),
  },
];

const RULE_ARITHMETIC: readonly SourceMutant[] = [
  {
    name: 'STRENGTH_HALF_IS_STRONG',
    edits: edit(
      RULE,
      'score.times(2).lessThanOrEqualTo(threshold)',
      'score.times(2).lessThan(threshold)',
    ),
  },
  {
    name: 'STRENGTH_LIMIT_IS_STRONG',
    edits: edit(
      RULE,
      'return score.lessThan(threshold) ?',
      'return score.lessThanOrEqualTo(threshold) ?',
    ),
  },
  {
    name: 'SELL_USES_THE_BUY_THRESHOLD',
    edits: edit(
      RULE,
      'side === PROJECTION_SIDE.SELL ? thresholds.sell : thresholds.buy',
      'thresholds.buy',
    ),
  },
  {
    name: 'ZERO_SCORE_HAS_A_SIDE',
    edits: edit(RULE, '  if (value.isZero()) return PROJECTION_SIDE.NONE;\n', ''),
  },
  {
    name: 'STANCE_IGNORES_THE_POSITION',
    edits: edit(RULE, 'if (params.isHolding) return', 'if (false as boolean) return'),
  },
  {
    name: 'BAND_LOW_ROUNDED_UP',
    edits: edit(
      RULE,
      'close.minus(atr).toDecimalPlaces(PROJECTION_BAND_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR)',
      'close.minus(atr).toDecimalPlaces(PROJECTION_BAND_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL)',
    ),
  },
  {
    name: 'BAND_HIGH_ROUNDED_DOWN',
    edits: edit(
      RULE,
      'close.plus(atr).toDecimalPlaces(PROJECTION_BAND_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL)',
      'close.plus(atr).toDecimalPlaces(PROJECTION_BAND_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR)',
    ),
  },
  {
    name: 'INSIDE_EXCLUDES_THE_LOW_BORDER',
    edits: edit(
      RULE,
      'next.greaterThanOrEqualTo(params.band.low)',
      'next.greaterThan(params.band.low)',
    ),
  },
  {
    name: 'INSIDE_EXCLUDES_THE_HIGH_BORDER',
    edits: edit(
      RULE,
      'next.lessThanOrEqualTo(params.band.high)',
      'next.lessThan(params.band.high)',
    ),
  },
  {
    name: 'TIE_COUNTED_AS_A_MOVE',
    edits: edit(RULE, '  if (difference.isZero()) return PROJECTION_RESULT.TIE;\n', ''),
  },
  {
    name: 'SELL_JUDGED_LIKE_BUY',
    edits: edit(RULE, 'wentUp === (params.side === PROJECTION_SIDE.BUY)', 'wentUp === true'),
  },
  {
    name: 'RATES_ROUNDED_UP',
    edits: edit(
      RULE,
      'rate.toDecimalPlaces(PROJECTION_RATE_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR)',
      'rate.toDecimalPlaces(PROJECTION_RATE_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL)',
      2,
    ),
  },
  {
    name: 'RATES_WITH_THREE_PLACES',
    edits: edit(
      `${DIRECTORY}/projections.constant.ts`,
      'PROJECTION_RATE_DECIMAL_PLACES = 4',
      'PROJECTION_RATE_DECIMAL_PLACES = 3',
    ),
  },
  {
    name: 'BAND_WITH_TWO_PLACES',
    edits: edit(
      `${DIRECTORY}/projections.constant.ts`,
      'PROJECTION_BAND_DECIMAL_PLACES = 8',
      'PROJECTION_BAND_DECIMAL_PLACES = 2',
    ),
  },
];

const SUMMARY_ITEMS_AND_CURRENT: readonly SourceMutant[] = [
  {
    name: 'COUNTED_INCLUDES_THE_TIES',
    edits: edit(
      SUMMARY,
      'const counted = counts.hits + counts.misses;',
      'const counted = counts.hits + counts.misses + counts.ties;',
    ),
  },
  {
    name: 'VERDICT_ALWAYS_ABOVE',
    edits: edit(SUMMARY, 'verdict: judgement.verdict,', "verdict: 'above' as const,"),
  },
  {
    name: 'STRENGTH_ORDER_REVERSED',
    edits: edit(
      SUMMARY,
      'PROJECTION_STRENGTH.WEAK,\n  PROJECTION_STRENGTH.STRONG,\n  PROJECTION_STRENGTH.DECIDED,',
      'PROJECTION_STRENGTH.DECIDED,\n  PROJECTION_STRENGTH.STRONG,\n  PROJECTION_STRENGTH.WEAK,',
    ),
  },
  {
    name: 'PENDING_LAST_CANDLE_REPORTED_AS_GAP',
    edits: edit(
      ITEMS,
      'row.candleTime + params.durationMilliseconds >= params.rangeEnd',
      'row.candleTime + params.durationMilliseconds > params.rangeEnd',
    ),
  },
  {
    name: 'GAP_NEVER_REPORTED',
    edits: edit(
      ITEMS,
      'isOutside ? PROJECTION_RESULT.PENDING : PROJECTION_RESULT.GAP',
      'PROJECTION_RESULT.PENDING',
    ),
  },
  {
    name: 'CURRENT_FOR_ANY_RUN_STATUS',
    edits: edit(CURRENT, 'run.status === RUN_STATUS.RUNNING', 'true'),
  },
  {
    name: 'CURRENT_FOR_ANY_RUN_KIND',
    edits: edit(CURRENT, 'run.kind === RUN_KIND.LIVE_PAPER && run.status', 'run.status'),
  },
  {
    name: 'HORIZON_ENDS_AFTER_ONE_CANDLE',
    edits: edit(CURRENT, '2 * params.durationMilliseconds', '1 * params.durationMilliseconds'),
  },
  {
    name: 'WARMING_UP_SAYS_NO_CANDLE',
    edits: edit(
      CURRENT,
      '      : PROJECTION_UNAVAILABLE_REASON.WARMING_UP;',
      '      : PROJECTION_UNAVAILABLE_REASON.NO_CANDLE;',
    ),
  },
  {
    name: 'OLDER_PAGE_REPEATS_THE_CURRENT_OF_ITS_OWN_ROWS',
    edits: edit(
      PROJECTIONS_USE_CASE,
      'input.before === undefined\n      ? params.page.items[0]',
      'true\n      ? params.page.items[0]',
    ),
  },
];

const PHRASES: readonly SourceMutant[] = [
  {
    name: 'WEAK_LABEL_SAYS_STRONG',
    edits: edit(
      MESSAGES,
      "[PROJECTION_STRENGTH.WEAK]: 'fraco'",
      "[PROJECTION_STRENGTH.WEAK]: 'forte'",
    ),
  },
  {
    name: 'SELL_REASON_SAYS_BUY',
    edits: edit(MESSAGES, "[PROJECTION_SIDE.SELL]: 'vender'", "[PROJECTION_SIDE.SELL]: 'comprar'"),
  },
  {
    name: 'POSITIVE_SCORE_WITHOUT_THE_PLUS',
    edits: edit(MESSAGES, '`+${formatPoints(text)}`', 'formatPoints(text)'),
  },
  {
    name: 'SUMMARY_WITHOUT_THE_COIN_FLIP_REFERENCE',
    edits: edit(MESSAGES, "    'Moeda ao ar: 50%.',\n", ''),
  },
  {
    name: 'HISTORY_RUN_SAYS_THE_LIVE_PHRASE',
    edits: edit(
      MESSAGES,
      'const isHistory = params.reason === PROJECTION_UNAVAILABLE_REASON.NOT_RUNNING && !params.isLive;',
      'const isHistory = false as boolean;',
    ),
  },
];

const STATISTICS: readonly SourceMutant[] = [
  {
    name: 'COIN_FLIP_MINIMUM_IS_29',
    edits: edit(WILSON, 'COIN_FLIP_MINIMUM_COUNTED = 30', 'COIN_FLIP_MINIMUM_COUNTED = 29'),
  },
  {
    name: 'WILSON_Z_SQUARED_OFF',
    edits: edit(WILSON, 'numerator: 2401n', 'numerator: 2400n'),
  },
  {
    name: 'BELOW_REPORTED_AS_ABOVE',
    edits: edit(
      WILSON,
      'return 2n * hits > counted ? COIN_FLIP_VERDICT.ABOVE : COIN_FLIP_VERDICT.BELOW;',
      'return COIN_FLIP_VERDICT.ABOVE;',
    ),
  },
  {
    name: 'WILSON_ACCEPTS_MORE_SUCCESSES_THAN_TOTAL',
    edits: edit(WILSON, 'if (!isValid || successes > total) {', 'if (!isValid) {'),
  },
];

const API_MUTANTS: readonly SourceMutant[] = [
  ...ACCESS_AND_VALIDATION,
  ...LAYERS_RANGE_AND_LINES,
  ...RULE_ARITHMETIC,
  ...SUMMARY_ITEMS_AND_CURRENT,
  ...PHRASES,
];

type Suite = { readonly target: MutantTarget; readonly mutants: readonly SourceMutant[] };
const SUITES: readonly Suite[] = [
  { target: PROJECTIONS_MUTANT_TARGET, mutants: API_MUTANTS },
  { target: STATISTICS_MUTANT_TARGET, mutants: STATISTICS },
];

for (const { target, mutants } of SUITES) {
  describe(`camadas e previsão (${target.directoryPrefix}): o contrato reprova cada mutante do código de produção`, () => {
    const verdicts = new Map<string, MutantVerdict>();

    beforeAll(async () => {
      const queue = [CONTROL, ...mutants];
      const worker = async (): Promise<void> => {
        for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
          verdicts.set(next.name, await runSourceMutant(target, next));
        }
      };
      await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
    }, MUTANT_TIMEOUT_MILLISECONDS);

    afterAll(() => removeMutantCopies(target));

    test('a cópia sem edição passa nos mesmos testes: o arnês é sólido', () => {
      expect(verdicts.get(CONTROL.name)).toStrictEqual({
        exitCode: 0,
        failedTests: 0,
        hasLoadError: false,
      });
    });

    test.each(mutants.map((mutant) => [mutant.name, mutant] as const))('%s', (_name, mutant) => {
      const verdict = verdicts.get(mutant.name);
      expect(verdict?.hasLoadError).toBe(false);
      expect(verdict?.exitCode).not.toBe(0);
      expect(verdict?.failedTests ?? 0).toBeGreaterThan(0);
    });

    test('os nomes são distintos', () => {
      expect(new Set(mutants.map((mutant) => mutant.name)).size).toBe(mutants.length);
    });
  });
}
