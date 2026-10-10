// Copyright (c) 2026 Ada Technology. All rights reserved.
import { buildFakePrice } from '../../packages/market-data/test-support/fake-binance-stream-server.js';
import { assertCondition } from '../identity-test/identity-test.error.js';
import {
  hoursFrom,
  readCandlesAt,
  reportCheck,
  waitUntil,
  type StreamContext,
} from './stream-test-context.js';
import {
  EXCHANGE,
  HOURS_BEFORE_LAST_CLOSED_AT_SEED_START,
  LOST_CANDLE_COUNT,
  MILLISECONDS_PER_HOUR,
  RECONNECT_TIMEOUT_MILLISECONDS,
  SYMBOL,
  TIMEFRAME,
  WORKER_MESSAGE,
} from './stream-test.constant.js';
import type { WorkerProcess } from './worker-process.js';

const HISTORY_HOURS_BEFORE = 30;

function listOpenTimes(first: number, last: number): number[] {
  const openTimes: number[] = [];
  for (let openTime = first; openTime <= last; openTime += MILLISECONDS_PER_HOUR) {
    openTimes.push(openTime);
  }
  return openTimes;
}

export async function checkDropWithLostCandlesLeavesNoHole(
  context: StreamContext,
  worker: WorkerProcess,
): Promise<void> {
  const lastClosed = context.lastClosedOpenTime;
  const alreadyStored = hoursFrom(lastClosed, -3);
  context.server.sendEvent({
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    openTime: alreadyStored,
    isClosed: true,
  });
  await Bun.sleep(300);
  assertCondition(
    (await readCandlesAt(context, alreadyStored)).length === 1,
    'a mesma vela duas vezes pelo stream duplicou a linha',
  );

  const requestsBefore = context.server.restRequests.length;
  const connectionsBefore = worker.countMessages(WORKER_MESSAGE.CONNECTED);
  const recoveriesBefore = worker.countMessages(WORKER_MESSAGE.RECOVERY_FINISHED);
  context.server.setHistory({
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    openTimes: listOpenTimes(
      hoursFrom(lastClosed, -HISTORY_HOURS_BEFORE),
      hoursFrom(lastClosed, 1),
    ),
  });
  context.server.dropConnections();
  await waitUntil(
    () => worker.countMessages(WORKER_MESSAGE.CONNECTED) > connectionsBefore,
    'reconexão do worker',
    RECONNECT_TIMEOUT_MILLISECONDS,
  );
  await waitUntil(
    () => worker.countMessages(WORKER_MESSAGE.RECOVERY_FINISHED) > recoveriesBefore,
    'recuperação de lacuna após a reconexão',
  );

  const newRequests = context.server.restRequests.slice(requestsBefore);
  assertCondition(newRequests.length === 1, `esperada 1 chamada REST, houve ${newRequests.length}`);
  assertCondition(
    newRequests[0]?.startTime === hoursFrom(lastClosed, -(LOST_CANDLE_COUNT - 1)) &&
      newRequests[0].endTime === lastClosed,
    `a chamada REST não cobre só as ${LOST_CANDLE_COUNT} velas perdidas: ${JSON.stringify(newRequests[0])}`,
  );
  const firstSeeded = hoursFrom(lastClosed, -HOURS_BEFORE_LAST_CLOSED_AT_SEED_START);
  const missing = await context.repository.findMissingOpenTimes({
    exchange: EXCHANGE,
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    from: firstSeeded,
    to: hoursFrom(lastClosed, 1),
  });
  assertCondition(missing.length === 0, `ainda faltam ${missing.length} velas após a recuperação`);
  const [recovered] = await readCandlesAt(context, hoursFrom(lastClosed, -1));
  const price = buildFakePrice({ openTime: hoursFrom(lastClosed, -1), timeframe: TIMEFRAME });
  assertCondition(
    recovered?.open === price && recovered.volume === '12.50000000',
    'vela recuperada sem decimais exatos',
  );
  assertCondition(
    (await readCandlesAt(context, hoursFrom(lastClosed, 1))).length === 0,
    'a vela ainda aberta devolvida pelo REST foi gravada',
  );
  reportCheck(
    `queda com ${LOST_CANDLE_COUNT} velas perdidas: reconectou, baixou só as faltantes e o banco ficou sem buraco`,
  );
}
