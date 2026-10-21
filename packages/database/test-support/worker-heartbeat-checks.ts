// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createWorkerHeartbeatRepository } from '../src/worker-heartbeats/worker-heartbeat.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';

const FIRST_INSTANCE = 'worker-check-first';
const SECOND_INSTANCE = 'worker-check-second';
const DEAD_INSTANCE = 'worker-check-dead';
const BEATS = 3;
const FRESH_AGE_MILLISECONDS = 5_000;
const PAUSE_MILLISECONDS = 20;

type CountRow = { readonly total: number };

async function countInstance(client: Bun.SQL, instanceId: string): Promise<number> {
  const rows: unknown =
    await client`SELECT count(*)::int AS total FROM worker_heartbeats WHERE instance_id = ${instanceId}`;
  return (rows as readonly CountRow[])[0]?.total ?? 0;
}

async function pause(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, PAUSE_MILLISECONDS));
}

export async function checkWorkerHeartbeats(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const heartbeats = createWorkerHeartbeatRepository(handle);
  assertCondition((await heartbeats.findLatest()) === undefined, 'tabela deveria começar vazia');

  for (let beat = 0; beat < BEATS; beat += 1) {
    await heartbeats.recordBeat({ instanceId: FIRST_INSTANCE, version: undefined });
    await pause();
  }
  assertCondition(
    (await countInstance(client, FIRST_INSTANCE)) === 1,
    'várias batidas da mesma instância devem ficar numa linha só',
  );
  const first = await heartbeats.findLatest();
  assertCondition(
    first?.instanceId === FIRST_INSTANCE,
    'a batida mais nova é da primeira instância',
  );
  assertCondition(
    first !== undefined &&
      first.ageMilliseconds >= 0 &&
      first.ageMilliseconds < FRESH_AGE_MILLISECONDS,
    'a idade vem do relógio do banco e é pequena logo após a batida',
  );
  reportCheck('batimento: upsert por instância e idade pelo relógio do banco');

  await heartbeats.recordBeat({ instanceId: SECOND_INSTANCE, version: '1.2.3' });
  const latest = await heartbeats.findLatest();
  assertCondition(latest?.instanceId === SECOND_INSTANCE, 'com duas instâncias vale a mais nova');
  reportCheck('batimento: com duas instâncias vale a mais nova');

  await client`INSERT INTO worker_heartbeats (instance_id, last_beat_at) VALUES (${DEAD_INSTANCE}, now() - interval '25 hours')`;
  await heartbeats.recordBeat({ instanceId: SECOND_INSTANCE, version: '1.2.3' });
  assertCondition(
    (await countInstance(client, DEAD_INSTANCE)) === 0,
    'instância sem bater há mais de 24 h deve ser apagada',
  );
  assertCondition(
    (await countInstance(client, FIRST_INSTANCE)) === 1,
    'instância recente não pode ser apagada',
  );
  reportCheck('batimento: instância morta há mais de 24 h sai na próxima batida');
}
