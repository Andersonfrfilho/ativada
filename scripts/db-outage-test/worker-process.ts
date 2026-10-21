// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  DATABASE_QUERY_TIMEOUT_SECONDS,
  EXCHANGE,
  LIVE_POLL_SECONDS,
  MARKET_SYMBOL,
  MARKET_TIMEFRAME,
  STREAM_GAP_LOOKBACK_HOURS,
  STREAM_STALE_SECONDS,
  WORKER_ENTRYPOINT,
  WORKER_HEARTBEAT_SECONDS,
} from './db-outage-test.constant.js';

const REPOSITORY_ROOT: string = new URL('../../', import.meta.url).pathname;

export type WorkerLine = { readonly at: number; readonly entry: Readonly<Record<string, unknown>> };

export type OutageWorker = {
  readonly lines: () => readonly WorkerLine[];
  readonly rawText: () => string;
  readonly kill: () => Promise<void>;
  readonly terminate: () => Promise<number>;
  readonly hasExited: () => boolean;
};

export type StartOutageWorkerParams = {
  readonly databaseUrl: string;
  readonly restUrl: string;
  readonly streamUrl: string;
};

function buildEnvironment(params: StartOutageWorkerParams): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [name, value] of Object.entries(Bun.env)) if (value !== undefined) base[name] = value;
  return {
    ...base,
    DATABASE_URL: params.databaseUrl,
    DATABASE_QUERY_TIMEOUT_SECONDS: String(DATABASE_QUERY_TIMEOUT_SECONDS),
    WORKER_HEARTBEAT_SECONDS: String(WORKER_HEARTBEAT_SECONDS),
    LIVE_POLL_SECONDS: String(LIVE_POLL_SECONDS),
    MARKET_EXCHANGE: EXCHANGE,
    MARKET_SYMBOLS: MARKET_SYMBOL,
    MARKET_TIMEFRAMES: MARKET_TIMEFRAME,
    BINANCE_BASE_URL: params.restUrl,
    BINANCE_STREAM_URL: params.streamUrl,
    STREAM_STALE_SECONDS: String(STREAM_STALE_SECONDS),
    STREAM_GAP_LOOKBACK_HOURS: String(STREAM_GAP_LOOKBACK_HOURS),
  };
}

async function collect(
  stream: ReadableStream<Uint8Array>,
  sink: { text: string; lines: WorkerLine[]; rest: string },
): Promise<void> {
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    const text = decoder.decode(chunk, { stream: true });
    sink.text += text;
    sink.rest += text;
    const parts = sink.rest.split('\n');
    sink.rest = parts.pop() ?? '';
    for (const part of parts) {
      try {
        const entry: unknown = JSON.parse(part);
        if (typeof entry === 'object' && entry !== null) {
          sink.lines.push({ at: Date.now(), entry: entry as Record<string, unknown> });
        }
      } catch {
        // linha que não é JSON entra só no texto cru
      }
    }
  }
}

// O ponto de entrada de produção do worker, apontado para o banco descartável (pelo proxy) e a Binance falsa.
export function startOutageWorker(params: StartOutageWorkerParams): OutageWorker {
  const child = Bun.spawn([process.execPath, 'run', WORKER_ENTRYPOINT], {
    cwd: REPOSITORY_ROOT,
    env: buildEnvironment(params),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const sink = { text: '', lines: [] as WorkerLine[], rest: '' };
  const readers = Promise.all([collect(child.stdout, sink), collect(child.stderr, sink)]);
  let hasExited = false;
  const exited = child.exited.then(async (code) => {
    await readers;
    hasExited = true;
    return code;
  });
  return {
    lines: () => sink.lines,
    rawText: () => sink.text,
    hasExited: () => hasExited,
    kill: async (): Promise<void> => {
      child.kill('SIGKILL');
      await exited;
    },
    terminate: (): Promise<number> => {
      child.kill('SIGTERM');
      return exited;
    },
  };
}
