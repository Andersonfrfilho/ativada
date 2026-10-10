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
  MILLISECONDS_PER_HOUR,
  SYMBOL,
  TIMEFRAME,
  WORKER_MESSAGE,
} from './stream-test.constant.js';
import type { WorkerProcess } from './worker-process.js';

export async function checkClosedCandleIsStoredAndNoiseIsIgnored(
  context: StreamContext,
  worker: WorkerProcess,
): Promise<void> {
  await waitUntil(
    () => worker.countMessages(WORKER_MESSAGE.RECOVERY_FINISHED) >= 1,
    'primeira recuperação de lacuna',
  );
  const openTime = hoursFrom(context.lastClosedOpenTime, -3);
  const futureOpenTime = hoursFrom(context.lastClosedOpenTime, 1);
  // Aberta no estado do stream, mas já no passado: só o campo `x` impede a gravação (o banco não a barraria).
  const pastOpenTime = hoursFrom(context.lastClosedOpenTime, -2);
  context.server.sendText('isto não é json');
  context.server.sendText('{"stream":"btcusdt@kline_1h","data":{"e":"kline"}}');
  context.server.sendEvent({
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    openTime: futureOpenTime,
    isClosed: false,
  });
  context.server.sendEvent({
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    openTime: pastOpenTime,
    isClosed: false,
  });
  context.server.sendEvent({ symbol: SYMBOL, timeframe: TIMEFRAME, openTime, isClosed: true });
  await waitUntil(
    async () => (await readCandlesAt(context, openTime)).length === 1,
    'vela fechada gravada',
  );

  const [stored] = await readCandlesAt(context, openTime);
  const price = buildFakePrice({ openTime, timeframe: TIMEFRAME });
  assertCondition(
    stored?.exchange === EXCHANGE &&
      stored.open === price &&
      stored.high === price &&
      stored.low === price &&
      stored.close === price &&
      stored.volume === '12.50000000' &&
      stored.tradeCount === 7 &&
      stored.closeTime === openTime + MILLISECONDS_PER_HOUR - 1,
    `vela gravada sem os decimais exatos: ${JSON.stringify(stored)}`,
  );
  assertCondition(
    (await readCandlesAt(context, futureOpenTime)).length === 0 &&
      (await readCandlesAt(context, pastOpenTime)).length === 0,
    'a vela aberta (x=false) foi gravada',
  );
  assertCondition(
    worker.countMessages(WORKER_MESSAGE.MALFORMED) >= 2 && !worker.hasExited(),
    'mensagem malformada derrubou o worker ou não foi contada',
  );
  reportCheck(
    'vela fechada gravada com decimais exatos; vela aberta e mensagens malformadas ignoradas',
  );
}
