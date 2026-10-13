// Copyright (c) 2026 Ada Technology. All rights reserved.
import { STALE_AFTER_MILLISECONDS } from './db-outage-test.constant.js';
import {
  assertCondition,
  readAdminSnapshot,
  reportLine,
  restartWorker,
  waitUntil,
  type OutageSite,
} from './db-outage-context.js';

const WORKER_STATE = { ALIVE: 'alive', STALE: 'stale' } as const;
const MARGIN_MILLISECONDS = 30_000;

// O batimento visto pelo admin: vivo com o worker batendo, `stale` depois de 3 intervalos com ele morto (SIGKILL) e vivo
// de novo quando outro sobe.
export async function checkWorkerHealth(site: OutageSite): Promise<void> {
  await waitUntil(
    'worker.state alive com o worker batendo',
    async () => (await readAdminSnapshot(site)).worker.state === WORKER_STATE.ALIVE,
    MARGIN_MILLISECONDS,
  );
  await site.worker.current.kill();
  const staleAfter = await waitUntil(
    'worker.state stale com o worker morto',
    async () => (await readAdminSnapshot(site)).worker.state === WORKER_STATE.STALE,
    STALE_AFTER_MILLISECONDS + MARGIN_MILLISECONDS,
  );
  restartWorker(site);
  const aliveAfter = await waitUntil(
    'worker.state alive com outro worker no ar',
    async () => (await readAdminSnapshot(site)).worker.state === WORKER_STATE.ALIVE,
    MARGIN_MILLISECONDS,
  );
  assertCondition(staleAfter > 0 && aliveAfter > 0, 'medida inválida');
  reportLine(
    `batimento: worker.state alive -> stale ${staleAfter} ms depois do SIGKILL (limite 3 intervalos = ${STALE_AFTER_MILLISECONDS} ms) -> alive ${aliveAfter} ms depois de outro worker subir`,
  );
}
