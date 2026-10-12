// Copyright (c) 2026 Ada Technology. All rights reserved.
import { SOURCE_URL_VARIABLE, WORK_URL_VARIABLE } from './report.constant.js';

export type ReportOptions = {
  readonly sourceUrl: string;
  readonly workUrl: string;
  readonly until: number;
  readonly outputPath: string;
  readonly jsonPath: string;
};

const DEFAULT_OUTPUT = 'docs/relatorio-walk-forward.md';
const DEFAULT_JSON = 'specs/001-simulador-e-sinais/evidence/t6-4/walk-forward-resultado.json';

function readFlag(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function requireText(value: string | undefined, name: string): string {
  if (value === undefined || value === '') throw new Error(`Faltou ${name}.`);
  return value;
}

// `--until` fixa o instante de corte dos dados: o mesmo corte dá o mesmo hash, mesmo com a base crescendo.
export function readReportOptions(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
): ReportOptions {
  const until = Date.parse(requireText(readFlag(args, '--until'), '--until <ISO-8601>'));
  if (!Number.isFinite(until)) throw new Error('--until não é uma data ISO-8601.');
  return {
    sourceUrl: requireText(environment[SOURCE_URL_VARIABLE], SOURCE_URL_VARIABLE),
    workUrl: requireText(environment[WORK_URL_VARIABLE], WORK_URL_VARIABLE),
    until,
    outputPath: readFlag(args, '--out') ?? DEFAULT_OUTPUT,
    jsonPath: readFlag(args, '--json') ?? DEFAULT_JSON,
  };
}
