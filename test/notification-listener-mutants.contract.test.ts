// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { DATABASE_LISTENER_MUTANT_TARGET } from './fixtures/postgres-wire/database-listener-mutation.fixture.js';
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
const NOTIFICATIONS = 'notifications';
const CONSTANT = `${NOTIFICATIONS}/postgres-wire.constant.ts`;
const ENCODE = `${NOTIFICATIONS}/postgres-wire-encode.ts`;
const DECODE = `${NOTIFICATIONS}/postgres-wire-decode.ts`;
const SCRAM = `${NOTIFICATIONS}/scram-sha-256.ts`;
const URL_FILE = `${NOTIFICATIONS}/parse-connection-url.ts`;
const SESSION = `${NOTIFICATIONS}/listen-session.ts`;
const AUTH = `${NOTIFICATIONS}/listen-session-auth.ts`;
const STARTUP = `${NOTIFICATIONS}/listen-session-startup.ts`;
const SESSION_END = `${NOTIFICATIONS}/session-end.ts`;
const END = `${NOTIFICATIONS}/listen-session-end.ts`;
const LISTENER = `${NOTIFICATIONS}/notification-listener.ts`;
const EVENT_SCHEMA = 'run-events/run-event.schema.ts';

function edit(file: string, find: string, replace: string): SourceEdit[] {
  return [{ file, find, replace, occurrences: 1 }];
}

const WIRE_MUTANTS: readonly SourceMutant[] = [
  { name: 'SSL_REQUEST_CODE_WRONG', edits: edit(CONSTANT, '80_877_103', '80_877_104') },
  { name: 'PROTOCOL_VERSION_WRONG', edits: edit(CONSTANT, '196_608', '196_609') },
  { name: 'TERMINATE_TYPE_WRONG', edits: edit(CONSTANT, "TERMINATE: 'X'", "TERMINATE: 'x'") },
  {
    name: 'QUERY_WITHOUT_TERMINATING_ZERO',
    edits: edit(
      ENCODE,
      'frame(FRONTEND_MESSAGE.QUERY, cString(text))',
      'frame(FRONTEND_MESSAGE.QUERY, TEXT_ENCODER.encode(text))',
    ),
  },
  {
    name: 'SASL_INITIAL_LENGTH_WRONG',
    edits: edit(ENCODE, 'int32(data.length), data]', 'int32(data.length + 1), data]'),
  },
  {
    name: 'FRAME_CEILING_NOT_ENFORCED',
    edits: edit(
      DECODE,
      'if (length < INT32_BYTES || length > maxFrameBytes)',
      'if (length < INT32_BYTES)',
    ),
  },
  {
    name: 'FRAME_FLOOR_NOT_ENFORCED',
    edits: edit(
      DECODE,
      'if (length < INT32_BYTES || length > maxFrameBytes)',
      'if (length > maxFrameBytes)',
    ),
  },
  {
    name: 'NOTIFICATION_PAYLOAD_TERMINATOR_NOT_CHECKED',
    edits: edit(DECODE, '  if (payloadEnd < 0) throw new WireProtocolError();\n', ''),
  },
  {
    name: 'NOTIFICATION_FIELDS_SWAPPED',
    edits: edit(
      DECODE,
      'channel: TEXT_DECODER.decode(body.slice(INT32_BYTES, channelEnd)),\n    payload: TEXT_DECODER.decode(body.slice(channelEnd + 1, payloadEnd)),',
      'channel: TEXT_DECODER.decode(body.slice(channelEnd + 1, payloadEnd)),\n    payload: TEXT_DECODER.decode(body.slice(INT32_BYTES, channelEnd)),',
    ),
  },
  {
    name: 'ERROR_TEXT_LEAKS_INSTEAD_OF_SQLSTATE',
    edits: edit(CONSTANT, "ERROR_FIELD_SQLSTATE = 'C'", "ERROR_FIELD_SQLSTATE = 'M'"),
  },
  {
    name: 'MD5_MISREAD_AS_OK',
    edits: edit(DECODE, "return { kind: 'md5' };", "return { kind: 'ok' };"),
  },
];

const SCRAM_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'SERVER_SIGNATURE_NOT_VERIFIED',
    edits: edit(
      SCRAM,
      'const isMatch =\n      received.length === expectedServerSignature.length &&\n      timingSafeEqual(received, expectedServerSignature);',
      'const isMatch = true;',
    ),
  },
  {
    name: 'SERVER_NONCE_NOT_CHECKED',
    edits: edit(
      SCRAM,
      'if (!nonce.startsWith(clientNonce) || nonce.length === clientNonce.length) {',
      'if (false as boolean) {',
    ),
  },
  {
    name: 'ITERATION_CEILING_REMOVED',
    edits: edit(SCRAM, ' &&\n    iterations <= SCRAM_MAXIMUM_ITERATIONS', ''),
  },
  {
    name: 'ITERATION_FLOOR_REMOVED',
    edits: edit(SCRAM, 'iterations >= SCRAM_MINIMUM_ITERATIONS', 'iterations >= 1'),
  },
  {
    name: 'USERNAME_NOT_ESCAPED',
    edits: edit(SCRAM, "username.replaceAll('=', '=3D').replaceAll(',', '=2C')", 'username'),
  },
  {
    name: 'NON_ASCII_PASSWORD_ACCEPTED',
    edits: edit(SCRAM, 'if (!ASCII_PATTERN.test(params.password)) {', 'if (false as boolean) {'),
  },
  { name: 'GS2_HEADER_WRONG', edits: edit(SCRAM, ": 'n,,';", ": 'y,,';") },
  {
    name: 'DOWNGRADE_HEADER_NOT_DECLARED',
    edits: edit(SCRAM, "? 'y,,' :", "? 'n,,' :"),
  },
  {
    name: 'CHANNEL_BINDING_PLUS_NEVER_CHOSEN',
    edits: edit(
      'notifications/listen-session-auth.ts',
      'hash !== undefined && offered.includes(SCRAM_PLUS_MECHANISM)',
      'false as boolean',
    ),
  },
  {
    name: 'CERTIFICATE_HASH_NOT_IN_THE_PROOF',
    edits: edit(
      SCRAM,
      "if (binding.mode !== 'tls-server-end-point') return header;",
      'return header;',
    ),
  },
  {
    name: 'SERVER_NAME_NOT_CHECKED_IN_THE_CERTIFICATE',
    edits: edit(
      'notifications/bun-postgres-transport.ts',
      'options.shouldVerify && !certificateMatchesHost(certificate, options.serverName)',
      'false as boolean',
    ),
  },
  {
    name: 'OWN_CA_NOT_PASSED_TO_TLS',
    edits: edit(
      'notifications/listen-session-startup.ts',
      '...(rootCertificate === undefined ? {} : { caCertificate: rootCertificate }),',
      '',
    ),
  },
  {
    name: 'CLIENT_KEY_LABEL_WRONG',
    edits: edit(SCRAM, "CLIENT_KEY_LABEL = 'Client Key'", "CLIENT_KEY_LABEL = 'Client key'"),
  },
  {
    name: 'CHANNEL_BINDING_WRONG',
    edits: edit(SCRAM, 'c=${channelBindingInput(binding).toBase64()}', 'c=bind'),
  },
];

const URL_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'UNKNOWN_SSLMODE_DOWNGRADES_SILENTLY',
    edits: edit(
      URL_FILE,
      'if (mode === undefined) throw new InvalidConnectionUrlError();',
      'if (mode === undefined) return SSL_MODE.PREFER;',
    ),
  },
  {
    name: 'VERIFY_FULL_DOES_NOT_VERIFY',
    edits: edit(URL_FILE, "'verify-full': SSL_MODE.VERIFY", "'verify-full': SSL_MODE.REQUIRE"),
  },
  {
    name: 'ALLOW_MEANS_DISABLE',
    edits: edit(URL_FILE, 'allow: SSL_MODE.PREFER', 'allow: SSL_MODE.DISABLE'),
  },
  {
    name: 'PASSWORD_NOT_DECODED',
    edits: edit(
      URL_FILE,
      'password: decodeURIComponent(parsed.password)',
      'password: parsed.password',
    ),
  },
  { name: 'USER_NOT_REQUIRED', edits: edit(URL_FILE, 'user.length === 0 || ', '') },
  {
    name: 'SCHEME_NOT_CHECKED',
    edits: edit(
      URL_FILE,
      'if (!POSTGRES_PROTOCOLS.includes(parsed.protocol)) throw new InvalidConnectionUrlError();\n',
      '',
    ),
  },
];

const SESSION_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'LISTENING_DECLARED_BEFORE_THE_SERVER_ACKNOWLEDGES',
    edits: edit(
      SESSION,
      '    ctx.phase = SESSION_PHASE.SUBSCRIBING;\n',
      '    ctx.phase = SESSION_PHASE.LISTENING;\n    ctx.wasListening = true;\n    ctx.params.handlers.onListening();\n',
    ),
  },
  {
    name: 'REQUIRED_TLS_FALLS_BACK_TO_PLAINTEXT',
    edits: edit(
      STARTUP,
      '    endSession(ctx, SESSION_END_REASON.TLS_UNAVAILABLE);',
      '    sendStartup(ctx);',
    ),
  },
  {
    name: 'CERTIFICATE_NEVER_VERIFIED',
    edits: edit(STARTUP, 'shouldVerify: sslMode === SSL_MODE.VERIFY,', 'shouldVerify: false,'),
  },
  {
    name: 'FAILED_HANDSHAKE_CONTINUES_IN_PLAINTEXT',
    edits: edit(
      STARTUP,
      '() => endSession(ctx, SESSION_END_REASON.TLS_FAILED),',
      '() => sendStartup(ctx),',
    ),
  },
  {
    name: 'PREFER_NEVER_FALLS_BACK',
    edits: edit(
      STARTUP,
      '} else if (answer === SSL_REFUSED_BYTE && sslMode === SSL_MODE.PREFER) {',
      '} else if (false as boolean) {',
    ),
  },
  {
    name: 'DISABLE_STILL_ASKS_FOR_TLS',
    edits: edit(SESSION, 'if (settings.sslMode === SSL_MODE.DISABLE) {', 'if (false as boolean) {'),
  },
  {
    name: 'OK_WITHOUT_SASL_FINAL_ACCEPTED',
    edits: edit(AUTH, ': ctx.isServerVerified;', ': true;'),
  },
  {
    name: 'OK_WITHOUT_SASL_ACCEPTED_DESPITE_THE_PASSWORD',
    edits: edit(
      AUTH,
      'ctx.scram === undefined ? ctx.params.settings.password.length === 0 :',
      'ctx.scram === undefined ? true :',
    ),
  },
  {
    name: 'FRAME_READER_COPIES_THE_REMAINDER_PER_FRAME',
    edits: edit(
      DECODE,
      '        offset = end;\n',
      '        offset = end;\n        void buffer.slice(offset);\n',
    ),
  },
  {
    name: 'FRAME_COUNT_PER_CHUNK_NOT_CAPPED',
    edits: edit(
      DECODE,
      '        if (frames.length >= maxFramesPerPush) throw new WireProtocolError();\n',
      '',
    ),
  },
  {
    name: 'IPV6_BRACKETS_KEPT',
    edits: edit(URL_FILE, 'host: stripIpv6Brackets(parsed.hostname),', 'host: parsed.hostname,'),
  },
  {
    name: 'FATAL_REASON_NEVER_SET',
    edits: edit(
      LISTENER,
      'state.fatalReason = isFatalSessionEnd(end) ? end.reason : undefined;',
      'state.fatalReason = undefined;',
    ),
  },
  {
    name: 'FATAL_REASON_NEVER_CLEARED',
    edits: edit(LISTENER, '          state.fatalReason = undefined;\n', ''),
  },
  {
    name: 'FATAL_RETRY_KEEPS_THE_SHORT_BACKOFF',
    edits: edit(
      LISTENER,
      'const capped = state.fatalReason === undefined ? growing : max;',
      'const capped = growing;',
    ),
  },
  {
    name: 'WRONG_PASSWORD_NOT_FATAL',
    edits: edit(SESSION_END, '  SESSION_END_REASON.AUTHENTICATION_FAILED,\n', ''),
  },
  {
    name: 'UNSUPPORTED_AUTHENTICATION_NOT_FATAL',
    edits: edit(
      SESSION_END,
      '  SESSION_END_REASON.UNSUPPORTED_AUTHENTICATION,\n  SESSION_END_REASON.TLS_UNAVAILABLE,',
      '  SESSION_END_REASON.TLS_UNAVAILABLE,',
    ),
  },
  {
    name: 'TLS_UNAVAILABLE_NOT_FATAL',
    edits: edit(SESSION_END, '  SESSION_END_REASON.TLS_UNAVAILABLE,\n];', '];'),
  },
  {
    name: 'CONNECTION_FAILURE_COUNTS_AS_FATAL',
    edits: edit(
      SESSION_END,
      '  SESSION_END_REASON.TLS_UNAVAILABLE,\n];',
      '  SESSION_END_REASON.TLS_UNAVAILABLE,\n  SESSION_END_REASON.CONNECTION_FAILED,\n];',
    ),
  },
  {
    name: 'CLEARTEXT_PASSWORD_IS_SENT',
    edits: edit(
      AUTH,
      '  } else {\n    outcome.end(SESSION_END_REASON.UNSUPPORTED_AUTHENTICATION);\n  }\n}',
      '  } else {\n    ctx.transport?.write(encodeSaslResponse(ctx.params.settings.password));\n  }\n}',
    ),
  },
  {
    name: 'OTHER_CHANNELS_DELIVERED',
    edits: edit(
      SESSION,
      'if (notification.channel === ctx.params.channel) {',
      'if (true as boolean) {',
    ),
  },
  {
    name: 'AUTH_FAILURE_NOT_CLASSIFIED',
    edits: edit(
      SESSION,
      'AUTH_PHASES.includes(ctx.phase) && sqlState?.startsWith(AUTH_FAILURE_SQLSTATE_CLASS) === true;',
      'false as boolean;',
    ),
  },
  {
    name: 'SILENT_SERVER_NEVER_DETECTED',
    edits: edit(SESSION, '  if (ctx.isPingPending) return false;\n', ''),
  },
  {
    name: 'KEEP_ALIVE_NEVER_SENT',
    edits: edit(SESSION, "ctx.transport?.write(encodeQuery(''));", ''),
  },
  {
    name: 'LISTENING_FLAG_NEVER_SET',
    edits: edit(SESSION, '  ctx.wasListening = true;\n  ctx.params', '  ctx.params'),
  },
  {
    name: 'STOP_WITHOUT_TERMINATE',
    edits: edit(
      END,
      'if (reason === SESSION_END_REASON.STOPPED) ctx.transport?.write(encodeTerminate());',
      '',
    ),
  },
];

const LISTENER_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'NEVER_RECONNECTS',
    edits: edit(LISTENER, '    await wait(state, backoffDelay(state));', '    return;'),
  },
  {
    name: 'RECONNECTION_NOT_FLAGGED',
    edits: edit(
      LISTENER,
      'const isReconnect = state.hasListenedBefore;',
      'const isReconnect = false;',
    ),
  },
  {
    name: 'BACKOFF_NEVER_GROWS',
    edits: edit(LISTENER, '  state.consecutiveFailures += 1;\n', ''),
  },
  {
    name: 'BACKOFF_NEVER_RESETS',
    edits: edit(LISTENER, '          state.consecutiveFailures = 0;\n', ''),
  },
  {
    name: 'BACKOFF_WITHOUT_CEILING',
    edits: edit(
      LISTENER,
      'Math.min(base * 2 ** state.consecutiveFailures, max)',
      'base * 2 ** state.consecutiveFailures',
    ),
  },
  {
    name: 'JITTER_IGNORED',
    edits: edit(
      LISTENER,
      'Math.round(capped / 2 + (capped / 2) * random())',
      'Math.round(capped / 2)',
    ),
  },
  {
    name: 'KEEP_ALIVE_RESULT_IGNORED',
    edits: edit(
      LISTENER,
      '      if (!session.checkAlive()) session.stop(SESSION_END_REASON.UNRESPONSIVE);',
      '      session.checkAlive();',
    ),
  },
  {
    name: 'CONSUMER_ERRORS_BREAK_THE_SESSION',
    edits: edit(LISTENER, '    state.settings.onHandlerError?.(error);', '    throw error;'),
  },
  {
    name: 'LOSS_NEVER_REPORTED',
    edits: edit(LISTENER, '    guarded(state, () => state.settings.onLost(end));\n', ''),
  },
  { name: 'CLOSE_KEEPS_RECONNECTING', edits: edit(LISTENER, '      state.isClosed = true;\n', '') },
  {
    name: 'CLOSE_LEAVES_READY_PENDING',
    edits: edit(LISTENER, '      state.releaseReady();\n      await done;', '      await done;'),
  },
  {
    name: 'LISTENING_FLAG_STAYS_AFTER_LOSS',
    edits: edit(
      LISTENER,
      '          state.isListening = false;\n          resolve(end);',
      '          resolve(end);',
    ),
  },
  {
    name: 'CHANNEL_NAME_NOT_VALIDATED',
    edits: edit(
      LISTENER,
      'if (!CHANNEL_PATTERN.test(settings.channel)) throw new InvalidChannelError();',
      '',
    ),
  },
];

const EVENT_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'EVENT_PAYLOAD_NOT_STRICT',
    edits: edit(
      EVENT_SCHEMA,
      'const runEventSchema = z.strictObject({',
      'const runEventSchema = z.object({',
    ),
  },
  {
    name: 'EVENT_KIND_UNRESTRICTED',
    edits: edit(
      EVENT_SCHEMA,
      'kind: z.enum(Object.values(RUN_EVENT_KIND) as [RunEventKind, ...RunEventKind[]]),',
      'kind: z.string(),',
    ),
  },
  { name: 'EVENT_ID_UNBOUNDED', edits: edit(EVENT_SCHEMA, '.max(MAX_EVENT_ID_LENGTH)', '') },
  {
    name: 'EVENT_RUN_ID_NOT_A_UUID',
    edits: edit(EVENT_SCHEMA, 'runId: z.uuid(),', 'runId: z.string(),'),
  },
  {
    name: 'EVENTS_CHANNEL_RENAMED',
    edits: edit(
      'run-events/run-event.constant.ts',
      "RUN_EVENTS_CHANNEL = 'run_events'",
      "RUN_EVENTS_CHANNEL = 'run-events'",
    ),
  },
];

const MUTANTS: readonly SourceMutant[] = [
  ...WIRE_MUTANTS,
  ...SCRAM_MUTANTS,
  ...URL_MUTANTS,
  ...SESSION_MUTANTS,
  ...LISTENER_MUTANTS,
  ...EVENT_MUTANTS,
];

describe('escutador de LISTEN/NOTIFY: os contratos reprovam cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  // Cada mutante é um processo `bun test` à parte (os cinco contratos do escutador); quatro de cada vez mantêm a suíte rápida.
  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(DATABASE_LISTENER_MUTANT_TARGET, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(() => removeMutantCopies(DATABASE_LISTENER_MUTANT_TARGET));

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
