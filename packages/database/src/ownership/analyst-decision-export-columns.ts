// Copyright (c) 2026 Ada Technology. All rights reserved.

// O que a exportação da conta leva de `analyst_decisions`: as colunas do schema, sem `id` nem `userId`.
export const ANALYST_DECISION_EXPORT_COLUMNS: readonly string[] = [
  'runId',
  'candleTime',
  'version',
  'mode',
  'status',
  'posture',
  'reason',
  'cadenceMinutes',
  'entryGate',
  'riskScale',
  'isTimeExitDue',
  'forecast',
  'readings',
  'specialists',
  'locks',
  'commands',
  'message',
  'failureCode',
  'createdAt',
];
