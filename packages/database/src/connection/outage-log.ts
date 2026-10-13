// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  OUTAGE_LOG_INTERVAL_MILLISECONDS,
  OUTAGE_LOG_LEVEL,
  OUTAGE_LOG_MESSAGE,
} from './connection.constant.js';
import { readSafeErrorFields } from './safe-error-fields.js';

export type OutageLogEntry = {
  readonly level: (typeof OUTAGE_LOG_LEVEL)[keyof typeof OUTAGE_LOG_LEVEL];
  readonly message: string;
  readonly fields: Readonly<Record<string, string | number>>;
};

export type RecordOutageFailureParams = {
  readonly error: unknown;
  readonly nowMilliseconds: number;
};

export type OutageLog = {
  // Devolve a linha a escrever ou `undefined` quando a falha cabe no resumo anterior.
  readonly recordFailure: (params: RecordOutageFailureParams) => OutageLogEntry | undefined;
  // Devolve "database recovered" só se a queda chegou a ser registrada.
  readonly recordRecovery: (nowMilliseconds: number) => OutageLogEntry | undefined;
};

type Episode = {
  readonly startedAt: number;
  failures: number;
  lastLoggedAt: number;
};

function buildFailureEntry(error: unknown, failures: number, sinceMs: number): OutageLogEntry {
  const { code, errno } = readSafeErrorFields(error);
  return {
    level: OUTAGE_LOG_LEVEL.ERROR,
    message: OUTAGE_LOG_MESSAGE.UNAVAILABLE,
    fields: { code, ...(errno === undefined ? {} : { errno }), failures, sinceMs },
  };
}

// Puro: o relógio vem por parâmetro e nada além do código, do SQLSTATE e de contagens chega ao log.
export function createOutageLog(
  intervalMilliseconds: number = OUTAGE_LOG_INTERVAL_MILLISECONDS,
): OutageLog {
  let episode: Episode | undefined;
  return {
    recordFailure: ({ error, nowMilliseconds }): OutageLogEntry | undefined => {
      if (episode === undefined) {
        episode = { startedAt: nowMilliseconds, failures: 1, lastLoggedAt: nowMilliseconds };
        return buildFailureEntry(error, 1, 0);
      }
      episode.failures += 1;
      if (nowMilliseconds - episode.lastLoggedAt < intervalMilliseconds) return undefined;
      episode.lastLoggedAt = nowMilliseconds;
      return buildFailureEntry(error, episode.failures, nowMilliseconds - episode.startedAt);
    },
    recordRecovery: (nowMilliseconds): OutageLogEntry | undefined => {
      if (episode === undefined) return undefined;
      const entry: OutageLogEntry = {
        level: OUTAGE_LOG_LEVEL.INFO,
        message: OUTAGE_LOG_MESSAGE.RECOVERED,
        fields: { downtimeMs: nowMilliseconds - episode.startedAt, failures: episode.failures },
      };
      episode = undefined;
      return entry;
    },
  };
}
