// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRecord } from '../../packages/database/src/index.js';
import { createWorker, type Worker } from '../../apps/worker-cryptoada/src/stream/create-worker.js';
import { createWorkerLogger } from '../../apps/worker-cryptoada/src/logging/worker-logger.js';
import { WORKER_LOG } from '../../apps/worker-cryptoada/src/worker.constant.js';
import { createMarketDataClient } from '../../packages/market-data/src/index.js';
import {
  startFakeBinanceStreamServer,
  type FakeBinanceStreamServer,
} from '../../packages/market-data/test-support/fake-binance-stream-server.js';
import { buildGridCandle } from './backfill-harness.fixture.js';
import {
  createInMemoryCandleRepository,
  type InMemoryCandleRepository,
} from './in-memory-candle-repository.fixture.js';
import { createManualClock, type ManualClock } from './wait-for.fixture.js';

export const PIPELINE_BASE = Date.parse('2026-10-01T00:00:00.000Z');
export const PIPELINE_HOUR = 3_600_000;
export const PIPELINE_EXCHANGE = 'binance';
const HALF_HOUR = 1_800_000;
const REST_ATTEMPTS = 1;
const DEFAULT_LOOKBACK_HOURS = 4;

export type LogEntry = Readonly<Record<string, unknown>>;
export type PipelineRepository = Pick<
  InMemoryCandleRepository,
  'findMissingOpenTimes' | 'upsertCandles' | 'findLatestOpenTime'
>;

export type PipelineOptions = {
  readonly symbols?: readonly string[];
  readonly seedSymbols?: readonly string[];
  readonly seedOpenTime?: number;
  readonly gapLookbackHours?: number;
  readonly gapCheckIntervalMilliseconds?: number;
  // Quanto o relógio da Binance está à frente do local (negativo: atrás).
  readonly serverClockOffsetMilliseconds?: number;
  // Preenche a janela de retrocesso antes da semente: o histórico anterior não é o assunto do teste.
  readonly shouldPrefillWindow?: boolean;
  readonly wrapRepository?: (repository: InMemoryCandleRepository) => PipelineRepository;
};

export type Pipeline = {
  readonly server: FakeBinanceStreamServer;
  readonly clock: ManualClock;
  readonly repository: InMemoryCandleRepository;
  readonly worker: Worker;
  readonly delays: number[];
  // Quantas chamadas REST já haviam chegado ao servidor quando cada espera foi pedida.
  readonly restRequestsAtSleep: number[];
  readonly logs: (message: string) => LogEntry[];
  readonly closeNextCandle: () => number;
  readonly storedOpenTimes: (symbol: string) => readonly number[];
  readonly finishedRecoveries: () => number;
  readonly serverClockRefreshes: () => number;
};

function buildSeed(options: PipelineOptions, symbols: readonly string[]): CandleRecord[] {
  const lookbackHours = options.gapLookbackHours ?? DEFAULT_LOOKBACK_HOURS;
  const seedOpenTime = options.seedOpenTime ?? PIPELINE_BASE - PIPELINE_HOUR;
  const windowStart =
    Math.ceil((PIPELINE_BASE + HALF_HOUR - lookbackHours * PIPELINE_HOUR) / PIPELINE_HOUR) *
    PIPELINE_HOUR;
  const firstOpenTime =
    options.shouldPrefillWindow === false ? seedOpenTime : Math.min(windowStart, seedOpenTime);
  const seed: CandleRecord[] = [];
  for (const symbol of options.seedSymbols ?? symbols) {
    for (let openTime = firstOpenTime; openTime <= seedOpenTime; openTime += PIPELINE_HOUR) {
      seed.push(buildGridCandle({ symbol, timeframe: '1h', openTime }));
    }
  }
  return seed;
}

export function startPipeline(options: PipelineOptions = {}): Pipeline {
  const server = startFakeBinanceStreamServer();
  const clock = createManualClock(PIPELINE_BASE + HALF_HOUR);
  const symbols = options.symbols ?? ['BTCUSDT'];
  const trackedFrom =
    options.shouldPrefillWindow === false
      ? 0
      : (options.seedOpenTime ?? PIPELINE_BASE - PIPELINE_HOUR);
  const seed = buildSeed(options, symbols);
  const repository = createInMemoryCandleRepository({ now: clock.now, seed });
  const entries: LogEntry[] = [];
  const delays: number[] = [];
  const restRequestsAtSleep: number[] = [];
  const recordedSleep = (milliseconds: number): Promise<void> => {
    delays.push(milliseconds);
    restRequestsAtSleep.push(server.restRequests.length);
    return Bun.sleep(1);
  };
  let serverClockRefreshes = 0;
  const serverClock = {
    now: (): number => clock.now() + (options.serverClockOffsetMilliseconds ?? 0),
    refresh: (): Promise<void> => {
      serverClockRefreshes += 1;
      return Promise.resolve();
    },
  };
  const worker = createWorker({
    exchange: PIPELINE_EXCHANGE,
    symbols,
    timeframes: ['1h'],
    repository: options.wrapRepository?.(repository) ?? repository,
    client: createMarketDataClient({
      baseUrl: server.restUrl,
      now: clock.now,
      maxAttempts: REST_ATTEMPTS,
    }),
    logger: createWorkerLogger({
      appName: 'worker-cryptoada',
      write: (line) => void entries.push(JSON.parse(line) as LogEntry),
    }),
    streamBaseUrl: server.streamUrl,
    staleAfterMilliseconds: 5_000,
    gapLookbackHours: options.gapLookbackHours ?? DEFAULT_LOOKBACK_HOURS,
    serverClock,
    timing: {
      gapCheckIntervalMilliseconds: options.gapCheckIntervalMilliseconds,
      now: clock.now,
      sleep: recordedSleep,
      random: () => 0.5,
      backoffBaseMilliseconds: 100,
      backoffMaxMilliseconds: 400,
    },
  });
  const logs = (message: string): LogEntry[] =>
    entries.filter((entry) => entry.message === message);
  return {
    server,
    clock,
    repository,
    worker,
    delays,
    restRequestsAtSleep,
    logs,
    closeNextCandle: (): number => {
      clock.advance(PIPELINE_HOUR);
      return Math.floor(clock.now() / PIPELINE_HOUR) * PIPELINE_HOUR - PIPELINE_HOUR;
    },
    storedOpenTimes: (symbol): readonly number[] =>
      repository
        .stored()
        .filter((candle) => candle.symbol === symbol && candle.openTime >= trackedFrom)
        .map((candle) => candle.openTime)
        .sort((left, right) => left - right),
    finishedRecoveries: (): number => logs(WORKER_LOG.GAP_RECOVERY_FINISHED).length,
    serverClockRefreshes: (): number => serverClockRefreshes,
  };
}

export async function stopPipeline(pipeline: Pipeline): Promise<void> {
  await pipeline.worker.stop();
  await pipeline.server.stop();
}
