// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  POLL_PAUSE_MILLISECONDS,
  RUN_TIMEOUT_MILLISECONDS,
  SERIES_PAGE_SIZE,
} from './api-runs-test.constant.js';
import { assertCondition, type ApiResponse, type ApiRunsContext } from './api-runs-test-context.js';

export type RunData = {
  readonly id: string;
  readonly status: string;
  readonly progress: number;
  readonly errorCode: string | null;
  readonly metrics: Record<string, unknown> | null;
  readonly overfitting: Record<string, unknown> | null;
  readonly warnings: readonly { readonly code: string }[];
};

type Page = {
  readonly data: readonly Record<string, unknown>[];
  readonly pagination: { readonly nextCursor: string | null; readonly perPage: number };
};

export function dataOf<TData>(response: ApiResponse, expectedStatus: number): TData {
  assertCondition(
    response.status === expectedStatus,
    `status ${response.status} em vez de ${expectedStatus}: ${response.text.slice(0, 300)}`,
  );
  return (response.json as { data: TData }).data;
}

export async function readRun(
  context: ApiRunsContext,
  subject: string,
  runId: string,
): Promise<RunData> {
  return dataOf<RunData>(await context.call({ subject, path: `/v1/runs/${runId}` }), 200);
}

// Consulta devagar (700 ms): o limite geral de 120/min por usuário repõe 2/s e a espera não pode esgotá-lo.
export async function waitForRun(
  context: ApiRunsContext,
  params: {
    readonly subject: string;
    readonly runId: string;
    readonly until: (run: RunData) => boolean;
    readonly label: string;
    readonly pauseMilliseconds?: number;
  },
): Promise<RunData> {
  const deadline = Date.now() + RUN_TIMEOUT_MILLISECONDS;
  for (;;) {
    const run = await readRun(context, params.subject, params.runId);
    if (params.until(run)) return run;
    assertCondition(Date.now() < deadline, `${params.label}: tempo esgotado em ${run.status}`);
    await Bun.sleep(params.pauseMilliseconds ?? POLL_PAUSE_MILLISECONDS);
  }
}

export function isFinished(run: RunData): boolean {
  return run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled';
}

// Percorre até `maxPages` páginas por cursor (limite 100), sem repetir linha.
export async function readPages(
  context: ApiRunsContext,
  params: { readonly subject: string; readonly path: string; readonly maxPages: number },
): Promise<{ readonly rows: readonly Record<string, unknown>[]; readonly isComplete: boolean }> {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < params.maxPages; page += 1) {
    const suffix: string =
      cursor === null
        ? `?limit=${SERIES_PAGE_SIZE}`
        : `?limit=${SERIES_PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`;
    const response: ApiResponse = await context.call({
      subject: params.subject,
      path: `${params.path}${suffix}`,
    });
    assertCondition(response.status === 200, `${params.path}: ${response.status} ${response.text}`);
    const body = response.json as Page;
    assertCondition(body.pagination.perPage === SERIES_PAGE_SIZE, 'perPage devolvido');
    rows.push(...body.data);
    cursor = body.pagination.nextCursor;
    if (cursor === null) return { rows, isComplete: true };
  }
  return { rows, isComplete: false };
}

export function strictlyIncreasing(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || value > (values[index - 1] ?? 0));
}

export function splitCsv(text: string): {
  readonly header: string;
  readonly lines: readonly string[];
} {
  const lines = text.split('\r\n');
  assertCondition(lines.at(-1) === '', 'o CSV termina em CRLF');
  const [header = '', ...rows] = lines.slice(0, -1);
  return { header, lines: rows };
}
