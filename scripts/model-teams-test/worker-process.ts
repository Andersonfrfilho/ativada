// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Providers } from './model-teams-context.js';
import {
  DAILY_BUDGET,
  EXCHANGE,
  INPUT_PRICE,
  MODEL_ID,
  MONTHLY_BUDGET,
  OUTPUT_PRICE,
  SENTINEL,
  SYMBOL,
  TIMEFRAME,
  WORKER_ENTRYPOINT,
} from './model-teams-test.constant.js';

const REPOSITORY_ROOT: string = new URL('../../', import.meta.url).pathname;

export type WorkerProcess = {
  readonly output: () => string;
  readonly terminate: () => void;
  readonly exited: Promise<number>;
};

async function collect(stream: ReadableStream<Uint8Array>, sink: { text: string }): Promise<void> {
  const decoder = new TextDecoder();
  for await (const chunk of stream) sink.text += decoder.decode(chunk, { stream: true });
}

function buildTeamEnvironment(providers: Providers): Record<string, string> {
  const team = (name: string): Record<string, string> => ({
    [`MODEL_TEAM_${name}_MODEL`]: MODEL_ID,
    [`MODEL_TEAM_${name}_INPUT_USD_PER_MTOK`]: INPUT_PRICE,
    [`MODEL_TEAM_${name}_OUTPUT_USD_PER_MTOK`]: OUTPUT_PRICE,
  });
  return {
    ANTHROPIC_API_KEY: SENTINEL.anthropic,
    GEMINI_API_KEY: SENTINEL.gemini,
    OPENAI_API_KEY: SENTINEL.openai,
    ANTHROPIC_BASE_URL: providers.lucas.url,
    GEMINI_BASE_URL: providers.nina.url,
    OPENAI_BASE_URL: providers.olivia.url,
    ...team('LUCAS'),
    ...team('NINA'),
    ...team('OLIVIA'),
    MODEL_TEAM_DAILY_BUDGET_USD: DAILY_BUDGET,
    MODEL_TEAM_MONTHLY_BUDGET_USD: MONTHLY_BUDGET,
    MODEL_TEAM_CADENCE_MINUTES: '15',
    MODEL_TEAM_POLL_SECONDS: '1',
    MODEL_TEAM_TIMEOUT_SECONDS: '5',
  };
}

export type StartWorkerParams = {
  readonly databaseUrl: string;
  readonly restUrl: string;
  readonly streamUrl: string;
  readonly providers: Providers;
};

// O mesmo ponto de entrada de produção, só apontado para o banco descartável, a Binance falsa e os três provedores falsos.
export function startWorker(params: StartWorkerParams): WorkerProcess {
  const child = Bun.spawn([process.execPath, 'run', WORKER_ENTRYPOINT], {
    cwd: REPOSITORY_ROOT,
    env: {
      ...Bun.env,
      ENV: 'test',
      DATABASE_URL: params.databaseUrl,
      MARKET_EXCHANGE: EXCHANGE,
      MARKET_SYMBOLS: SYMBOL,
      MARKET_TIMEFRAMES: TIMEFRAME,
      BINANCE_BASE_URL: params.restUrl,
      BINANCE_STREAM_URL: params.streamUrl,
      STREAM_GAP_LOOKBACK_HOURS: '1',
      WORKER_HEARTBEAT_SECONDS: '5',
      ...buildTeamEnvironment(params.providers),
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const sink = { text: '' };
  const readers = Promise.all([collect(child.stdout, sink), collect(child.stderr, sink)]);
  const exited = child.exited.then(async (code) => {
    await readers;
    return code;
  });
  return {
    output: (): string => sink.text,
    terminate: (): void => void child.kill('SIGTERM'),
    exited,
  };
}
