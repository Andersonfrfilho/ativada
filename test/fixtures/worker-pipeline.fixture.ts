// Copyright (c) 2026 Ada Technology. All rights reserved.
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
import { createManualClock, createRecordingSleep, type ManualClock } from './wait-for.fixture.js';

export const PIPELINE_BASE = Date.parse('2026-10-01T00:00:00.000Z');
export const PIPELINE_HOUR = 3_600_000;
export const PIPELINE_EXCHANGE = 'binance';
const HALF_HOUR = 1_800_000;
const REST_ATTEMPTS = 1;

export type LogEntry = Readonly<Record<string, unknown>>;
export type PipelineRepository = Pick<
  InMemoryCandleRepository,
  'findMissingOpenTimes' | 'upsertCandles' | 'findLatestOpenTime'
>;

export type PipelineOptions = {
  readonly symbols?: readonly string[];
  readonly seedSymbols?: readonly string[];
  readonly seedOpenTime?: number;
  readonly wrapRepository?: (repository: InMemoryCandleRepository) => PipelineRepository;
};

export type Pipeline = {
  readonly server: FakeBinanceStreamServer;
  readonly clock: ManualClock;
  readonly repository: InMemoryCandleRepository;
  readonly worker: Worker;
  readonly delays: number[];
  readonly logs: (message: string) => LogEntry[];
  readonly closeNextCandle: () => number;
  readonly storedOpenTimes: (symbol: string) => readonly number[];
  readonly finishedRecoveries: () => number;
};

export function startPipeline(options: PipelineOptions = {}): Pipeline {
  const server = startFakeBinanceStreamServer();
  const clock = createManualClock(PIPELINE_BASE + HALF_HOUR);
  const symbols = options.symbols ?? ['BTCUSDT'];
  const seed = (options.seedSymbols ?? symbols).map((symbol) =>
    buildGridCandle({
      symbol,
      timeframe: '1h',
      openTime: options.seedOpenTime ?? PIPELINE_BASE - PIPELINE_HOUR,
    }),
  );
  const repository = createInMemoryCandleRepository({ now: clock.now, seed });
  const entries: LogEntry[] = [];
  const recorder = createRecordingSleep();
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
    timing: {
      now: clock.now,
      sleep: recorder.sleep,
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
    delays: recorder.delays,
    logs,
    closeNextCandle: (): number => {
      clock.advance(PIPELINE_HOUR);
      return Math.floor(clock.now() / PIPELINE_HOUR) * PIPELINE_HOUR - PIPELINE_HOUR;
    },
    storedOpenTimes: (symbol): readonly number[] =>
      repository
        .stored()
        .filter((candle) => candle.symbol === symbol)
        .map((candle) => candle.openTime)
        .sort((left, right) => left - right),
    finishedRecoveries: (): number => logs(WORKER_LOG.GAP_RECOVERY_FINISHED).length,
  };
}

export async function stopPipeline(pipeline: Pipeline): Promise<void> {
  await pipeline.worker.stop();
  await pipeline.server.stop();
}
