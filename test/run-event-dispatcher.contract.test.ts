// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createFakeSocket,
  USER_A,
  USER_B,
  type FakeStreamSocket,
} from './fixtures/stream/fake-stream-socket.fixture.js';
import { loadStreamApp } from './fixtures/stream/stream-app.fixture.js';

const { hub: hubModule, dispatcher: dispatcherModule } = await loadStreamApp();
const RUN_OF_A = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9a01';
const RUN_OF_B = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9b02';
const UNKNOWN_RUN = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9c03';
const EVENT_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9e04';
const NOW = 1_760_000_000_000;

type Harness = {
  readonly socketOfA: FakeStreamSocket;
  readonly socketOfB: FakeStreamSocket;
  readonly lookups: string[];
  readonly errors: unknown[];
  readonly dispatch: ReturnType<typeof dispatcherModule.createRunEventDispatcher>['dispatch'];
};

function openHarness(resolve?: (runId: string) => Promise<string | undefined>): Harness {
  const hub = hubModule.createStreamHub({ maxSocketsPerUser: 5 });
  const socketOfA = createFakeSocket();
  const socketOfB = createFakeSocket({ userId: USER_B });
  hub.add(socketOfA);
  hub.add(socketOfB);
  const lookups: string[] = [];
  const errors: unknown[] = [];
  const owners = new Map<string, string>([
    [RUN_OF_A, USER_A],
    [RUN_OF_B, USER_B],
  ]);
  const { dispatch } = dispatcherModule.createRunEventDispatcher({
    hub,
    now: () => NOW,
    reportError: (error) => void errors.push(error),
    resolveOwner:
      resolve ??
      ((runId): Promise<string | undefined> => {
        lookups.push(runId);
        return Promise.resolve(owners.get(runId));
      }),
  });
  return { socketOfA, socketOfB, lookups, errors, dispatch };
}

describe('run event dispatcher — the owner comes from the database, delivery is by owner', () => {
  test('an event of the run of A reaches only the sockets of A', async () => {
    const { socketOfA, socketOfB, dispatch } = openHarness();
    await dispatch({ runId: RUN_OF_A, kind: 'signal', eventId: EVENT_ID });
    expect(socketOfA.sent).toHaveLength(1);
    expect(socketOfB.sent).toStrictEqual([]);
  });

  test('an event of the run of B reaches only the sockets of B', async () => {
    const { socketOfA, socketOfB, dispatch } = openHarness();
    await dispatch({ runId: RUN_OF_B, kind: 'trade', eventId: EVENT_ID });
    expect(socketOfB.sent).toHaveLength(1);
    expect(socketOfA.sent).toStrictEqual([]);
  });

  test('the message carries only type, runId, kind, eventId and the timestamp', async () => {
    const { socketOfA, dispatch } = openHarness();
    await dispatch({ runId: RUN_OF_A, kind: 'balance', eventId: EVENT_ID });
    expect(JSON.parse(socketOfA.sent[0] ?? '{}')).toStrictEqual({
      type: 'event',
      runId: RUN_OF_A,
      kind: 'balance',
      eventId: EVENT_ID,
      at: NOW,
    });
    expect(socketOfA.sent[0]).not.toContain(USER_A);
  });

  test('the analyst notice (kind analyst, eventId = the decided candle) reaches only the owner, like the others', async () => {
    const { socketOfA, socketOfB, dispatch } = openHarness();
    await dispatch({ runId: RUN_OF_A, kind: 'analyst', eventId: '1789861500000' });
    expect(JSON.parse(socketOfA.sent[0] ?? '{}')).toStrictEqual({
      type: 'event',
      runId: RUN_OF_A,
      kind: 'analyst',
      eventId: '1789861500000',
      at: NOW,
    });
    expect(socketOfB.sent).toStrictEqual([]);
  });

  test('a run with no active owner (unknown, blocked or deleted) delivers to nobody', async () => {
    const { socketOfA, socketOfB, dispatch } = openHarness();
    await dispatch({ runId: UNKNOWN_RUN, kind: 'signal', eventId: EVENT_ID });
    expect(socketOfA.sent).toStrictEqual([]);
    expect(socketOfB.sent).toStrictEqual([]);
  });

  test('simultaneous events of the same run share one owner lookup', async () => {
    const { lookups, socketOfA, dispatch } = openHarness();
    await Promise.all([
      dispatch({ runId: RUN_OF_A, kind: 'signal', eventId: '1' }),
      dispatch({ runId: RUN_OF_A, kind: 'trade', eventId: '2' }),
      dispatch({ runId: RUN_OF_A, kind: 'balance', eventId: '3' }),
    ]);
    expect(lookups).toStrictEqual([RUN_OF_A]);
    expect(socketOfA.sent).toHaveLength(3);
  });

  test('the lookup is repeated for the next event after the first one settled', async () => {
    const { lookups, dispatch } = openHarness();
    await dispatch({ runId: RUN_OF_A, kind: 'signal', eventId: '1' });
    await dispatch({ runId: RUN_OF_A, kind: 'signal', eventId: '2' });
    expect(lookups).toStrictEqual([RUN_OF_A, RUN_OF_A]);
  });

  test('a failing lookup is reported and never thrown, and delivers nothing', async () => {
    const failure = new Error('banco fora');
    const { socketOfA, socketOfB, errors, dispatch } = openHarness(() => Promise.reject(failure));
    await dispatch({ runId: RUN_OF_A, kind: 'signal', eventId: EVENT_ID });
    expect(errors).toStrictEqual([failure]);
    expect(socketOfA.sent).toStrictEqual([]);
    expect(socketOfB.sent).toStrictEqual([]);
  });

  test('a failing lookup does not poison the next event of the same run', async () => {
    let attempts = 0;
    const { socketOfA, dispatch } = openHarness(() => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error('uma vez')) : Promise.resolve(USER_A);
    });
    await dispatch({ runId: RUN_OF_A, kind: 'signal', eventId: '1' });
    await dispatch({ runId: RUN_OF_A, kind: 'signal', eventId: '2' });
    expect(socketOfA.sent).toHaveLength(1);
  });
});
