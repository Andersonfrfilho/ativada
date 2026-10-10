// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../identity-test/identity-test.error.js';
import { hoursFrom, reportCheck, waitUntil, type StreamContext } from './stream-test-context.js';
import {
  EXCHANGE,
  RECONNECT_TIMEOUT_MILLISECONDS,
  SHUTDOWN_BUDGET_MILLISECONDS,
  SYMBOL,
  TIMEFRAME,
  WORKER_MESSAGE,
} from './stream-test.constant.js';
import type { WorkerProcess } from './worker-process.js';

const HOURS_BACK_OF_THE_DELETED_CANDLE = 10;

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Abre um buraco recente no banco e segura o REST: a recuperação fica presa numa chamada em curso.
async function leaveRecoveryStuckOnRest(
  context: StreamContext,
  worker: WorkerProcess,
): Promise<void> {
  const openTime = hoursFrom(context.lastClosedOpenTime, -HOURS_BACK_OF_THE_DELETED_CANDLE);
  const client = new Bun.SQL(context.databaseUrl);
  try {
    await client`DELETE FROM candles WHERE exchange = ${EXCHANGE} AND symbol = ${SYMBOL} AND timeframe = ${TIMEFRAME} AND open_time = ${openTime}`;
  } finally {
    await client.close();
  }
  context.server.setHistory({ symbol: SYMBOL, timeframe: TIMEFRAME, openTimes: [openTime] });
  context.server.holdRest();
  const requestsBefore = context.server.restRequests.length;
  const connectionsBefore = worker.countMessages(WORKER_MESSAGE.CONNECTED);
  context.server.dropConnections();
  await waitUntil(
    () => worker.countMessages(WORKER_MESSAGE.CONNECTED) > connectionsBefore,
    'reconexão do worker',
    RECONNECT_TIMEOUT_MILLISECONDS,
  );
  await waitUntil(
    () => context.server.restRequests.length > requestsBefore,
    'recuperação presa numa chamada REST',
  );
}

export async function checkSigtermDuringRecoveryExitsZeroFast(
  context: StreamContext,
  worker: WorkerProcess,
): Promise<void> {
  await leaveRecoveryStuckOnRest(context, worker);
  const startedAt = Date.now();
  worker.terminate();
  const timeout = Bun.sleep(SHUTDOWN_BUDGET_MILLISECONDS).then(() => undefined);
  const exitCode = await Promise.race([worker.exited, timeout]);
  assertCondition(exitCode !== undefined, 'o worker não encerrou em 3 s com a recuperação presa');
  assertCondition(exitCode === 0, `o worker saiu com ${exitCode}: ${worker.output()}`);
  assertCondition(
    worker.countMessages(WORKER_MESSAGE.SHUTDOWN_COMPLETE) === 1 &&
      worker.countMessages(WORKER_MESSAGE.SHUTDOWN_TIMED_OUT) === 0,
    'o encerramento gracioso não foi registrado, ou foi forçado pelo temporizador de segurança',
  );
  assertCondition(!isProcessAlive(worker.pid), 'o processo do worker continua vivo');
  reportCheck(
    `SIGTERM com a recuperação presa no REST: saída 0 em ${Date.now() - startedAt} ms, sem temporizador de segurança e sem processo órfão`,
  );
}
