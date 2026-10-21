// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  CRASH_MESSAGES,
  FORBIDDEN_LOG_TEXT,
  MAX_SUMMARY_LINES,
} from './db-outage-test.constant.js';
import { assertCondition, type OutageSite } from './db-outage-context.js';

const MINIMUM_PASSWORD_LENGTH = 4;
const SUMMARY_MESSAGE = 'database unavailable';
const RECOVERY_MESSAGE = 'database recovered';

// O log do worker durante a queda (RNF01 e RNF02): resumo com `code`, pouquíssimas linhas, volta registrada e nada de URL,
// senha, texto de consulta nem as mensagens de falha por ronda de antes.
export function auditWorkerLog(site: OutageSite, fromIndex: number): string {
  const lines = site.worker.current.lines().slice(fromIndex);
  const messageOf = (line: (typeof lines)[number]): unknown => line.entry['message'];
  const summaries = lines.filter((line) => messageOf(line) === SUMMARY_MESSAGE);
  const recoveries = lines.filter((line) => messageOf(line) === RECOVERY_MESSAGE);
  assertCondition(summaries.length >= 1, 'nenhum resumo "database unavailable" no log do worker');
  assertCondition(
    summaries.length <= MAX_SUMMARY_LINES,
    `${summaries.length} linhas de queda (limite ${MAX_SUMMARY_LINES})`,
  );
  const codes = new Set<string>();
  for (const summary of summaries) {
    const code = summary.entry['code'];
    assertCondition(typeof code === 'string' && code.length > 0, 'resumo sem code');
    if (typeof code === 'string') codes.add(code);
  }
  assertCondition(recoveries.length >= 1, 'o worker não registrou a volta do banco');
  const crashes = lines.filter((line) => CRASH_MESSAGES.some((text) => messageOf(line) === text));
  assertCondition(crashes.length === 0, `${crashes.length} linhas de falha por ronda`);
  const text = site.worker.current.rawText();
  for (const forbidden of FORBIDDEN_LOG_TEXT) {
    assertCondition(!text.includes(forbidden), `o log do worker contém "${forbidden}"`);
  }
  assertCondition(
    site.password.length < MINIMUM_PASSWORD_LENGTH || !text.includes(site.password),
    'o log do worker contém a senha do banco',
  );
  return `${summaries.length} linhas "${SUMMARY_MESSAGE}" (códigos: ${[...codes].join(', ')}) e ${recoveries.length} "${RECOVERY_MESSAGE}", sem URL, senha nem consulta`;
}
