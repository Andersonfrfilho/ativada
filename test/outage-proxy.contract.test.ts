// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  OUTAGE_PROXY_MODE,
  startOutageProxy,
  type OutageProxy,
} from '../packages/database/test-support/outage-proxy.js';

const SILENCE_MILLISECONDS = 250;
const WAIT_MILLISECONDS = 2_000;

type Probe = {
  readonly received: () => string;
  readonly isClosed: () => boolean;
  readonly send: (text: string) => void;
  readonly close: () => void;
};

let echo: Bun.TCPSocketListener<undefined>;
let proxy: OutageProxy;
const openProbes: Probe[] = [];

beforeAll(() => {
  echo = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      data(socket, chunk) {
        socket.write(chunk);
      },
    },
  });
  proxy = startOutageProxy({ targetHost: '127.0.0.1', targetPort: echo.port });
});

afterAll(() => {
  for (const probe of openProbes) probe.close();
  proxy.stop();
  void echo.stop(true);
});

async function connect(): Promise<Probe> {
  let text = '';
  let isClosed = false;
  const socket = await Bun.connect({
    hostname: proxy.host,
    port: proxy.port,
    socket: {
      data(_socket, chunk) {
        text += new TextDecoder().decode(chunk);
      },
      close() {
        isClosed = true;
      },
    },
  });
  const probe: Probe = {
    received: () => text,
    isClosed: () => isClosed,
    send: (message) => void socket.write(message),
    close: () => void socket.end(),
  };
  openProbes.push(probe);
  return probe;
}

async function waitUntil(condition: () => boolean): Promise<boolean> {
  const deadline = Date.now() + WAIT_MILLISECONDS;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await Bun.sleep(10);
  }
  return condition();
}

async function expectEcho(probe: Probe, message: string): Promise<void> {
  probe.send(message);
  expect(await waitUntil(() => probe.received().includes(message))).toBe(true);
}

async function expectSilence(probe: Probe, message: string): Promise<void> {
  probe.send(message);
  await Bun.sleep(SILENCE_MILLISECONDS);
  expect(probe.received()).not.toContain(message);
  expect(probe.isClosed()).toBe(false);
}

describe('outage proxy', () => {
  test('forward: passes the bytes both ways', async () => {
    proxy.setMode(OUTAGE_PROXY_MODE.FORWARD);
    await expectEcho(await connect(), 'forward-1');
  });

  test('refuse: drops the open connections and closes each new one at once', async () => {
    proxy.setMode(OUTAGE_PROXY_MODE.FORWARD);
    const open = await connect();
    await expectEcho(open, 'before-refuse');
    proxy.setMode(OUTAGE_PROXY_MODE.REFUSE);
    expect(await waitUntil(() => open.isClosed())).toBe(true);
    const fresh = await connect();
    expect(await waitUntil(() => fresh.isClosed())).toBe(true);
    expect(fresh.received()).toBe('');
    proxy.setMode(OUTAGE_PROXY_MODE.FORWARD);
    await expectEcho(await connect(), 'after-refuse');
  });

  test('mute: open connections go silent WITHOUT closing, and stay silent forever; new ones are silent while muted', async () => {
    proxy.setMode(OUTAGE_PROXY_MODE.FORWARD);
    const old = await connect();
    await expectEcho(old, 'before-mute');
    proxy.setMode(OUTAGE_PROXY_MODE.MUTE);
    await expectSilence(old, 'during-mute');
    const duringMute = await connect();
    await expectSilence(duringMute, 'new-during-mute');

    proxy.setMode(OUTAGE_PROXY_MODE.FORWARD);
    await expectSilence(old, 'old-after-forward');
    await expectSilence(duringMute, 'muted-new-after-forward');
    await expectEcho(await connect(), 'fresh-after-forward');
  });
});
