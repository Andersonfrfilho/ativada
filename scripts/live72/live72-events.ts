// Copyright (c) 2026 Ada Technology. All rights reserved.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { z } from '../../packages/environment/src/index.js';
import { EVENT_TYPE, MUTATING_COMMANDS, type CliCommand } from './live72.constant.js';
import { runCountsSchema, type RunCounts } from './run-counts.js';

const eventSchema = z.looseObject({ at: z.iso.datetime(), type: z.string().min(1) });

export type Live72Event = z.infer<typeof eventSchema>;

export type ParsedEvents = {
  readonly events: readonly Live72Event[];
  readonly invalidLines: number;
};

export type Intervention = { readonly at: string; readonly command: string };

export type EventSummary = {
  readonly supervisorStarts: number;
  readonly supervisorStops: number;
  readonly childExits: Readonly<Record<string, number>>;
  readonly controlledKill: { readonly at: string; readonly before: RunCounts | null } | undefined;
  readonly interventions: readonly Intervention[];
  readonly cronRuns: number;
  readonly cronFailures: number;
};

export function appendEvent(
  path: string,
  type: string,
  fields: Readonly<Record<string, unknown>> = {},
): void {
  mkdirSync(dirname(path), { recursive: true });
  const line = JSON.stringify({ ...fields, at: new Date().toISOString(), type });
  appendFileSync(path, `${line}\n`);
}

export function recordCliCommand(path: string, command: CliCommand): void {
  appendEvent(path, EVENT_TYPE.CLI_COMMAND, {
    actor: 'cli',
    command,
    isMutating: MUTATING_COMMANDS.includes(command),
  });
}

export function parseEvents(text: string): ParsedEvents {
  const events: Live72Event[] = [];
  let invalidLines = 0;
  for (const line of text.split('\n').filter((entry) => entry.trim().length > 0)) {
    const parsed = parseLine(line);
    if (parsed === undefined) invalidLines += 1;
    else events.push(parsed);
  }
  return { events, invalidLines };
}

function parseLine(line: string): Live72Event | undefined {
  try {
    const result = eventSchema.safeParse(JSON.parse(line));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export function readEventsFile(path: string): ParsedEvents {
  return parseEvents(existsSync(path) ? readFileSync(path, 'utf8') : '');
}

function readText(event: Live72Event, key: string): string {
  const value = event[key];
  return typeof value === 'string' ? value : '';
}

function countBy(events: readonly Live72Event[], key: string): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const event of events) {
    const name = readText(event, key);
    totals[name] = (totals[name] ?? 0) + 1;
  }
  return totals;
}

function readBefore(event: Live72Event): RunCounts | null {
  const parsed = runCountsSchema.safeParse(event['before']);
  return parsed.success ? parsed.data : null;
}

// `since` é o início da simulação: o que veio antes (preparação, ensaios) não conta como execução.
export function summarizeEvents(events: readonly Live72Event[], since: string): EventSummary {
  const inRun = events.filter((event) => event.at >= since);
  const ofType = (type: string): Live72Event[] => inRun.filter((event) => event.type === type);
  const kill = ofType(EVENT_TYPE.CONTROLLED_WORKER_KILL)[0];
  const cron = ofType(EVENT_TYPE.CRON_RUN);
  return {
    supervisorStarts: ofType(EVENT_TYPE.SUPERVISOR_START).length,
    supervisorStops: ofType(EVENT_TYPE.SUPERVISOR_STOP).length,
    childExits: countBy(ofType(EVENT_TYPE.CHILD_EXIT), 'child'),
    controlledKill: kill === undefined ? undefined : { at: kill.at, before: readBefore(kill) },
    interventions: ofType(EVENT_TYPE.CLI_COMMAND)
      .filter((event) => event['isMutating'] === true)
      .map((event) => ({ at: event.at, command: readText(event, 'command') })),
    cronRuns: cron.length,
    cronFailures: cron.filter((event) => event['exitCode'] !== 0).length,
  };
}
