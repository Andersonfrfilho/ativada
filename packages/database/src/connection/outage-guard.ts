// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DATABASE_CONNECTION_STATE } from './connection.constant.js';
import { isDatabaseConnectionFailure } from './connection-error.js';
import { createOutageLog, type OutageLogEntry } from './outage-log.js';
import type { DatabaseHealth } from './resilient-database.types.js';

export type DatabaseOutageGuardSettings = {
  readonly readHealth: () => DatabaseHealth;
  readonly now: () => number;
  // Quem escreve a linha (o logger do laço): a guarda só decide quando e com quais campos.
  readonly write: (entry: OutageLogEntry) => void;
};

// Uma guarda por laço: o laço pergunta se deve esperar, entrega o erro que recebeu e avisa quando uma ronda deu certo.
export type DatabaseOutageGuard = {
  // Banco `down` e antes da próxima tentativa: a ronda não adianta.
  readonly isWaiting: () => boolean;
  readonly waitMilliseconds: () => number;
  readonly isOutage: (error: unknown) => boolean;
  // `true` = era queda de conexão e já foi resumida no log; `false` = erro de outra natureza, o laço trata como antes.
  readonly handleFailure: (error: unknown) => boolean;
  readonly handleSuccess: () => void;
};

export function createDatabaseOutageGuard(
  settings: DatabaseOutageGuardSettings,
): DatabaseOutageGuard {
  const log = createOutageLog();
  const waitMilliseconds = (): number => {
    const health = settings.readHealth();
    if (health.state !== DATABASE_CONNECTION_STATE.DOWN) return 0;
    return Math.max(0, (health.nextAttemptAt ?? 0) - settings.now());
  };
  return {
    isWaiting: () => waitMilliseconds() > 0,
    waitMilliseconds,
    isOutage: isDatabaseConnectionFailure,
    handleFailure: (error): boolean => {
      if (!isDatabaseConnectionFailure(error)) return false;
      const entry = log.recordFailure({ error, nowMilliseconds: settings.now() });
      if (entry !== undefined) settings.write(entry);
      return true;
    },
    handleSuccess: (): void => {
      const entry = log.recordRecovery(settings.now());
      if (entry !== undefined) settings.write(entry);
    },
  };
}
