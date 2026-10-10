// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  MARKET_MUTANT_TARGET,
  MARKET_WIRING_MUTANT_TARGET,
} from './fixtures/stream/stream-mutation.fixture.js';
import type { MutantTarget } from './fixtures/walk-forward/walk-forward-mutation.fixture.js';
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
const SUBSCRIPTIONS = 'market-stream/market-subscriptions.ts';
const PUBLISHING = 'market-stream/market-publishing.ts';
const PUBLISHER = 'market-stream/create-market-publisher.ts';
const PUBSUB = 'market-stream/market-pubsub.ts';
const CONSTANT = 'market-stream/market-stream.constant.ts';
const APPLICATION = 'market-stream/create-application-market-stream.ts';
const MESSAGE = 'stream/handle-stream-message.ts';
const SCHEMA = 'stream/stream-client-message.schema.ts';
const HANDLER = 'stream/stream-websocket-handler.ts';
const ENVIRONMENT = 'stream/stream-environment.ts';

function edit(file: string, find: string, replace: string): SourceEdit[] {
  return [{ file, find, replace, occurrences: 1 }];
}

const SUBSCRIPTION_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'UNKNOWN_PAIR_ACCEPTED',
    edits: edit(
      SUBSCRIPTIONS,
      'for (const pair of requested) if (!context.pairs.has(pair)) throw new UnsupportedPairError(pair);',
      '',
    ),
  },
  {
    name: 'PER_SOCKET_CEILING_IGNORED',
    edits: edit(
      SUBSCRIPTIONS,
      'if (resulting.length > context.maxPairsPerSocket) throw new TooManyPairsError();',
      '',
    ),
  },
  {
    name: 'CEILING_FORGETS_WHAT_IS_ALREADY_SUBSCRIBED',
    edits: edit(
      SUBSCRIPTIONS,
      'sortedUnique([...socket.data.subscribedPairs, ...requested])',
      'sortedUnique(requested)',
    ),
  },
  {
    name: 'SNAPSHOT_NEVER_SENT',
    edits: edit(
      SUBSCRIPTIONS,
      '  for (const pair of requested) sendSnapshot(context, socket, pair);\n',
      '',
    ),
  },
  {
    name: 'SNAPSHOT_NEVER_STALE',
    edits: edit(SUBSCRIPTIONS, 'isPairStale(context, state));', 'false);'),
  },
  {
    name: 'UNSUBSCRIBE_DOES_NOT_STOP_THE_DELIVERY',
    edits: edit(SUBSCRIPTIONS, '    context.pubsub.unsubscribe(marketTopic(pair), socket);\n', ''),
  },
  {
    name: 'CLOSED_SOCKET_KEEPS_ITS_PAIRS',
    edits: edit(SUBSCRIPTIONS, '      context.pubsub.removeSocket(socket);\n', ''),
  },
];

const PUBLISHING_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'STALE_ONE_MILLISECOND_LATE',
    edits: edit(
      PUBLISHING,
      '>= context.staleAfterMilliseconds',
      '> context.staleAfterMilliseconds',
    ),
  },
  {
    name: 'STALE_SEAL_REPEATED',
    edits: edit(PUBLISHING, '    state.isStaleSent = true;\n', ''),
  },
  {
    name: 'NEW_TICK_DOES_NOT_CLEAR_THE_SEAL',
    edits: edit(PUBLISHER, '      state.isStaleSent = false;\n', ''),
  },
  {
    name: 'SERVER_TIME_IS_THE_LOCAL_CLOCK',
    edits: edit(PUBLISHING, 'serverTime: context.serverTime(),', 'serverTime: context.now(),'),
  },
  {
    name: 'CHANGE_24H_DROPPED',
    edits: edit(PUBLISHING, 'change24h: aggregated.change24h ?? null,', 'change24h: null,'),
  },
  {
    name: 'LISTENERS_NEVER_NOTIFIED',
    edits: edit(PUBLISHING, '  notifyListeners(context, aggregated);\n', ''),
  },
  {
    name: 'LISTENER_FAILURE_ESCAPES',
    edits: edit(
      PUBLISHING,
      '      context.reportError(error);\n    }\n  }\n}',
      '      throw error;\n    }\n  }\n}',
    ),
  },
  {
    name: 'LISTENER_REJECTION_UNHANDLED',
    edits: edit(
      PUBLISHING,
      'if (outcome instanceof Promise) outcome.catch(context.reportError);',
      '',
    ),
  },
  {
    name: 'RAW_TICKS_NOT_AGGREGATED',
    edits: edit(
      PUBLISHER,
      '      aggregator.push(tick);',
      '      publishAggregated(context, tick);',
    ),
  },
  {
    name: 'PUBSUB_BROADCASTS_TO_EVERY_TOPIC',
    edits: edit(
      PUBSUB,
      'for (const socket of subscribers.get(topic) ?? []) {',
      'for (const socket of [...subscribers.values()].flatMap((sockets) => [...sockets])) {',
    ),
  },
  {
    name: 'TOPIC_PREFIX_WRONG',
    edits: edit(CONSTANT, "MARKET_TOPIC_PREFIX = 'market:'", "MARKET_TOPIC_PREFIX = 'mercado:'"),
  },
];

const MESSAGE_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'MARKET_ERROR_CLOSES_THE_SOCKET',
    edits: edit(
      MESSAGE,
      '    sendMarketError(socket, error.code, error.pair);',
      '    socket.close(WEBSOCKET_CLOSE_CODE.POLICY_VIOLATION, CLOSE_REASON.MESSAGE_FLOOD);',
    ),
  },
  {
    name: 'ERROR_LOSES_THE_REFUSED_PAIR',
    edits: edit(
      MESSAGE,
      'const detail = pair === undefined ? {} : { pair };',
      'const detail = {};',
    ),
  },
  {
    name: 'UNAVAILABLE_MARKET_IS_SILENT',
    edits: edit(
      MESSAGE,
      '    sendMarketError(socket, MARKET_ERROR_CODE.MARKET_UNAVAILABLE);\n',
      '',
    ),
  },
  {
    name: 'PAIR_FORMAT_NOT_VALIDATED',
    edits: edit(SCHEMA, 'z.array(z.string().regex(PAIR_PATTERN))', 'z.array(z.string())'),
  },
  { name: 'PAIRS_PER_MESSAGE_UNBOUNDED', edits: edit(SCHEMA, '.max(MAX_PAIRS_PER_MESSAGE)', '') },
  {
    name: 'SOCKET_CLOSE_KEEPS_THE_SUBSCRIPTIONS',
    edits: edit(HANDLER, '      messages.market?.removeSocket(socket);\n', ''),
  },
];

const ENVIRONMENT_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'TICKER_ON_BY_DEFAULT',
    edits: edit(ENVIRONMENT, ".default('false')", ".default('true')"),
  },
];

// Só o pipeline de ponta a ponta (ticker real contra uma Binance falsa) enxerga estes.
const WIRING_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'SERVER_TIME_NOT_FROM_THE_BINANCE_CLOCK',
    edits: edit(
      APPLICATION,
      'serverTime: () => serverClock.now(),',
      'serverTime: () => Date.now(),',
    ),
  },
  {
    name: 'STALE_SWEEP_NEVER_STARTED',
    edits: edit(
      APPLICATION,
      '      sweeper = setInterval(publisher.sweepStale, STALE_SWEEP_INTERVAL_MILLISECONDS);\n',
      '',
    ),
  },
  {
    name: 'STALE_WINDOW_IN_SECONDS_NOT_MILLISECONDS',
    edits: edit(
      APPLICATION,
      'staleAfterMilliseconds: environment.TICKER_STALE_SECONDS * MILLISECONDS_PER_SECOND,',
      'staleAfterMilliseconds: environment.TICKER_STALE_SECONDS,',
    ),
  },
];

const FAST_MUTANTS: readonly SourceMutant[] = [
  ...SUBSCRIPTION_MUTANTS,
  ...PUBLISHING_MUTANTS,
  ...MESSAGE_MUTANTS,
  ...ENVIRONMENT_MUTANTS,
];
const MUTANTS: readonly SourceMutant[] = [...FAST_MUTANTS, ...WIRING_MUTANTS];

async function runAll(
  groups: readonly { readonly target: MutantTarget; readonly mutants: readonly SourceMutant[] }[],
  verdicts: Map<string, MutantVerdict>,
): Promise<void> {
  const queue = groups.flatMap((group) =>
    [CONTROL, ...group.mutants].map((mutant) => ({ target: group.target, mutant })),
  );
  const worker = async (): Promise<void> => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      const key = `${next.target.directoryPrefix}${next.mutant.name}`;
      verdicts.set(key, await runSourceMutant(next.target, next.mutant));
    }
  };
  await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
}

describe('ticker no WebSocket: os contratos reprovam cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  // Os mutantes da ligação (pipeline em tempo real) entram primeiro na fila: são os lentos.
  beforeAll(async () => {
    await runAll(
      [
        { target: MARKET_WIRING_MUTANT_TARGET, mutants: WIRING_MUTANTS },
        { target: MARKET_MUTANT_TARGET, mutants: FAST_MUTANTS },
      ],
      verdicts,
    );
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(async () => {
    await removeMutantCopies(MARKET_MUTANT_TARGET);
    await removeMutantCopies(MARKET_WIRING_MUTANT_TARGET);
  });

  test.each([MARKET_MUTANT_TARGET, MARKET_WIRING_MUTANT_TARGET])(
    'a cópia sem edição passa nos mesmos testes ($directoryPrefix): o arnês é sólido',
    (target) => {
      expect(verdicts.get(`${target.directoryPrefix}${CONTROL.name}`)).toStrictEqual({
        exitCode: 0,
        failedTests: 0,
        hasLoadError: false,
      });
    },
  );

  test.each(FAST_MUTANTS.map((mutant) => [mutant.name, mutant] as const))('%s', (_name, mutant) => {
    const verdict = verdicts.get(`${MARKET_MUTANT_TARGET.directoryPrefix}${mutant.name}`);
    expect(verdict?.hasLoadError).toBe(false);
    expect(verdict?.exitCode).not.toBe(0);
    expect(verdict?.failedTests ?? 0).toBeGreaterThan(0);
  });

  test.each(WIRING_MUTANTS.map((mutant) => [mutant.name, mutant] as const))(
    '%s',
    (_name, mutant) => {
      const verdict = verdicts.get(`${MARKET_WIRING_MUTANT_TARGET.directoryPrefix}${mutant.name}`);
      expect(verdict?.hasLoadError).toBe(false);
      expect(verdict?.exitCode).not.toBe(0);
      expect(verdict?.failedTests ?? 0).toBeGreaterThan(0);
    },
  );

  test('os nomes são distintos', () => {
    expect(new Set(MUTANTS.map((mutant) => mutant.name)).size).toBe(MUTANTS.length);
  });
});
