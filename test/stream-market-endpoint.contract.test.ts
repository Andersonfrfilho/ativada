// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { tick } from './fixtures/ticker/manual-timers.fixture.js';
import { USER_A } from './fixtures/stream/fake-stream-socket.fixture.js';
import {
  createStreamHarness,
  type StreamClient,
  type StreamHarness,
} from './fixtures/stream/stream-harness.fixture.js';
import { waitFor } from './fixtures/wait-for.fixture.js';

const SUBJECT_A = 'subject-stream-a';
const SUBJECT_B = 'subject-stream-b';
const INTERVAL = 1_000;
const QUIET_MILLISECONDS = 250;

let harness: StreamHarness | undefined;

afterEach(async () => {
  await harness?.stop();
  harness = undefined;
});

async function open(hasMarket = true): Promise<StreamHarness> {
  harness = await createStreamHarness({ hasMarket });
  return harness;
}

async function connectUser(current: StreamHarness, subject: string): Promise<StreamClient> {
  const client = current.connect({ ticket: current.issueTicket(subject) });
  await client.opened;
  return client;
}

function messagesOfType(client: StreamClient, type: string): Record<string, unknown>[] {
  return client.messages.filter(
    (message): message is Record<string, unknown> =>
      typeof message === 'object' && message !== null && Reflect.get(message, 'type') === type,
  );
}

describe('market over the socket — subscribe, receive, unsubscribe', () => {
  test('subscribe answers with the list, then the tick arrives once the window closes', async () => {
    const current = await open();
    const client = await connectUser(current, SUBJECT_A);
    client.send(JSON.stringify({ type: 'subscribe', pairs: ['BTCUSDT'] }));
    await waitFor(() => messagesOfType(client, 'subscribed').length === 1, 'subscribed');
    expect(messagesOfType(client, 'subscribed')[0]).toStrictEqual({
      type: 'subscribed',
      pairs: ['BTCUSDT'],
    });
    current.market?.publisher.handleRawTick(tick('BTCUSDT', 1));
    current.market?.timers.advance(INTERVAL);
    await waitFor(() => messagesOfType(client, 'tick').length === 1, 'tick');
    expect(messagesOfType(client, 'tick')[0]).toMatchObject({
      symbol: 'BTCUSDT',
      price: '101.00000000',
      stale: false,
    });
    client.socket.close();
  });

  test('unsubscribe stops the delivery', async () => {
    const current = await open();
    const client = await connectUser(current, SUBJECT_A);
    client.send(JSON.stringify({ type: 'subscribe', pairs: ['BTCUSDT', 'ETHUSDT'] }));
    await waitFor(() => messagesOfType(client, 'subscribed').length === 1, 'subscribed');
    client.send(JSON.stringify({ type: 'unsubscribe', pairs: ['BTCUSDT'] }));
    await waitFor(() => messagesOfType(client, 'subscribed').length === 2, 'unsubscribed');
    expect(messagesOfType(client, 'subscribed')[1]).toStrictEqual({
      type: 'subscribed',
      pairs: ['ETHUSDT'],
    });
    current.market?.publisher.handleRawTick(tick('BTCUSDT', 1));
    current.market?.timers.advance(INTERVAL);
    await Bun.sleep(QUIET_MILLISECONDS);
    expect(messagesOfType(client, 'tick')).toHaveLength(0);
    client.socket.close();
  });

  test('closing the socket removes its subscriptions', async () => {
    const current = await open();
    const client = await connectUser(current, SUBJECT_A);
    client.send(JSON.stringify({ type: 'subscribe', pairs: ['BTCUSDT'] }));
    await waitFor(() => current.market?.publisher.subscriberCount('BTCUSDT') === 1, 'assinante');
    client.socket.close();
    await client.closed;
    await waitFor(
      () => current.market?.publisher.subscriberCount('BTCUSDT') === 0,
      'sem assinante',
    );
  });
});

describe('market over the socket — typed errors keep the socket open', () => {
  test('a pair that does not exist answers PAIR_NOT_SUPPORTED with the pair', async () => {
    const current = await open();
    const client = await connectUser(current, SUBJECT_A);
    client.send(JSON.stringify({ type: 'subscribe', pairs: ['BTCUSDT', 'XYZUSDT'] }));
    await waitFor(() => client.messages.length === 1, 'erro');
    expect(client.messages[0]).toStrictEqual({
      type: 'error',
      code: 'PAIR_NOT_SUPPORTED',
      pair: 'XYZUSDT',
    });
    expect(current.market?.publisher.subscriberCount('BTCUSDT')).toBe(0);
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    client.socket.close();
  });

  test('more pairs than the per-socket ceiling answers TOO_MANY_PAIRS', async () => {
    const current = await open();
    const client = await connectUser(current, SUBJECT_A);
    client.send(JSON.stringify({ type: 'subscribe', pairs: ['BTCUSDT', 'ETHUSDT'] }));
    await waitFor(() => messagesOfType(client, 'subscribed').length === 1, 'subscribed');
    client.send(JSON.stringify({ type: 'subscribe', pairs: ['SOLUSDT'] }));
    await waitFor(() => messagesOfType(client, 'error').length === 1, 'erro do teto');
    expect(messagesOfType(client, 'error')[0]).toStrictEqual({
      type: 'error',
      code: 'TOO_MANY_PAIRS',
    });
    expect(current.market?.publisher.subscriberCount('SOLUSDT')).toBe(0);
    client.socket.close();
  });

  test.each([
    ['lowercase pairs', { type: 'subscribe', pairs: ['btcusdt'] }],
    ['an empty list', { type: 'subscribe', pairs: [] }],
    ['a pair that is not text', { type: 'subscribe', pairs: [1] }],
    ['an extra field', { type: 'subscribe', pairs: ['BTCUSDT'], userId: 'outro' }],
    [
      'too many pairs in one message',
      { type: 'subscribe', pairs: Array.from({ length: 51 }, (_x, index) => `P${index}USDT`) },
    ],
  ])('%s is INVALID_MESSAGE', async (_name, message) => {
    const current = await open();
    const client = await connectUser(current, SUBJECT_A);
    client.send(JSON.stringify(message));
    await waitFor(() => client.messages.length === 1, 'erro');
    expect(client.messages[0]).toStrictEqual({ type: 'error', code: 'INVALID_MESSAGE' });
    client.socket.close();
  });

  test('without the public ticker the answer is MARKET_UNAVAILABLE', async () => {
    const current = await open(false);
    const client = await connectUser(current, SUBJECT_A);
    client.send(JSON.stringify({ type: 'subscribe', pairs: ['BTCUSDT'] }));
    await waitFor(() => client.messages.length === 1, 'erro');
    expect(client.messages[0]).toStrictEqual({ type: 'error', code: 'MARKET_UNAVAILABLE' });
    client.socket.close();
  });
});

describe('market over the socket — the ticker is public, everything else is not', () => {
  test('every authenticated user gets the same tick, while a user event still reaches only its owner', async () => {
    const current = await open();
    const ofA = await connectUser(current, SUBJECT_A);
    const ofB = await connectUser(current, SUBJECT_B);
    for (const client of [ofA, ofB]) {
      client.send(JSON.stringify({ type: 'subscribe', pairs: ['BTCUSDT'] }));
    }
    await waitFor(
      () =>
        messagesOfType(ofA, 'subscribed').length === 1 &&
        messagesOfType(ofB, 'subscribed').length === 1,
      'assinaturas',
    );
    current.market?.publisher.handleRawTick(tick('BTCUSDT', 1));
    current.market?.timers.advance(INTERVAL);
    current.endpoint.hub.sendToUser(USER_A, { type: 'event', runId: 'run-de-a' });
    await waitFor(
      () => messagesOfType(ofA, 'tick').length === 1 && messagesOfType(ofB, 'tick').length === 1,
      'ticks',
    );
    await waitFor(() => messagesOfType(ofA, 'event').length === 1, 'evento de A');
    await Bun.sleep(QUIET_MILLISECONDS);
    expect(messagesOfType(ofA, 'tick')[0]).toStrictEqual(messagesOfType(ofB, 'tick')[0]);
    expect(messagesOfType(ofB, 'event')).toHaveLength(0);
    ofA.socket.close();
    ofB.socket.close();
  });
});
