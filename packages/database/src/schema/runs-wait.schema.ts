// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import { check, type CheckBuilder, type ExtraConfigColumn } from 'drizzle-orm/pg-core';

type RunWaitColumns = {
  readonly waitingSince: ExtraConfigColumn;
  readonly waitingOpenTime: ExtraConfigColumn;
  readonly waitingFailedRecoveries: ExtraConfigColumn;
};

// A espera por dado da simulação ao vivo (migration 0016): desde quando e por qual abertura de candle, sempre juntos, e a
// contagem de recuperações que já deixaram o buraco como estava (nunca negativa).
export function runWaitConstraints(table: RunWaitColumns): readonly CheckBuilder[] {
  return [
    check(
      'runs_waiting_pair_check',
      sql`(${table.waitingSince} is null) = (${table.waitingOpenTime} is null)`,
    ),
    check('runs_waiting_failed_recoveries_check', sql`${table.waitingFailedRecoveries} >= 0`),
  ];
}
