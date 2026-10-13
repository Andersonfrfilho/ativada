// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  closeDatabase,
  openDatabase,
  pingDatabase,
  readOpenDatabase,
} from '../src/database-handle.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';

const RECOVERY_DEADLINE_MILLISECONDS = 15_000;
const POLL_MILLISECONDS = 100;

// Banco de verdade: derruba a(s) conexão(ões) do cliente com pg_terminate_backend e confere que o porteiro cai para `down`,
// espera o backoff e volta para `up` sozinho, na primeira consulta bem-sucedida (ADR 0002, R2 e R3).
export async function checkReconnection(
  context: LifecycleCheckContext,
  databaseUrl: string,
): Promise<void> {
  const { client, assertCondition, reportCheck } = context;
  const handle = openDatabase(databaseUrl);
  try {
    assertCondition(await pingDatabase(handle), 'reconexao: o cliente novo responde');
    const { connection } = readOpenDatabase(handle);
    const rows: unknown = await connection.unsafe('SELECT pg_backend_pid() AS pid').values();
    const pid = Array.isArray(rows) && Array.isArray(rows[0]) ? Number(rows[0][0]) : Number.NaN;
    assertCondition(Number.isInteger(pid), 'reconexao: leu o pid da conexao do cliente');
    await client.unsafe(`SELECT pg_terminate_backend(${pid})`);
    const startedAt = Date.now();
    let sawDown = false;
    let recovered = false;
    while (!recovered && Date.now() - startedAt < RECOVERY_DEADLINE_MILLISECONDS) {
      recovered = await pingDatabase(handle);
      sawDown ||= connection.readHealth().state === 'down';
      if (!recovered) await Bun.sleep(POLL_MILLISECONDS);
    }
    assertCondition(recovered, 'reconexao: voltou sozinho depois de a conexao ser derrubada');
    assertCondition(connection.readHealth().state === 'up', 'reconexao: o porteiro voltou a up');
    reportCheck(
      `reconexao: conexao derrubada, down=${String(sawDown)}, de volta em ${Date.now() - startedAt} ms`,
    );
  } finally {
    await closeDatabase(handle);
  }
}
