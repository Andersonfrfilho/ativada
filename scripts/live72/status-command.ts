// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CliContext } from './cli-context.js';
import { openSession } from './identity-session.js';
import { readEventsFile, summarizeEvents } from './live72-events.js';
import { isApiHealthy, readDiskFreeKilobytes, readProcessStates } from './process-state.js';
import { readRunFile } from './run-file.js';
import { probeTickerAgeSeconds } from './ticker-probe.js';
import { EMPTY_DATABASE_STATUS, readDatabaseStatus } from './status-queries.js';
import { openLive72Sql } from './live72-database.js';
import { formatStatus, type StatusFacts } from './status-format.js';
import { RUN_SETUP } from './live72.constant.js';

async function readTickerAge(context: CliContext): Promise<number | null> {
  try {
    const session = await openSession({
      identity: context.identity,
      apiBaseUrl: context.apiUrl,
      credentials: context.credentials,
    });
    const age = await probeTickerAgeSeconds({
      apiBaseUrl: context.apiUrl,
      accessToken: session.accessToken,
      origin: context.identity.panelOrigin,
      symbol: RUN_SETUP.SYMBOL,
    });
    return age ?? null;
  } catch {
    return null;
  }
}

async function readDatabase(
  context: CliContext,
  run: NonNullable<ReturnType<typeof readRunFile>>,
): Promise<typeof EMPTY_DATABASE_STATUS> {
  const sql = openLive72Sql(context.environment.DATABASE_URL);
  try {
    return await readDatabaseStatus(sql, run);
  } catch {
    return EMPTY_DATABASE_STATUS;
  } finally {
    await sql.close().catch(() => undefined);
  }
}

export async function collectStatusFacts(context: CliContext): Promise<StatusFacts> {
  const run = readRunFile(context.paths.runFile);
  const events = readEventsFile(context.paths.eventsFile).events;
  const isApiUp = await isApiHealthy(context.apiUrl);
  return {
    now: Date.now(),
    run,
    ...(run === undefined ? EMPTY_DATABASE_STATUS : await readDatabase(context, run)),
    events: run === undefined ? null : summarizeEvents(events, run.startedAt),
    processes: readProcessStates(context.paths.run),
    isApiHealthy: isApiUp,
    tickerAgeSeconds: isApiUp ? await readTickerAge(context) : null,
    diskFreeKilobytes: await readDiskFreeKilobytes(context.paths.root),
  };
}

export async function runStatus(context: CliContext): Promise<string> {
  return formatStatus(await collectStatusFacts(context));
}
