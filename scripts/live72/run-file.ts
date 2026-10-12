// Copyright (c) 2026 Ada Technology. All rights reserved.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { z } from '../../packages/environment/src/index.js';
import { JSON_INDENT } from './live72.constant.js';

export const runFileSchema = z.strictObject({
  runId: z.string().min(1),
  userId: z.string().min(1),
  goalId: z.string().min(1),
  strategyName: z.string().min(1),
  strategyVersionId: z.string().min(1),
  strategyVersion: z.number().int(),
  configHash: z.string().min(1),
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
  initialBalance: z.string().min(1),
  periodStart: z.number().int(),
  leadInCandles: z.number().int(),
  startedAt: z.iso.datetime(),
  plannedEndAt: z.iso.datetime(),
  plannedWorkerKillAt: z.iso.datetime(),
});

export type RunFile = z.infer<typeof runFileSchema>;

export function readRunFile(path: string): RunFile | undefined {
  if (!existsSync(path)) return undefined;
  return runFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export function writeRunFile(path: string, run: RunFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(runFileSchema.parse(run), null, JSON_INDENT)}\n`);
}
