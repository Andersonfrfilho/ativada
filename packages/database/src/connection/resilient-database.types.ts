// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { DatabaseConnectionState } from './connection.constant.js';
import type { SqlClient } from './sql-client.types.js';

export type DatabaseHealth = {
  readonly state: DatabaseConnectionState;
  // Falhas de conexão da queda em curso (zero quando `up`).
  readonly consecutiveFailures: number;
  readonly downSince: number | undefined;
  // Antes deste instante o porteiro falha na hora, sem tocar a rede.
  readonly nextAttemptAt: number | undefined;
  readonly lastFailureCode: string | undefined;
  readonly lastFailureErrno: string | undefined;
  readonly lastFailureAt: number | undefined;
};

export type ResilientDatabaseSettings = {
  // Abre um cliente novo com as MESMAS opções do primeiro (reabrir é trocar o cliente, nunca a configuração).
  readonly openClient: () => SqlClient;
  // Teto por unidade de trabalho (consulta avulsa ou transação inteira).
  readonly queryTimeoutMilliseconds: number;
  // Teto do `SELECT 1` em cliente novo que confirma se o banco responde quando o teto acima estoura.
  readonly confirmTimeoutMilliseconds: number;
  readonly now: () => number;
  // Sorteio em [0, 1] do backoff; entra de fora para os testes não dependerem de `Math.random`.
  readonly random: () => number;
  readonly failureThreshold: number;
  readonly reconnectBaseMilliseconds: number;
  readonly reconnectMaxMilliseconds: number;
};

// É um `SqlClient` (o Drizzle o usa no lugar do `Bun.SQL`) que sabe quando o banco caiu e troca o cliente por baixo.
export type ResilientDatabase = SqlClient & {
  readonly readHealth: () => DatabaseHealth;
};
