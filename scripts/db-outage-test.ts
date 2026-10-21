// Copyright (c) 2026 Ada Technology. All rights reserved.
import { checkDockerRestart, checkOutage, OUTAGE_KIND } from './db-outage-test/check-outage.js';
import { checkStall } from './db-outage-test/check-stall.js';
import { checkWorkerHealth } from './db-outage-test/check-worker-health.js';
import {
  assertCondition,
  closeOutageSite,
  createOutageSite,
  readAdminSnapshot,
  reportLine,
  type OutageSite,
} from './db-outage-test/db-outage-context.js';

const KILL_SYMBOL = 'ETHUSDT';
const HALF_OPEN_SYMBOL = 'BTCUSDT';
const BEFORE_FIRST_BEAT = 'unknown';
const RESTART_SYMBOL = 'SOLUSDT';
const DEFAULT_DOCKER_COMMAND = 'docker';

// RNF01 e RNF02 contra um Postgres de verdade, com o worker (processo próprio) e a API reais atrás de um proxy TCP que
// derruba, recusa ou EMUDECE as conexões: `docker restart` e `docker pause` não reproduzem a meia conexão (ADR 0002).
async function runChecks(site: OutageSite): Promise<void> {
  const before = await readAdminSnapshot(site);
  reportLine(`antes do primeiro batimento o admin vê worker.state = ${before.worker.state}`);
  assertCondition(
    before.worker.state === BEFORE_FIRST_BEAT || before.worker.state === 'alive',
    `worker.state inicial: ${before.worker.state}`,
  );
  await checkOutage(site, OUTAGE_KIND.KILL, KILL_SYMBOL);
  await checkOutage(site, OUTAGE_KIND.HALF_OPEN, HALF_OPEN_SYMBOL);
  const container = Bun.env['OUTAGE_DOCKER_CONTAINER'];
  if (container !== undefined && container !== '') {
    await checkDockerRestart(site, {
      container,
      symbol: RESTART_SYMBOL,
      dockerCommand: Bun.env['OUTAGE_DOCKER_COMMAND'] ?? DEFAULT_DOCKER_COMMAND,
    });
  }
  await checkStall(site);
  await checkWorkerHealth(site);
}

async function main(): Promise<void> {
  const site = await createOutageSite();
  try {
    await runChecks(site);
  } finally {
    await closeOutageSite(site);
  }
  reportLine('OK');
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(
    `db-outage-test: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
