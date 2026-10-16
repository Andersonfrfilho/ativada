// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { RISK_ANALYST_MUTANT_TARGET } from './fixtures/risk-analyst/risk-analyst-mutation.fixture.js';
import {
  removeMutantCopies,
  runSourceMutant,
  type MutantVerdict,
  type SourceEdit,
  type SourceMutant,
} from './fixtures/walk-forward/walk-forward-mutation.fixture.js';

// T1.4 da spec 007 (plan D11): cada mutante é uma cópia de `packages/risk-analyst/src` com UMA regra quebrada; os contratos
// da regra `analyst-1` (leituras, equipe, auditor, travas, postura, decisão, frases, propriedades e dourado) rodam contra ela
// num processo à parte e PRECISAM falhar. Mutante vivo = contrato frouxo.

const MUTANT_TIMEOUT_MILLISECONDS = 900_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: SourceMutant = { name: 'CONTROL', edits: [] };
const READINGS = 'market-readings.ts';
const DECIMAL = 'analyst-decimal.ts';
const AUDITOR = 'accuracy-auditor.ts';
const TEAM = 'team-forecast.ts';
const POSTURE = 'posture-policy.ts';
const LOCKS = 'risk-locks.ts';
const COMMANDS = 'analyst-commands.ts';
const DECISION = 'analyst-decision.ts';
const SPECIALISTS = 'specialist-team.ts';
const CATALOG = 'specialist-catalog.ts';
const CONSTANT = 'analyst.constant.ts';
const MESSAGES = 'analyst-messages.ts';
const MESSAGE_CONSTANT = 'analyst-messages.constant.ts';

function edit(file: string, find: string, replace: string, occurrences = 1): SourceEdit[] {
  return [{ file, find, replace, occurrences }];
}

const READINGS_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'VOLUME_AVERAGE_INCLUDES_THE_CURRENT_CANDLE',
    edits: edit(
      READINGS,
      'candles.slice(index - average, index)',
      'candles.slice(index - average + 1, index + 1)',
    ),
  },
  {
    name: 'PERCENTILE_RANK_ROUNDS_DOWN',
    edits: edit(
      READINGS,
      'Math.ceil((percentile * sorted.length) / 100) - 1',
      'Math.floor((percentile * sorted.length) / 100) - 1',
    ),
  },
  {
    name: 'PERCENTILE_NEEDS_ONLY_95_SAMPLES',
    edits: edit(CONSTANT, 'percentileMinimumSamples: 96,', 'percentileMinimumSamples: 95,'),
  },
  {
    name: 'PERCENTILE_WINDOW_KEEPS_THE_OLD_EDGE',
    edits: edit(READINGS, 'reading.openTime <= windowStart', 'reading.openTime < windowStart'),
  },
  {
    name: 'DIVISION_ROUNDS_UP',
    edits: edit(
      DECIMAL,
      'ANALYST_RULES.decimalPlaces, EngineDecimal.ROUND_FLOOR',
      'ANALYST_RULES.decimalPlaces, EngineDecimal.ROUND_CEIL',
    ),
  },
  {
    name: 'MOMENTUM_SHORT_LOOKS_5_CANDLES_BACK',
    edits: edit(CONSTANT, 'momentumShortCandles: 4,', 'momentumShortCandles: 5,'),
  },
];

const AUDITOR_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'AUDITOR_COUNTS_THE_DECISION_CANDLE',
    edits: edit(
      AUDITOR,
      'reading.openTime <= decisionTime - duration',
      'reading.openTime <= decisionTime',
    ),
  },
  {
    name: 'AUDITOR_HORIZON_IS_THE_SAME_CANDLE',
    edits: edit(
      AUDITOR,
      'closeByOpen.get(reading.openTime + duration)',
      'closeByOpen.get(reading.openTime)',
    ),
  },
  {
    name: 'AUDITOR_WINDOW_ONE_CANDLE_SHORT',
    edits: edit(AUDITOR, '(windowCandles + 1) * duration', 'windowCandles * duration'),
  },
  {
    name: 'AUDITOR_TIE_COUNTS_AS_A_MISS',
    edits: edit(AUDITOR, 'if (direction === 0) {', 'if (direction === 2) {'),
  },
  {
    name: 'AUDITOR_RATE_ROUNDS_UP',
    edits: edit(
      AUDITOR,
      'RATE_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR',
      'RATE_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL',
    ),
  },
  {
    name: 'WEIGHT_PAID_TO_EVEN_AND_BELOW',
    edits: edit(
      AUDITOR,
      "if (verdict !== COIN_FLIP_VERDICT.ABOVE || lower === null) return '0';",
      "if (verdict === COIN_FLIP_VERDICT.TOO_FEW || lower === null) return '0';",
    ),
  },
  {
    name: 'WEIGHT_BASE_IS_0_4',
    edits: edit(CONSTANT, "weightBase: '0.5',", "weightBase: '0.4',"),
  },
  {
    name: 'SENTIMENT_NOT_CUT_AT_THE_CLOSE',
    edits: edit(
      SPECIALISTS,
      'insertionCutoff: candle.closeTime,',
      'insertionCutoff: Number.MAX_SAFE_INTEGER,',
    ),
  },
  {
    name: 'NEUTRAL_SCORE_VOTES_UP',
    edits: edit(SPECIALISTS, 'return value.isZero() ? 0 : 1;', 'return 1;'),
  },
  {
    name: 'GAP_NOT_DECLARED_TO_THE_ENGINE',
    edits: edit(
      SPECIALISTS,
      'previousOpenTime === undefined ? 0 : (candle.openTime - previousOpenTime) / duration - 1',
      '0',
    ),
  },
  {
    name: 'SERIES_ANCHOR_SLIDES_WITH_THE_CANDLE',
    edits: edit(
      SPECIALISTS,
      'Math.floor(earliest / seriesAnchorMilliseconds) * seriesAnchorMilliseconds',
      'earliest',
    ),
  },
  {
    name: 'BOLLINGER_USES_3_DEVIATIONS',
    edits: edit(CATALOG, "deviations: '2'", "deviations: '3'"),
  },
];

const TEAM_AND_POSTURE_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'SPLIT_TEAM_AT_EXACTLY_TWO_THIRDS',
    edits: edit(TEAM, 'winner.times(denominator).lt(', 'winner.times(denominator).lte('),
  },
  {
    name: 'FIRM_FORECAST_NEEDS_MORE_THAN_TWO_THIRDS',
    edits: edit(TEAM, 'winner.times(denominator).gte(', 'winner.times(denominator).gt('),
  },
  {
    name: 'STRATEGY_TREND_VOTES_IN_THE_TEAM',
    edits: edit(
      TEAM,
      'specialists.filter((view) => view.key !== STRATEGY_AUDIT_KEY)',
      'specialists.filter(() => true)',
    ),
  },
  {
    name: 'NEUTRALS_LEAVE_THE_PROVEN_WEIGHT',
    edits: edit(TEAM, 'proven: sumOf(() => true),', 'proven: sumOf((view) => view.vote !== 0),'),
  },
  {
    name: 'TOO_VOLATILE_AT_EXACTLY_THE_PERCENTILE',
    edits: edit(
      TEAM,
      'decimalOf(atrRate).gt(atrPercentile95)',
      'decimalOf(atrRate).gte(atrPercentile95)',
    ),
  },
  {
    name: 'TEAM_AGAINST_DOES_NOT_PAUSE',
    edits: edit(
      POSTURE,
      'return forecast.side === FORECAST_SIDE.DOWN ? pauseFor(ANALYST_REASON.TEAM_AGAINST) : null;',
      'return null;',
    ),
  },
  {
    name: 'QUIET_MARKET_AT_EXACTLY_0_4',
    edits: edit(
      POSTURE,
      '.lt(ANALYST_RULES.quietVolumeBelow)',
      '.lte(ANALYST_RULES.quietVolumeBelow)',
    ),
  },
  {
    name: 'CONFIDENT_NEEDS_MORE_THAN_1X_VOLUME',
    edits: edit(
      POSTURE,
      '.gte(ANALYST_RULES.confidentMinimumVolume)',
      '.gt(ANALYST_RULES.confidentMinimumVolume)',
    ),
  },
  {
    name: 'CONFIDENT_NEEDS_ATR_BELOW_THE_PERCENTILE_90',
    edits: edit(
      POSTURE,
      'decimalOf(atrRate).lte(atrPercentile90)',
      'decimalOf(atrRate).lt(atrPercentile90)',
    ),
  },
  {
    name: 'WEAK_AND_FIRM_FORECASTS_SWAPPED',
    edits: edit(
      POSTURE,
      'forecast.strength === FORECAST_STRENGTH.WEAK',
      'forecast.strength === FORECAST_STRENGTH.FIRM',
    ),
  },
  {
    name: 'FOUR_HOUR_CADENCE_AT_EXACTLY_0_7',
    edits: edit(
      POSTURE,
      'volume.lt(ANALYST_RULES.fourHourCadenceVolumeBelow)',
      'volume.lte(ANALYST_RULES.fourHourCadenceVolumeBelow)',
    ),
  },
  {
    name: 'HOUR_CADENCE_AT_EXACTLY_1_5',
    edits: edit(
      POSTURE,
      'volume.lt(ANALYST_RULES.hourCadenceVolumeBelow)',
      'volume.lte(ANALYST_RULES.hourCadenceVolumeBelow)',
    ),
  },
  {
    name: 'CADENCE_WINDOW_USES_THE_OPEN_TIME',
    edits: edit(
      POSTURE,
      'const closeTime = params.candleTime + CANDLE_MILLISECONDS;',
      'const closeTime = params.candleTime;',
    ),
  },
  {
    name: 'HOUR_CADENCE_IS_30_MINUTES',
    edits: edit(CONSTANT, 'hour: 60,', 'hour: 30,'),
  },
  {
    name: 'CONFIDENT_SIZE_ABOVE_THE_STRATEGY',
    edits: edit(CONSTANT, "normal: '0.5', confident: '1' }", "normal: '0.5', confident: '2' }"),
  },
];

const LOCK_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'DAILY_LOSS_NEEDS_MORE_THAN_1_PERCENT',
    edits: edit(
      LOCKS,
      'loss.gte(initial.times(ANALYST_RULES.dailyLossRate))',
      'loss.gt(initial.times(ANALYST_RULES.dailyLossRate))',
    ),
  },
  {
    name: 'DAILY_LOSS_LIMIT_IS_2_PERCENT',
    edits: edit(CONSTANT, "dailyLossRate: '0.01',", "dailyLossRate: '0.02',"),
  },
  {
    name: 'LOSS_STREAK_NEEDS_A_FOURTH_LOSS',
    edits: edit(
      LOCKS,
      'lossCount >= ANALYST_RULES.lossStreakLimit',
      'lossCount > ANALYST_RULES.lossStreakLimit',
    ),
  },
  {
    name: 'LOSS_STREAK_PAUSE_ONE_CANDLE_LONGER',
    edits: edit(
      LOCKS,
      'newest.closedCandleTime < pauseMilliseconds',
      'newest.closedCandleTime <= pauseMilliseconds',
    ),
  },
  {
    name: 'TRADE_COUNT_NEEDS_A_NINTH_TRADE',
    edits: edit(
      LOCKS,
      'count >= ANALYST_RULES.tradeCountLimit',
      'count > ANALYST_RULES.tradeCountLimit',
    ),
  },
  {
    name: 'TRADE_COUNT_WINDOW_KEEPS_THE_OLD_EDGE',
    edits: edit(LOCKS, 'openedCandleTime > oldest', 'openedCandleTime >= oldest'),
  },
  {
    name: 'GOAL_ROOM_AT_EXACTLY_TWO_TRADES',
    edits: edit(LOCKS, 'room.lt(equity.times(minimumRate))', 'room.lte(equity.times(minimumRate))'),
  },
  {
    name: 'MOVE_COST_AT_EXACTLY_TWICE_THE_COST',
    edits: edit(LOCKS, 'decimalOf(atrRate).lt(minimum)', 'decimalOf(atrRate).lte(minimum)'),
  },
  {
    name: 'MOVE_COST_NEVER_LOCKS',
    edits: edit(
      LOCKS,
      'isActive: atrRate !== null && decimalOf(atrRate).lt(minimum),',
      'isActive: false,',
    ),
  },
  {
    name: 'LOCK_ORDER_SWAPPED',
    edits: edit(
      LOCKS,
      'computeDailyLoss(context),\n    computeLossStreak(context),',
      'computeLossStreak(context),\n    computeDailyLoss(context),',
    ),
  },
];

const DECISION_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'TIME_EXIT_ONE_CANDLE_EARLY',
    edits: edit(
      DECISION,
      '(ANALYST_RULES.maxTradeCandles - 1) * CANDLE_MILLISECONDS',
      '(ANALYST_RULES.maxTradeCandles - 2) * CANDLE_MILLISECONDS',
    ),
  },
  {
    name: 'TIME_EXIT_ONE_CANDLE_LATE',
    edits: edit(
      DECISION,
      '(ANALYST_RULES.maxTradeCandles - 1) * CANDLE_MILLISECONDS',
      'ANALYST_RULES.maxTradeCandles * CANDLE_MILLISECONDS',
    ),
  },
  {
    name: 'RESUME_UNDOES_ANY_HALT',
    edits: edit(
      COMMANDS,
      'const isOwnHalt = wallet.isHalted && wallet.lastHaltReason === ANALYST_COMMAND_REASON.PAUSE;',
      'const isOwnHalt = wallet.isHalted;',
    ),
  },
  {
    name: 'TIME_EXIT_BLOCKED_BY_A_CLOSED_GATE',
    edits: edit(
      COMMANDS,
      'if (timeExitDue && wallet.hasPosition) {',
      'if (timeExitDue && wallet.hasPosition && entryGate === ENTRY_GATE.OPEN) {',
    ),
  },
  {
    name: 'HALT_REPEATED_ON_A_HALTED_WALLET',
    edits: edit(
      COMMANDS,
      'if (entryGate === ENTRY_GATE.CLOSED && !wallet.isHalted) {',
      'if (entryGate === ENTRY_GATE.CLOSED) {',
    ),
  },
];

const MESSAGE_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'LIBERADA_LABEL_IS_CONFIANTE',
    edits: edit(
      MESSAGE_CONSTANT,
      "[POSTURE.CONFIDENT]: 'LIBERADA',",
      "[POSTURE.CONFIDENT]: 'CONFIANTE',",
    ),
  },
  {
    name: 'MODERADA_LABEL_IS_NORMAL',
    edits: edit(MESSAGE_CONSTANT, "[POSTURE.NORMAL]: 'MODERADA',", "[POSTURE.NORMAL]: 'NORMAL',"),
  },
  {
    name: 'RISK_PERCENT_ROUNDS_DOWN',
    edits: edit(MESSAGES, 'formatTextPercent(riskRate, UP)', 'formatTextPercent(riskRate, DOWN)'),
  },
  {
    name: 'DISCLAIMER_LOSES_ITS_NEGATION',
    edits: edit(MESSAGE_CONSTANT, '; não é recomendação.', '; é recomendação.'),
  },
];

const MUTANTS: readonly SourceMutant[] = [
  ...READINGS_MUTANTS,
  ...AUDITOR_MUTANTS,
  ...TEAM_AND_POSTURE_MUTANTS,
  ...LOCK_MUTANTS,
  ...DECISION_MUTANTS,
  ...MESSAGE_MUTANTS,
];

describe('analyst-1: o contrato reprova cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(RISK_ANALYST_MUTANT_TARGET, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(() => removeMutantCopies(RISK_ANALYST_MUTANT_TARGET));

  test('a cópia sem edição passa nos mesmos testes: o arnês é sólido', () => {
    expect(verdicts.get(CONTROL.name)).toStrictEqual({
      exitCode: 0,
      failedTests: 0,
      hasLoadError: false,
    });
  });

  test('são pelo menos 20 mutantes, todos com nome distinto', () => {
    expect(MUTANTS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(MUTANTS.map((mutant) => mutant.name)).size).toBe(MUTANTS.length);
  });

  test.each(MUTANTS.map((mutant) => [mutant.name, mutant] as const))('%s', (_name, mutant) => {
    const verdict = verdicts.get(mutant.name);
    expect(verdict?.hasLoadError).toBe(false);
    expect(verdict?.exitCode).not.toBe(0);
    expect(verdict?.failedTests ?? 0).toBeGreaterThan(0);
  });
});
