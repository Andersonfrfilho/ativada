// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AlertRepository,
  AlertSide,
  ClaimedAlert,
  JsonValue,
} from '../../../packages/database/src/index.js';

export type StoredAlert = {
  readonly id: string;
  readonly userId: string;
  readonly runId: string;
  readonly candleTime: number;
  readonly side: AlertSide;
  readonly payload: JsonValue;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  nextAttemptAt: number;
  lockedUntil: number | undefined;
  lastError: string | undefined;
  sentAt: number | undefined;
};

export type EnqueueParams = {
  readonly userId: string;
  readonly runId: string;
  readonly candleTime: number;
  readonly side: AlertSide;
  readonly payload: JsonValue;
};

export type InMemoryAlerts = {
  readonly repository: AlertRepository;
  readonly rows: StoredAlert[];
  // Espelha a chave única (execução, candle, lado, canal): devolve se a linha nasceu.
  readonly enqueue: (params: EnqueueParams) => boolean;
  readonly linkChat: (userId: string, chatId: string | undefined) => void;
};

let sequence = 0;

// O mesmo contrato do repositório de verdade: só vencido e sem arrendamento, arrendamento por tentativa, chat lido do DONO
// da linha no momento da reivindicação, estado final que não reabre.
export function createInMemoryAlerts(now: () => number): InMemoryAlerts {
  const rows: StoredAlert[] = [];
  const chats = new Map<string, string>();
  const find = (alertId: string): StoredAlert | undefined =>
    rows.find((row) => row.id === alertId && row.status === 'pending');
  const repository: AlertRepository = {
    claimDue: (params): Promise<readonly ClaimedAlert[]> => {
      const due = rows
        .filter(
          (row) =>
            row.status === 'pending' &&
            row.nextAttemptAt <= params.now.getTime() &&
            (row.lockedUntil === undefined || row.lockedUntil <= params.now.getTime()),
        )
        .sort((first, second) => first.nextAttemptAt - second.nextAttemptAt)
        .slice(0, params.limit);
      for (const row of due) {
        row.lockedUntil = params.now.getTime() + params.leaseMilliseconds;
        row.attempts += 1;
      }
      return Promise.resolve(
        due.map((row) => ({
          id: row.id,
          runId: row.runId,
          candleTime: row.candleTime,
          side: row.side,
          payload: row.payload,
          attempts: row.attempts,
          chatId: chats.get(row.userId),
        })),
      );
    },
    markSent: ({ alertId, now: at }): Promise<void> => {
      const row = find(alertId);
      if (row !== undefined) {
        row.status = 'sent';
        row.sentAt = at.getTime();
        row.lockedUntil = undefined;
      }
      return Promise.resolve();
    },
    reschedule: ({ alertId, nextAttemptAt, errorCode }): Promise<void> => {
      const row = find(alertId);
      if (row !== undefined) {
        row.nextAttemptAt = nextAttemptAt.getTime();
        row.lockedUntil = undefined;
        row.lastError = errorCode;
      }
      return Promise.resolve();
    },
    markFailed: ({ alertId, errorCode }): Promise<void> => {
      const row = find(alertId);
      if (row !== undefined) {
        row.status = 'failed';
        row.lockedUntil = undefined;
        row.lastError = errorCode;
      }
      return Promise.resolve();
    },
    markSkipped: ({ alertId, errorCode }): Promise<void> => {
      const row = find(alertId);
      if (row !== undefined) {
        row.status = 'skipped';
        row.lockedUntil = undefined;
        row.lastError = errorCode;
      }
      return Promise.resolve();
    },
  };
  return {
    repository,
    rows,
    linkChat: (userId, chatId): void => {
      if (chatId === undefined) chats.delete(userId);
      else chats.set(userId, chatId);
    },
    enqueue: (params): boolean => {
      const exists = rows.some(
        (row) =>
          row.runId === params.runId &&
          row.candleTime === params.candleTime &&
          row.side === params.side,
      );
      if (exists) return false;
      sequence += 1;
      rows.push({
        ...params,
        id: `018f0000-0000-7000-8000-${String(sequence).padStart(12, '0')}`,
        status: 'pending',
        attempts: 0,
        nextAttemptAt: now(),
        lockedUntil: undefined,
        lastError: undefined,
        sentAt: undefined,
      });
      return true;
    },
  };
}
