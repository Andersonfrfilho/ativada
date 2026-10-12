// Copyright (c) 2026 Ada Technology. All rights reserved.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

import type { CliContext } from './cli-context.js';
import { readDatabaseFacts } from './live72-facts.js';
import { openLive72Sql } from './live72-database.js';
import { readEventsFile, summarizeEvents } from './live72-events.js';
import { aggregateLogErrors, mergeLogErrors } from './log-errors.js';
import { buildReport } from './report-builder.js';
import { renderReport } from './report-render.js';
import { readRunFile } from './run-file.js';

function readLogErrors(logsDirectory: string, since: string): ReturnType<typeof mergeLogErrors> {
  if (!existsSync(logsDirectory)) return {};
  const parts = readdirSync(logsDirectory)
    .filter((name) => /\.log(\.\d+)?$/.test(name))
    .map((name) =>
      aggregateLogErrors(readFileSync(`${logsDirectory}/${name}`, 'utf8').split('\n'), since),
    );
  return mergeLogErrors(parts);
}

export async function runReport(context: CliContext): Promise<string> {
  const run = readRunFile(context.paths.runFile);
  if (run === undefined) throw new Error('nenhuma simulação iniciada (make live72-start)');
  const parsed = readEventsFile(context.paths.eventsFile);
  const events = summarizeEvents(parsed.events, run.startedAt);
  const sql = openLive72Sql(context.environment.DATABASE_URL);
  try {
    const database = await readDatabaseFacts(sql, {
      run,
      killAt: events.controlledKill?.at ?? null,
    });
    const data = buildReport({
      run,
      now: Date.now(),
      events,
      invalidEventLines: parsed.invalidLines,
      logErrors: readLogErrors(context.paths.logs, run.startedAt),
      database,
    });
    const text = renderReport(data);
    writeFileSync(context.paths.reportFile, `${text}\n`);
    return text;
  } finally {
    await sql.close().catch(() => undefined);
  }
}
