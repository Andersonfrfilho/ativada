// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { DATABASE_CONNECTION_MUTANT_TARGET } from './fixtures/database-connection/database-connection-mutation.fixture.js';
import {
  removeMutantCopies,
  runSourceMutant,
  type MutantVerdict,
  type SourceEdit,
  type SourceMutant,
} from './fixtures/walk-forward/walk-forward-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 900_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: SourceMutant = { name: 'CONTROL', edits: [] };
const CONNECTION = 'connection';
const GATE = `${CONNECTION}/connection-gate.ts`;
const RESILIENT = `${CONNECTION}/resilient-database.ts`;
const BACKOFF = `${CONNECTION}/reconnect-backoff.ts`;
const CONNECTION_ERROR = `${CONNECTION}/connection-error.ts`;
const OUTAGE_LOG = `${CONNECTION}/outage-log.ts`;
const SAFE_FIELDS = `${CONNECTION}/safe-error-fields.ts`;
const CONSTANT = `${CONNECTION}/connection.constant.ts`;
const STATEMENT_TIMEOUT = `${CONNECTION}/statement-timeout.ts`;
const TIMEOUT_CONFIRMATION =
  '  if (isAlive) recordSuccess(gate, fresh);\n  else registerFailure(gate, error);\n';
const TIMEOUT_REOPEN = '  reopen(gate);\n  const fresh = gate.current;\n';
const CONFIRMATION_CLIENT = 'await pingClient(fresh.client,';
const CONFIRMATION_FAILURE = '  } catch {\n    return false;\n  }\n';
const CONNECTION_SQLSTATES = '57P0[123]';
const THRESHOLD_REOPEN_LINE =
  '  if (gate.status.failures >= gate.settings.failureThreshold) reopen(gate);\n';
const ADMIT_LINE = 'if (status.isProbing || isBeforeNextAttempt) {';
const CLASSIFY_LINE =
  'if (!isDatabaseConnectionFailure(error) || isFailFastRejection(error)) return;';
const FAILURE_ENTRY_LINE =
  '    fields: { code, ...(errno === undefined ? {} : { errno }), failures, sinceMs },';
const JITTER_EXPRESSION = 'Math.round(ceiling / 2 + (ceiling / 2) * draw)';
const BACKOFF_STEP = 'params.baseMilliseconds * 2 ** (step - 1)';
const OUTAGE_ENTRY_END = '      episode = undefined;\n      return entry;';

function edit(file: string, find: string, replace: string): SourceEdit[] {
  return [{ file, find, replace, occurrences: 1 }];
}

const QUERY_CEILING_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'NO_TIME_CEILING_PER_UNIT',
    edits: edit(RESILIENT, '    }, params.milliseconds);', '    }, 2_147_483_647);'),
  },
  {
    name: 'TIMEOUT_DOES_NOT_REJECT',
    edits: edit(
      RESILIENT,
      '      reject(new DatabaseUnavailableError(DATABASE_UNAVAILABLE_CODE.QUERY_TIMEOUT));\n',
      '',
    ),
  },
];

const CONFIRMATION_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'TIMEOUT_GOES_DOWN_WITHOUT_CONFIRMING',
    edits: edit(RESILIENT, TIMEOUT_CONFIRMATION, '  registerFailure(gate, error);\n'),
  },
  {
    name: 'CONFIRMATION_ALWAYS_SAYS_ALIVE',
    edits: edit(RESILIENT, CONFIRMATION_FAILURE, '  } catch {\n    return true;\n  }\n'),
  },
  {
    name: 'CONFIRMATION_ON_THE_MUTE_CLIENT',
    edits: edit(RESILIENT, CONFIRMATION_CLIENT, 'await pingClient(slot.client,'),
  },
  {
    name: 'QUERY_CANCELED_IS_A_CONNECTION_FAILURE',
    edits: edit(CONNECTION_ERROR, CONNECTION_SQLSTATES, '57(P0[123]|014)'),
  },
  {
    name: 'STATEMENT_TIMEOUT_WITHOUT_MARGIN',
    edits: edit(
      CONSTANT,
      'STATEMENT_TIMEOUT_MARGIN_SECONDS = 5',
      'STATEMENT_TIMEOUT_MARGIN_SECONDS = 0',
    ),
  },
  {
    name: 'STATEMENT_TIMEOUT_WITHOUT_FLOOR',
    edits: edit(
      STATEMENT_TIMEOUT,
      '    MINIMUM_STATEMENT_TIMEOUT_SECONDS,\n    queryTimeoutSeconds',
      '    0,\n    queryTimeoutSeconds',
    ),
  },
];

const REOPEN_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'NEVER_REOPENS_AFTER_THE_THRESHOLD',
    edits: edit(GATE, THRESHOLD_REOPEN_LINE, ''),
  },
  {
    name: 'TIMEOUT_DOES_NOT_REOPEN',
    edits: edit(RESILIENT, TIMEOUT_REOPEN, '  const fresh = gate.current;\n'),
  },
  {
    name: 'THRESHOLD_OFF_BY_ONE',
    edits: edit(
      GATE,
      'gate.status.failures >= gate.settings.failureThreshold',
      'gate.status.failures > gate.settings.failureThreshold',
    ),
  },
  {
    name: 'NEW_UNITS_STILL_GO_TO_THE_OLD_CLIENT',
    edits: edit(GATE, '  gate.current = createSlot(gate.settings.openClient());\n', ''),
  },
  {
    name: 'OLD_CLIENT_NEVER_CLOSED',
    edits: edit(GATE, '  void closeClient(slot.client);\n', ''),
  },
];

const IN_FLIGHT_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'SWAP_CLOSES_THE_OLD_CLIENT_WITH_A_TRANSACTION_IN_FLIGHT',
    edits: edit(GATE, '  if ([...slot.units].some((unit) => !unit.isAbandoned)) return;\n', ''),
  },
  {
    name: 'ECHO_OF_A_RETIRED_CLIENT_MOVES_THE_STATE',
    edits: edit(
      GATE,
      'export function recordFailure(gate: Gate, slot: Slot, error: unknown): void {\n  if (slot !== gate.current) return;\n',
      'export function recordFailure(gate: Gate, slot: Slot, error: unknown): void {\n',
    ),
  },
  {
    name: 'SUCCESS_OF_A_RETIRED_CLIENT_MARKS_UP',
    edits: edit(
      GATE,
      'export function recordSuccess(gate: Gate, slot: Slot): void {\n  if (slot !== gate.current) return;\n',
      'export function recordSuccess(gate: Gate, slot: Slot): void {\n',
    ),
  },
];

const CLOSED_GATE_LINE =
  '  if (gate.isClosed) throw new DatabaseUnavailableError(DATABASE_UNAVAILABLE_CODE.UNAVAILABLE);\n';
const REOPEN_SIGNATURE = 'function reopen(gate: Gate): void {\n';

const CLOSE_MUTANTS: readonly SourceMutant[] = [
  { name: 'ADMITS_UNITS_AFTER_CLOSE', edits: edit(GATE, CLOSED_GATE_LINE, '') },
  {
    name: 'REOPENS_A_CLIENT_AFTER_CLOSE',
    edits: edit(GATE, `${REOPEN_SIGNATURE}  if (gate.isClosed) return;\n`, REOPEN_SIGNATURE),
  },
];

const GATE_MUTANTS: readonly SourceMutant[] = [
  { name: 'DOWN_DOES_NOT_FAIL_FAST', edits: edit(GATE, ADMIT_LINE, 'if (false as boolean) {') },
  { name: 'MANY_PROBES_AT_ONCE', edits: edit(GATE, ADMIT_LINE, 'if (isBeforeNextAttempt) {') },
  {
    name: 'PROBE_BEFORE_THE_BACKOFF_ENDS',
    edits: edit(GATE, ADMIT_LINE, 'if (status.isProbing) {'),
  },
  {
    name: 'QUERY_ERROR_COUNTS_AS_A_CONNECTION_FAILURE',
    edits: edit(GATE, CLASSIFY_LINE, 'if (isFailFastRejection(error)) return;'),
  },
  {
    name: 'FAIL_FAST_COUNTS_AS_A_NEW_FAILURE',
    edits: edit(GATE, CLASSIFY_LINE, 'if (!isDatabaseConnectionFailure(error)) return;'),
  },
  { name: 'SUCCESS_KEEPS_THE_FAILURES', edits: edit(GATE, '  status.failures = 0;\n', '') },
  {
    name: 'SUCCESS_KEEPS_THE_DOWN_STATE',
    edits: edit(
      GATE,
      '  status.state = DATABASE_CONNECTION_STATE.UP;\n  status.failures',
      '  status.failures',
    ),
  },
  {
    name: 'FAILURE_CODE_NOT_KEPT',
    edits: edit(GATE, '  status.lastFailureCode = fields.code;\n', ''),
  },
];

const BACKOFF_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'BACKOFF_WITHOUT_CEILING',
    edits: edit(BACKOFF, `Math.min(${BACKOFF_STEP}, params.maxMilliseconds)`, BACKOFF_STEP),
  },
  {
    name: 'BACKOFF_NEVER_GROWS',
    edits: edit(BACKOFF, BACKOFF_STEP, 'params.baseMilliseconds'),
  },
  {
    name: 'BACKOFF_JITTER_IGNORED',
    edits: edit(BACKOFF, JITTER_EXPRESSION, 'Math.round(ceiling)'),
  },
  {
    name: 'BACKOFF_JITTER_BELOW_HALF',
    edits: edit(BACKOFF, JITTER_EXPRESSION, 'Math.round((ceiling / 2) * draw)'),
  },
  {
    name: 'BACKOFF_DRAW_NOT_CLAMPED',
    edits: edit(BACKOFF, 'Math.min(1, Math.max(0, params.random))', 'params.random'),
  },
  {
    name: 'BACKOFF_ATTEMPT_ZERO_NOT_FLOORED',
    edits: edit(BACKOFF, 'Math.max(1, Math.floor(params.attempt))', 'Math.floor(params.attempt)'),
  },
];

const CLASSIFICATION_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'REFUSED_NOT_A_CONNECTION_FAILURE',
    edits: edit(CONNECTION_ERROR, "  'ERR_POSTGRES_CONNECTION_REFUSED',\n", ''),
  },
  {
    name: 'CLOSED_NOT_A_CONNECTION_FAILURE',
    edits: edit(CONNECTION_ERROR, "  'ERR_POSTGRES_CONNECTION_CLOSED',\n", ''),
  },
  {
    name: 'CONNECTION_TIMEOUT_NOT_A_CONNECTION_FAILURE',
    edits: edit(CONNECTION_ERROR, "  'ERR_POSTGRES_CONNECTION_TIMEOUT',\n", ''),
  },
  {
    name: 'EXPECTED_REQUEST_NOT_A_CONNECTION_FAILURE',
    edits: edit(CONNECTION_ERROR, "  'ERR_POSTGRES_EXPECTED_REQUEST',\n", ''),
  },
  {
    name: 'ADMIN_SHUTDOWN_SQLSTATE_IGNORED',
    edits: edit(CONNECTION_ERROR, '57P0[123]', '57P0[23]'),
  },
  {
    name: 'CONNECTION_CLASS_08_IGNORED',
    edits: edit(CONNECTION_ERROR, '(08[0-9A-Z]{3}|57P0[123])', '(57P0[123])'),
  },
  {
    name: 'ERRNO_NOT_READ',
    edits: edit(
      CONNECTION_ERROR,
      "for (const field of ['code', 'errno'])",
      "for (const field of ['code'])",
    ),
  },
  {
    name: 'CAUSE_NOT_FOLLOWED',
    edits: edit(
      SAFE_FIELDS,
      '    current = (current as { cause?: unknown }).cause;\n',
      '    current = undefined;\n',
    ),
  },
  {
    name: 'CAUSE_DEPTH_RAISED',
    edits: edit(CONSTANT, 'MAX_ERROR_CAUSE_DEPTH = 4', 'MAX_ERROR_CAUSE_DEPTH = 40'),
  },
  {
    name: 'TIMEOUT_CODE_NOT_A_CONNECTION_FAILURE',
    edits: edit(CONNECTION_ERROR, '  DATABASE_UNAVAILABLE_CODE.QUERY_TIMEOUT,\n', ''),
  },
];

const LOG_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'RAW_MESSAGE_IN_THE_LOG',
    edits: edit(
      OUTAGE_LOG,
      FAILURE_ENTRY_LINE,
      '    fields: { code, message: error instanceof Error ? error.message : "", failures, sinceMs },',
    ),
  },
  {
    name: 'CAUSE_MESSAGE_IN_THE_LOG',
    edits: edit(
      OUTAGE_LOG,
      FAILURE_ENTRY_LINE,
      '    fields: { code, detail: String(error), failures, sinceMs },',
    ),
  },
  {
    name: 'OUTER_ERROR_READ_INSTEAD_OF_THE_DRIVER_ERROR',
    edits: edit(
      SAFE_FIELDS,
      "const source = chain.findLast((level) => readToken(level, 'code') !== undefined) ?? chain[0];",
      'const source = chain[0];',
    ),
  },
  {
    name: 'UNSAFE_TOKEN_ACCEPTED',
    edits: edit(SAFE_FIELDS, '/^[A-Za-z0-9_.-]{1,64}$/', '/^[\\s\\S]{1,4096}$/'),
  },
  {
    name: 'EVERY_FAILURE_LOGGED',
    edits: edit(
      OUTAGE_LOG,
      '      if (nowMilliseconds - episode.lastLoggedAt < intervalMilliseconds) return undefined;\n',
      '',
    ),
  },
  {
    name: 'SUMMARY_WINDOW_NEVER_RESTARTS',
    edits: edit(OUTAGE_LOG, '      episode.lastLoggedAt = nowMilliseconds;\n', ''),
  },
  {
    name: 'FIRST_FAILURE_NOT_LOGGED',
    edits: edit(
      OUTAGE_LOG,
      '        return buildFailureEntry(error, 1, 0);',
      '        return undefined;',
    ),
  },
  {
    name: 'RECOVERY_LOGGED_WITHOUT_AN_OUTAGE',
    edits: edit(
      OUTAGE_LOG,
      '      if (episode === undefined) return undefined;\n      const entry',
      '      const entry',
    ),
  },
  {
    name: 'RECOVERY_NEVER_LOGGED',
    edits: edit(
      OUTAGE_LOG,
      OUTAGE_ENTRY_END,
      '      episode = undefined;\n      return undefined;',
    ),
  },
  {
    name: 'EPISODE_NOT_CLOSED_BY_THE_RECOVERY',
    edits: edit(OUTAGE_LOG, OUTAGE_ENTRY_END, '      return entry;'),
  },
];

const MUTANTS: readonly SourceMutant[] = [
  ...QUERY_CEILING_MUTANTS,
  ...CONFIRMATION_MUTANTS,
  ...REOPEN_MUTANTS,
  ...IN_FLIGHT_MUTANTS,
  ...CLOSE_MUTANTS,
  ...GATE_MUTANTS,
  ...BACKOFF_MUTANTS,
  ...CLASSIFICATION_MUTANTS,
  ...LOG_MUTANTS,
];

describe('reconexão do banco: os contratos reprovam cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  // Cada mutante é um processo `bun test` à parte (backoff, porteiro e resumo de queda); quatro de cada vez.
  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(DATABASE_CONNECTION_MUTANT_TARGET, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(() => removeMutantCopies(DATABASE_CONNECTION_MUTANT_TARGET));

  test('a cópia sem edição passa nos mesmos testes: o arnês é sólido', () => {
    expect(verdicts.get(CONTROL.name)).toStrictEqual({
      exitCode: 0,
      failedTests: 0,
      hasLoadError: false,
    });
  });

  test.each(MUTANTS.map((mutant) => [mutant.name, mutant] as const))('%s', (_name, mutant) => {
    const verdict = verdicts.get(mutant.name);
    expect(verdict?.hasLoadError).toBe(false);
    expect(verdict?.exitCode).not.toBe(0);
    expect(verdict?.failedTests ?? 0).toBeGreaterThan(0);
  });

  test('os nomes são distintos', () => {
    expect(new Set(MUTANTS.map((mutant) => mutant.name)).size).toBe(MUTANTS.length);
  });
});
