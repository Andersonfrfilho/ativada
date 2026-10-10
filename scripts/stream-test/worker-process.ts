// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EXCHANGE,
  STREAM_STALE_SECONDS,
  SYMBOL,
  TIMEFRAME,
  WORKER_ENTRYPOINT,
} from './stream-test.constant.js';

const REPOSITORY_ROOT: string = new URL('../../', import.meta.url).pathname;

export type WorkerProcess = {
  readonly pid: number;
  readonly output: () => string;
  readonly countMessages: (message: string) => number;
  readonly hasExited: () => boolean;
  readonly terminate: () => void;
  readonly exited: Promise<number>;
};

export type StartWorkerParams = {
  readonly databaseUrl: string;
  readonly restUrl: string;
  readonly streamUrl: string;
};

async function collect(stream: ReadableStream<Uint8Array>, sink: { text: string }): Promise<void> {
  const decoder = new TextDecoder();
  for await (const chunk of stream) sink.text += decoder.decode(chunk, { stream: true });
}

// O mesmo ponto de entrada de produção, só apontado para o banco descartável e a Binance falsa.
export function startWorker(params: StartWorkerParams): WorkerProcess {
  const child = Bun.spawn([process.execPath, 'run', WORKER_ENTRYPOINT], {
    cwd: REPOSITORY_ROOT,
    env: {
      ...Bun.env,
      DATABASE_URL: params.databaseUrl,
      MARKET_EXCHANGE: EXCHANGE,
      MARKET_SYMBOLS: SYMBOL,
      MARKET_TIMEFRAMES: TIMEFRAME,
      BINANCE_BASE_URL: params.restUrl,
      BINANCE_STREAM_URL: params.streamUrl,
      STREAM_STALE_SECONDS,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const sink = { text: '' };
  const readers = Promise.all([collect(child.stdout, sink), collect(child.stderr, sink)]);
  let hasExited = false;
  const exited = child.exited.then(async (code) => {
    await readers;
    hasExited = true;
    return code;
  });
  return {
    pid: child.pid,
    output: (): string => sink.text,
    countMessages: (message): number => sink.text.split(`"message":"${message}"`).length - 1,
    hasExited: (): boolean => hasExited,
    terminate: (): void => void child.kill('SIGTERM'),
    exited,
  };
}
