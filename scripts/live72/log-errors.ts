// Copyright (c) 2026 Ada Technology. All rights reserved.
const FAILURE_LEVELS: readonly string[] = ['error', 'fatal'];
const CODE_KEYS = ['code', 'errorCode', 'event'] as const;
const UNCODED = 'sem_codigo';
const MAXIMUM_CODE_LENGTH = 80;

export type LogErrorTotals = Readonly<Record<string, number>>;

function readLevel(entry: Record<string, unknown>): string {
  const level = entry['level'];
  return typeof level === 'string' ? level.toLowerCase() : '';
}

function readCode(entry: Record<string, unknown>): string {
  for (const key of CODE_KEYS) {
    const value = entry[key];
    if (typeof value === 'string' && value.length > 0) return value.slice(0, MAXIMUM_CODE_LENGTH);
  }
  const message = entry['message'];
  return typeof message === 'string' && message.length > 0
    ? message.slice(0, MAXIMUM_CODE_LENGTH)
    : UNCODED;
}

// Linha sem `timestamp` legível entra na conta: melhor contar a mais do que esconder um erro.
function isBefore(entry: Record<string, unknown>, since: string): boolean {
  const timestamp = entry['timestamp'];
  return typeof timestamp === 'string' && timestamp < since;
}

function parseEntry(line: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed))
      : undefined;
  } catch {
    return undefined;
  }
}

// Só o código (nunca o texto livre do erro) entra na conta: o relatório não carrega dado do log.
export function aggregateLogErrors(lines: readonly string[], since?: string): LogErrorTotals {
  const totals: Record<string, number> = {};
  for (const line of lines) {
    const entry = parseEntry(line);
    if (entry === undefined || !FAILURE_LEVELS.includes(readLevel(entry))) continue;
    if (since !== undefined && isBefore(entry, since)) continue;
    const code = readCode(entry);
    totals[code] = (totals[code] ?? 0) + 1;
  }
  return totals;
}

export function mergeLogErrors(parts: readonly LogErrorTotals[]): LogErrorTotals {
  const merged: Record<string, number> = {};
  for (const part of parts) {
    for (const [code, count] of Object.entries(part)) merged[code] = (merged[code] ?? 0) + count;
  }
  return merged;
}
