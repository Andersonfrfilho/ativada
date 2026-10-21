// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  LIVE_TEAM_JUDGE_TEST_FILES,
  removeLiveMutants,
  runLiveMutant,
  type LiveMutantVerdict,
  type LiveSourceEdit,
  type LiveSourceMutant,
} from './fixtures/live/live-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 1_800_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: LiveSourceMutant = { name: 'CONTROL', edits: [] };
const TEAM_STEP = 'team-step.ts';
const TEAM_DECISION = 'team-decision.ts';
const TEAM_CANDLE = 'team-candle-step.ts';
const TEAM_KIT = 'create-team-kit.ts';
const STEP = 'live-step.ts';
const PASS = 'live-pass.ts';

function edit(file: string, find: string, replace: string, occurrences = 1): LiveSourceEdit[] {
  return [{ file, find, replace, occurrences }];
}

// A execução de equipe no passo ao vivo (spec 015, plan D9): a decisão gravada vira sinal, a espera não dorme nem grava, o prazo é
// do banco, a entrada de cada vela entra na transação do passo e o replay lê só delas.
const MUTANTS: readonly LiveSourceMutant[] = [
  {
    name: 'TEAM_RUN_TAKES_THE_RULE_PATH',
    edits: edit(
      STEP,
      '  if (run.team !== undefined) return stepTeamOnce({ ...run, team: run.team }, cursor, candle);\n',
      '',
    ),
  },
  {
    name: 'TEAM_INPUT_NOT_RECORDED_IN_THE_STEP',
    edits: edit(
      TEAM_STEP,
      '    ...(params.teamInput === undefined ? {} : { teamInput: params.teamInput }),\n',
      '',
    ),
  },
  {
    name: 'AWAITING_TEAM_COMMITS_ANYWAY',
    edits: edit(TEAM_STEP, "  if (decision?.kind === 'awaiting') {", '  if (false as boolean) {'),
  },
  {
    name: 'AWAITING_TEAM_REPORTED_AS_ENDED',
    edits: edit(
      PASS,
      '  if (commit === LIVE_COMMIT_OUTCOME.AWAITING_TEAM)\n    return outcome(LIVE_PASS_KIND.AWAITING_TEAM, steps);\n',
      '',
    ),
  },
  {
    name: 'WARM_UP_ASKS_FOR_A_REPORT',
    edits: edit(
      TEAM_STEP,
      'const decision = real.signal === null ? undefined : await resolveTeamDecision(run.team, candle);',
      'const decision = await resolveTeamDecision(run.team, candle);',
    ),
  },
  {
    name: 'APPLIED_ACTION_ALWAYS_HOLD',
    edits: edit(
      TEAM_STEP,
      'appliedAction: step.teamSignal.action.toLowerCase(),',
      "appliedAction: 'hold',",
    ),
  },
  {
    name: 'STORED_INPUT_IGNORED_ON_REPLAY',
    edits: edit(
      TEAM_DECISION,
      '  if (stored !== undefined) return replayStored(kit, stored);\n',
      '',
    ),
  },
  {
    name: 'PENDING_REPORT_NEVER_AWAITED',
    edits: edit(TEAM_DECISION, "    if (!isPastDeadline) return { kind: 'awaiting' };\n", ''),
  },
  {
    name: 'ABSENT_REPORT_NEVER_AWAITED',
    edits: edit(
      TEAM_DECISION,
      "    return isPastDeadline ? noReading(NO_READING_CODE.MISSING) : { kind: 'awaiting' };",
      '    return noReading(NO_READING_CODE.MISSING);',
    ),
  },
  {
    name: 'LATE_DECISION_APPLIED',
    edits: edit(
      TEAM_DECISION,
      '  if (!report.isDecidedInTime) return noReading(TEAM_NO_READING.LATE, { reportId: report.id });\n',
      '',
    ),
  },
  {
    name: 'OFF_CADENCE_CANDLE_AWAITS_A_REPORT',
    edits: edit(
      TEAM_DECISION,
      '    if (!isOnCadence(kit, params.candle)) return noReading(TEAM_NO_READING.NOT_SCHEDULED);\n',
      '',
    ),
  },
  {
    name: 'FAILURE_CODE_OF_THE_REPORT_DROPPED',
    edits: edit(
      TEAM_DECISION,
      'return noReading(report.failureCode ?? TEAM_NO_READING.UNKNOWN, { reportId: report.id });',
      'return noReading(TEAM_NO_READING.UNKNOWN, { reportId: report.id });',
    ),
  },
  {
    name: 'DEADLINE_COUNTED_FROM_THE_OPEN_NOT_THE_CLOSE',
    edits: edit(
      TEAM_DECISION,
      'deadlineAt: candle.openTime + kit.candleMilliseconds + kit.settings.deadlineMilliseconds,',
      'deadlineAt: candle.openTime + kit.settings.deadlineMilliseconds,',
    ),
  },
  {
    name: 'REPORT_REQUESTED_FOR_ANOTHER_TEAM',
    edits: edit(TEAM_DECISION, 'teamKey: kit.team,', "teamKey: 'nina',"),
  },
  {
    name: 'POSITION_SEEN_BEFORE_THE_EXECUTIONS_OF_T',
    edits: edit(
      TEAM_CANDLE,
      'hasPosition: probe.state.position !== null,',
      'hasPosition: inputs.state.wallet.position !== null,',
    ),
  },
  {
    name: 'TEAM_SIGNAL_NEVER_APPLIED',
    edits: edit(
      TEAM_CANDLE,
      '  const signal = applyTeamSignal(real.signal, teamSignal);',
      '  const signal = real.signal;',
    ),
  },
  {
    name: 'CONFIRMED_GAP_NOT_DECLARED_TO_THE_SIGNAL',
    edits: edit(
      TEAM_CANDLE,
      'confirmedGapCandles: gapCandles > 0 ? gapCandles : undefined,',
      'confirmedGapCandles: undefined,',
    ),
  },
  {
    name: 'TEAM_RUN_WITH_ANOTHER_STRATEGY_ACCEPTED',
    edits: edit(
      TEAM_KIT,
      '  if (context.strategy.configHash !== MODEL_TEAM_STRATEGY.configHash) {',
      '  if (false as boolean) {',
    ),
  },
  {
    name: 'TEAM_RUN_WITHOUT_THE_WORKER_SETTINGS_ACCEPTED',
    edits: edit(
      TEAM_KIT,
      '  if (session.team === undefined || settings === undefined) {',
      '  if (session.team === undefined) {',
    ),
  },
  {
    name: 'SIGNAL_SOURCE_NEVER_READ',
    edits: edit(
      TEAM_KIT,
      '  const source = readSignalSource(context.run.request);',
      '  const source = readSignalSource(undefined);',
    ),
  },
];

describe('mutantes do passo da execução de equipe (spec 015)', () => {
  const verdicts = new Map<string, LiveMutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runLiveMutant(next, LIVE_TEAM_JUDGE_TEST_FILES));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(removeLiveMutants);

  test('the control copy (no edit) passes the same tests: the harness is sound', () => {
    expect(verdicts.get(CONTROL.name)).toStrictEqual({
      exitCode: 0,
      failedTests: 0,
      hasLoadError: false,
    });
  });

  test.each(MUTANTS.map((mutant) => [mutant.name, mutant] as const))('%s', (_name, mutant) => {
    const verdict = verdicts.get(mutant.name);
    expect(verdict?.problem).toBeUndefined();
    expect(verdict?.hasLoadError).toBe(false);
    expect(verdict?.exitCode).not.toBe(0);
    expect(verdict?.failedTests ?? 0).toBeGreaterThan(0);
  });

  test('os nomes são distintos', () => {
    expect(new Set(MUTANTS.map((mutant) => mutant.name)).size).toBe(MUTANTS.length);
  });
});
