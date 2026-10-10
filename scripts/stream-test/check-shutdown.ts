// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../identity-test/identity-test.error.js';
import { reportCheck } from './stream-test-context.js';
import { SHUTDOWN_TIMEOUT_MILLISECONDS, WORKER_MESSAGE } from './stream-test.constant.js';
import type { WorkerProcess } from './worker-process.js';

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function checkSigtermExitsZeroWithoutOrphans(worker: WorkerProcess): Promise<void> {
  worker.terminate();
  const timeout = Bun.sleep(SHUTDOWN_TIMEOUT_MILLISECONDS).then(() => undefined);
  const exitCode = await Promise.race([worker.exited, timeout]);
  assertCondition(exitCode !== undefined, 'o worker não encerrou após o SIGTERM');
  assertCondition(exitCode === 0, `o worker saiu com ${exitCode}: ${worker.output()}`);
  assertCondition(
    worker.countMessages(WORKER_MESSAGE.SHUTDOWN_COMPLETE) === 1,
    'o encerramento gracioso não foi registrado',
  );
  assertCondition(!isProcessAlive(worker.pid), 'o processo do worker continua vivo');
  reportCheck('SIGTERM: saída 0, encerramento gracioso registrado e nenhum processo órfão');
}
