// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { STREAM_MUTANT_TARGET } from './fixtures/stream/stream-mutation.fixture.js';
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
const HUB = 'stream/stream-hub.ts';
const SWEEP = 'stream/stream-sweep.ts';
const DISPATCHER = 'stream/run-event-dispatcher.ts';
const UPGRADE = 'stream/stream-upgrade.ts';
const MESSAGE = 'stream/handle-stream-message.ts';
const HANDLER = 'stream/stream-websocket-handler.ts';
const ENDPOINT = 'stream/create-stream-endpoint.ts';
const CONSTANT = 'stream/stream.constant.ts';
const TICKETS = 'stream/stream-ticket-store.ts';
const ENVIRONMENT = 'stream/stream-environment.ts';
const SCHEMA = 'stream/stream-client-message.schema.ts';
const ALWAYS_FALSE = 'false as boolean';

function edit(file: string, find: string, replace: string): SourceEdit[] {
  return [{ file, find, replace, occurrences: 1 }];
}

const HUB_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'USER_CEILING_NOT_ENFORCED_BY_THE_HUB',
    edits: edit(
      HUB,
      'if (!sockets.has(socket) && sockets.size >= options.maxSocketsPerUser) return',
      `if (${ALWAYS_FALSE}) return`,
    ),
  },
  {
    name: 'FAN_OUT_BECOMES_BROADCAST',
    edits: edit(
      HUB,
      'sendToAll(socketsByUser.get(userId) ?? [], message)',
      'sendToAll(allSockets(), message)',
    ),
  },
  {
    name: 'REMOVED_SOCKET_KEEPS_ITS_SLOT',
    edits: edit(HUB, '      sockets?.delete(socket);\n', ''),
  },
  {
    name: 'CLOSE_USER_CLOSES_EVERYONE',
    edits: edit(
      HUB,
      'const sockets = [...(socketsByUser.get(userId) ?? [])];',
      'const sockets = allSockets();',
    ),
  },
  {
    name: 'SEND_FAILURE_ABORTS_THE_DELIVERY',
    edits: edit(
      HUB,
      '  } catch {\n    return false;\n  }',
      '  } catch (error) {\n    throw error;\n  }',
    ),
  },
  {
    name: 'ACCOUNT_BLOCKED_CODE_WRONG',
    edits: edit(CONSTANT, 'ACCOUNT_BLOCKED: 4403', 'ACCOUNT_BLOCKED: 4402'),
  },
  {
    name: 'TOKEN_EXPIRED_CODE_WRONG',
    edits: edit(CONSTANT, 'TOKEN_EXPIRED: 4401', 'TOKEN_EXPIRED: 4400'),
  },
  { name: 'GOING_AWAY_CODE_WRONG', edits: edit(CONSTANT, 'GOING_AWAY: 1001', 'GOING_AWAY: 1000') },
];

const SWEEP_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'TOKEN_EXPIRY_NOT_ENFORCED',
    edits: edit(
      SWEEP,
      'if (nowMilliseconds >= data.expiresAtMilliseconds) {',
      `if (${ALWAYS_FALSE}) {`,
    ),
  },
  {
    name: 'TOKEN_EXPIRY_ONE_MILLISECOND_LATE',
    edits: edit(
      SWEEP,
      'if (nowMilliseconds >= data.expiresAtMilliseconds) {',
      'if (nowMilliseconds > data.expiresAtMilliseconds) {',
    ),
  },
  {
    name: 'PONG_TIMEOUT_NOT_ENFORCED',
    edits: edit(
      SWEEP,
      '} else if (nowMilliseconds - data.lastActivityAtMilliseconds >= params.pongTimeoutMilliseconds) {',
      `} else if (${ALWAYS_FALSE}) {`,
    ),
  },
  {
    name: 'PONG_TIMEOUT_ONE_MILLISECOND_LATE',
    edits: edit(
      SWEEP,
      'data.lastActivityAtMilliseconds >= params.pongTimeoutMilliseconds',
      'data.lastActivityAtMilliseconds > params.pongTimeoutMilliseconds',
    ),
  },
  { name: 'SWEEP_NEVER_PINGS', edits: edit(SWEEP, '    socket.ping();\n', '') },
  {
    name: 'BROKEN_SOCKET_ABORTS_THE_SWEEP',
    edits: edit(
      SWEEP,
      '    } catch {\n      // Socket que quebrou no meio da passada sai pelo `close` do servidor; os outros seguem.\n    }',
      '    } catch (error) {\n      throw error;\n    }',
    ),
  },
  {
    name: 'PONG_DOES_NOT_COUNT_AS_ACTIVITY',
    edits: edit(HANDLER, '      socket.data.lastActivityAtMilliseconds = messages.now();\n', ''),
  },
];

const DISPATCHER_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'OWNER_LOOKUPS_NOT_SHARED',
    edits: edit(DISPATCHER, 'const pending = lookups.get(runId);', 'const pending = undefined;'),
  },
  {
    name: 'FINISHED_LOOKUP_NEVER_FORGOTTEN',
    edits: edit(DISPATCHER, '.finally(() => lookups.delete(runId))', '.finally(() => undefined)'),
  },
  {
    name: 'LOOKUP_FAILURE_THROWS',
    edits: edit(DISPATCHER, '        params.reportError(error);', '        throw error;'),
  },
  {
    name: 'EVENT_LEAKS_THE_OWNER',
    edits: edit(
      DISPATCHER,
      '          eventId: event.eventId,\n',
      '          eventId: event.eventId,\n          userId: ownerUserId,\n',
    ),
  },
  {
    name: 'EVENT_WITHOUT_TIMESTAMP',
    edits: edit(DISPATCHER, '          at: params.now(),\n', ''),
  },
];

const UPGRADE_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'ORIGIN_NOT_CHECKED',
    edits: edit(
      UPGRADE,
      'if (origin === null || !dependencies.allowedOrigins.has(origin))\n    throw new OriginNotAllowedError();',
      '',
    ),
  },
  {
    name: 'MISSING_ORIGIN_ACCEPTED',
    edits: edit(
      UPGRADE,
      'if (origin === null || !dependencies.allowedOrigins.has(origin))',
      'if (origin !== null && !dependencies.allowedOrigins.has(origin))',
    ),
  },
  {
    name: 'TICKET_NEVER_CONSUMED',
    edits: edit(TICKETS, '    pendingTickets.delete(key);\n', ''),
  },
  {
    name: 'EXPIRED_TICKET_ACCEPTED',
    edits: edit(
      TICKETS,
      'return pending.expiresAtMilliseconds > options.now() ? pending.claims : undefined;',
      'return pending.claims;',
    ),
  },
  {
    name: 'READINESS_NOT_CHECKED',
    edits: edit(UPGRADE, 'if (!dependencies.isReady()) throw new StreamUnavailableError();', ''),
  },
  {
    name: 'ACCOUNT_STATUS_NOT_CHECKED_AT_UPGRADE',
    edits: edit(UPGRADE, '  await assertActiveAccount(dependencies, claims);\n', ''),
  },
  {
    name: 'BLOCKED_ACCOUNT_ACCEPTED',
    edits: edit(
      UPGRADE,
      'if (resolution.status === USER_RESOLUTION_STATUS.BLOCKED) throw new AccountBlockedError();',
      '',
    ),
  },
  {
    name: 'ENDED_SESSION_ACCEPTED',
    edits: edit(
      UPGRADE,
      'if (claims.sessionExpiresAtMilliseconds <= dependencies.now())\n    throw new StreamTicketInvalidError();',
      '',
    ),
  },
  {
    name: 'USER_CEILING_NOT_CHECKED_AT_UPGRADE',
    edits: edit(
      UPGRADE,
      'if (dependencies.hub.countForUser(claims.userId) >= dependencies.maxSocketsPerUser) {',
      `if (${ALWAYS_FALSE}) {`,
    ),
  },
  {
    name: 'UPGRADE_RATE_LIMIT_TOO_LOOSE',
    edits: edit(
      UPGRADE,
      'policy: RATE_LIMIT_POLICY.STREAM_UPGRADE_CLIENT_ADDRESS,',
      'policy: RATE_LIMIT_POLICY.HEALTH_CLIENT_ADDRESS,',
    ),
  },
  {
    name: 'PLAIN_HTTP_ACCEPTED',
    edits: edit(
      UPGRADE,
      'if (request.method !== HTTP_METHOD.GET || upgrade !== WEBSOCKET_UPGRADE_HEADER_VALUE) {',
      `if (${ALWAYS_FALSE}) {`,
    ),
  },
  {
    name: 'MAX_PAYLOAD_NOT_SET',
    edits: edit(HANDLER, '    maxPayloadLength: dependencies.maxMessageBytes,\n', ''),
  },
  { name: 'CLOSED_SOCKET_KEEPS_ITS_SLOT', edits: edit(HANDLER, '      hub.remove(socket);\n', '') },
];

const MESSAGE_MUTANTS: readonly SourceMutant[] = [
  {
    // Duas conferências do mesmo usuário (no ticket e na conta resolvida): o mutante precisa tirar as DUAS.
    name: 'RENEWAL_WITH_ANOTHER_USERS_TICKET',
    edits: [
      ...edit(MESSAGE, 'claims.userId === socket.data.userId &&', 'true &&'),
      ...edit(MESSAGE, 'if (resolution.userId !== socket.data.userId) {', `if (${ALWAYS_FALSE}) {`),
    ],
  },
  {
    name: 'RENEWAL_DOES_NOT_EXTEND_THE_SESSION',
    edits: edit(
      MESSAGE,
      '  socket.data.expiresAtMilliseconds = claims.sessionExpiresAtMilliseconds;\n',
      '',
    ),
  },
  {
    name: 'RENEWAL_SKIPS_THE_ACCOUNT_CHECK',
    edits: edit(
      MESSAGE,
      'if (resolution.status !== USER_RESOLUTION_STATUS.ACTIVE) {',
      `if (${ALWAYS_FALSE}) {`,
    ),
  },
  {
    name: 'RENEWAL_WITH_AN_ENDED_SESSION',
    edits: edit(MESSAGE, 'claims.sessionExpiresAtMilliseconds > dependencies.now();', 'true;'),
  },
  {
    name: 'MESSAGE_FLOOD_NOT_LIMITED',
    edits: edit(
      MESSAGE,
      'return data.messageCount > dependencies.maxMessagesPerMinute;',
      'return false;',
    ),
  },
  {
    name: 'MESSAGE_WINDOW_NEVER_RESETS',
    edits: edit(
      MESSAGE,
      'if (nowMilliseconds - data.messageWindowStartMilliseconds >= MESSAGE_WINDOW_MILLISECONDS) {',
      `if (${ALWAYS_FALSE}) {`,
    ),
  },
  {
    name: 'INVALID_MESSAGE_CLOSES_THE_SOCKET',
    edits: edit(
      MESSAGE,
      '    sendMessageError(socket);\n    return;',
      '    socket.close(WEBSOCKET_CLOSE_CODE.POLICY_VIOLATION, CLOSE_REASON.MESSAGE_FLOOD);\n    return;',
    ),
  },
  { name: 'CLIENT_MESSAGE_NOT_STRICT', edits: edit(SCHEMA, 'z.strictObject({', 'z.object({') },
];

const ENDPOINT_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'RESYNC_NOT_SENT_ON_LOSS',
    edits: edit(
      ENDPOINT,
      '      hub.broadcast({ type: SERVER_MESSAGE_TYPE.RESYNC, reason: RESYNC_REASON.LISTENER_LOST });\n',
      '',
    ),
  },
  {
    name: 'RESYNC_NOT_SENT_ON_RESTORE',
    edits: edit(
      ENDPOINT,
      '        hub.broadcast({\n          type: SERVER_MESSAGE_TYPE.RESYNC,\n          reason: RESYNC_REASON.LISTENER_RESTORED,\n        });\n',
      '',
    ),
  },
  {
    name: 'RESYNC_SENT_ON_THE_FIRST_LISTEN',
    edits: edit(ENDPOINT, 'if (isReconnect) {', 'if (true as boolean) {'),
  },
  {
    name: 'STREAM_STAYS_READY_AFTER_LOSS',
    edits: edit(
      ENDPOINT,
      '      state.isReady = false;\n      hub.broadcast',
      '      hub.broadcast',
    ),
  },
];

const ACCOUNT_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'BLOCK_DOES_NOT_CLOSE_SOCKETS',
    edits: edit(
      'admin/block-account.use-case.ts',
      '    dependencies.onAccountBlocked?.(input.accountId);\n',
      '',
    ),
  },
  {
    name: 'DELETE_DOES_NOT_CLOSE_SOCKETS',
    edits: edit(
      'account/delete-account.use-case.ts',
      '    dependencies.onAccountDeleted?.(userId);\n',
      '',
    ),
  },
  {
    name: 'PONG_TIMEOUT_RULE_REMOVED',
    edits: edit(
      ENVIRONMENT,
      'return values.STREAM_PONG_TIMEOUT_SECONDS > values.STREAM_PING_INTERVAL_SECONDS;',
      'return true;',
    ),
  },
  {
    name: 'PONG_TIMEOUT_IN_SECONDS_NOT_MILLISECONDS',
    edits: edit(
      ENVIRONMENT,
      'pongTimeoutMilliseconds: values.STREAM_PONG_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND,',
      'pongTimeoutMilliseconds: values.STREAM_PONG_TIMEOUT_SECONDS,',
    ),
  },
  {
    name: 'TICKET_ROUTE_IGNORES_THE_TOKEN_EXPIRY',
    edits: edit(
      'stream/stream-ticket.routes.ts',
      'sessionExpiresAtMilliseconds: accessTokenExpiresAtMilliseconds,',
      'sessionExpiresAtMilliseconds: Date.now() + 3_600_000,',
    ),
  },
];

const MUTANTS: readonly SourceMutant[] = [
  ...HUB_MUTANTS,
  ...SWEEP_MUTANTS,
  ...DISPATCHER_MUTANTS,
  ...UPGRADE_MUTANTS,
  ...MESSAGE_MUTANTS,
  ...ENDPOINT_MUTANTS,
  ...ACCOUNT_MUTANTS,
];

describe('WebSocket de tempo real: os contratos reprovam cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  // Cada mutante é um processo `bun test` à parte (os contratos do stream); quatro de cada vez mantêm a suíte rápida.
  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(STREAM_MUTANT_TARGET, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(() => removeMutantCopies(STREAM_MUTANT_TARGET));

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
