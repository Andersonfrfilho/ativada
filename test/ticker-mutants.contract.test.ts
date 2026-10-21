// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { TICKER_MUTANT_TARGET } from './fixtures/ticker/ticker-mutation.fixture.js';
import {
  removeMutantCopies,
  runSourceMutant,
  type MutantVerdict,
  type SourceEdit,
  type SourceMutant,
} from './fixtures/walk-forward/walk-forward-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 900_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: SourceMutant = { name: 'CONTROL', edits: [] };
const AGGREGATOR = 'ticker/tick-aggregator.ts';
const PERCENT = 'ticker/percent-change.ts';
const SCHEMA = 'ticker/ticker-stream.schema.ts';
const STREAM = 'ticker/create-ticker-stream.ts';
const CANDLE_AGGREGATOR = 'ticker/candle-aggregator.ts';
const CANDLE_SCHEMA = 'ticker/ticker-candle.schema.ts';
const SETTINGS = 'ticker/resolve-ticker-settings.ts';
const CONSTANT = 'ticker/ticker.constant.ts';
const ALWAYS_FALSE = 'false as boolean';

function edit(file: string, find: string, replace: string): SourceEdit[] {
  return [{ file, find, replace, occurrences: 1 }];
}

const AGGREGATOR_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'EVERY_TICK_OPENS_A_NEW_WINDOW',
    edits: edit(AGGREGATOR, 'pair.timer ??= settings.setTimer(', 'pair.timer = settings.setTimer('),
  },
  {
    name: 'FIRST_TICK_OF_THE_WINDOW_WINS',
    edits: edit(AGGREGATOR, '      pair.latest = tick;\n', ''),
  },
  {
    name: 'REDELIVERED_TICK_PUBLISHED_AGAIN',
    edits: edit(AGGREGATOR, 'tick.eventTime <= lastTime', 'tick.eventTime < lastTime'),
  },
  {
    name: 'OLDER_TICK_ACCEPTED',
    edits: edit(AGGREGATOR, '(lastTime !== undefined && tick.eventTime <= lastTime)', ALWAYS_FALSE),
  },
  {
    name: 'WINDOW_SHORTER_THAN_THE_INTERVAL',
    edits: edit(
      AGGREGATOR,
      '() => flush(tick.symbol), settings.intervalMilliseconds)',
      '() => flush(tick.symbol), settings.intervalMilliseconds / 2)',
    ),
  },
  {
    name: 'CLOSE_LEAVES_THE_TIMERS',
    edits: edit(
      AGGREGATOR,
      '        if (pair.timer !== undefined) settings.clearTimer(pair.timer);\n',
      '',
    ),
  },
  {
    name: 'CLOSED_AGGREGATOR_KEEPS_ACCEPTING',
    edits: edit(AGGREGATOR, 'if (isClosed || (lastTime', 'if ((lastTime'),
  },
  {
    name: 'PUBLISHER_ERROR_ESCAPES',
    edits: edit(AGGREGATOR, '      settings.reportError?.(error);', '      throw error;'),
  },
];

const PERCENT_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'PERCENT_TRUNCATES_INSTEAD_OF_ROUNDING',
    edits: edit(
      PERCENT,
      '(magnitude * TWO + denominator) / (denominator * TWO)',
      'magnitude / denominator',
    ),
  },
  {
    name: 'PERCENT_LOSES_THE_SIGN',
    edits: edit(PERCENT, 'return numerator < 0n ? -quotient : quotient;', 'return quotient;'),
  },
  {
    name: 'ZERO_OPEN_PRICE_DIVIDES',
    edits: edit(PERCENT, '  if (openDigits === 0n) return undefined;\n', ''),
  },
  {
    name: 'NON_DECIMAL_TEXT_ACCEPTED',
    edits: edit(
      PERCENT,
      'if (!DECIMAL_PATTERN.test(params.open) || !DECIMAL_PATTERN.test(params.close)) return undefined;',
      '',
    ),
  },
  {
    name: 'THREE_PLACES_NOT_FOUR',
    edits: edit(CONSTANT, 'PERCENT_DECIMAL_PLACES = 4', 'PERCENT_DECIMAL_PLACES = 3'),
  },
  {
    name: 'PRICES_NOT_ALIGNED_TO_THE_SAME_SCALE',
    edits: edit(
      PERCENT,
      'return value.digits * TEN ** BigInt(places - value.places);',
      'return value.digits;',
    ),
  },
];

const STREAM_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'ANOTHER_EVENT_TYPE_ACCEPTED',
    edits: edit(SCHEMA, 'e: z.literal(MINI_TICKER_EVENT_TYPE),', 'e: z.string(),'),
  },
  {
    name: 'STREAM_NAME_NOT_CROSS_CHECKED',
    edits: edit(
      SCHEMA,
      'parsed.data.stream === `${parsed.data.data.s.toLowerCase()}${MINI_TICKER_STREAM_SUFFIX}`;',
      'true;',
    ),
  },
  {
    name: 'PRICE_NOT_VALIDATED',
    edits: edit(SCHEMA, 'c: DECIMAL_STRING_SCHEMA,', 'c: z.unknown(),'),
  },
  {
    name: 'ONE_CONNECTION_PER_PAIR_SIGNATURE_LOST',
    edits: edit(SETTINGS, 'names.join(STREAM_NAME_SEPARATOR)', "names[0] ?? ''"),
  },
  {
    name: 'WRONG_STREAM_SUFFIX',
    edits: edit(
      CONSTANT,
      "MINI_TICKER_STREAM_SUFFIX = '@miniTicker'",
      "MINI_TICKER_STREAM_SUFFIX = '@ticker'",
    ),
  },
  {
    name: 'OTHER_PAIRS_DELIVERED',
    edits: edit(
      STREAM,
      'if (!config.symbols.has(message.tick.symbol)) {',
      `if (${ALWAYS_FALSE}) {`,
    ),
  },
  {
    name: 'CONSUMER_FAILURE_ESCAPES',
    edits: edit(
      STREAM,
      '  } catch {\n    recordFailure();\n  }',
      '  } catch (error) {\n    throw error;\n  }',
    ),
  },
  { name: 'MALFORMED_NEVER_COUNTED', edits: edit(STREAM, '  counters.malformedCount += 1;\n', '') },
  {
    name: 'RECONNECTS_ONLY_ONCE',
    edits: edit(
      'kline-stream-loop.ts',
      'while (!lifecycle.isClosed) {',
      'if (!lifecycle.isClosed) {',
    ),
  },
  {
    name: 'CLOSE_DOES_NOT_STOP_THE_LOOP',
    edits: edit('kline-stream-loop.ts', '      params.lifecycle.isClosed = true;\n', ''),
  },
  {
    name: 'SILENCE_WATCHDOG_NEVER_FIRES',
    edits: edit(
      'kline-stream-connection.ts',
      '    params.staleAfterMilliseconds,\n  );',
      '    params.staleAfterMilliseconds * 1_000,\n  );',
    ),
  },
];

// A vela em formação (spec 009, T1.5): agregador de 1 por segundo por (par, vela), leitura do kline e assinatura.
const CANDLE_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'EVERY_CANDLE_EVENT_OPENS_A_NEW_WINDOW',
    edits: edit(
      CANDLE_AGGREGATOR,
      'window.timer ??= settings.setTimer(',
      'window.timer = settings.setTimer(',
    ),
  },
  {
    name: 'FIRST_CANDLE_OF_THE_WINDOW_WINS',
    edits: edit(CANDLE_AGGREGATOR, '      window.latest = candle;\n', ''),
  },
  {
    name: 'CANDLE_KEY_IGNORES_THE_TIMEFRAME',
    edits: edit(CANDLE_AGGREGATOR, '`${candle.symbol}:${candle.timeframe}`', 'candle.symbol'),
  },
  {
    name: 'REDELIVERED_CANDLE_PUBLISHED_AGAIN',
    edits: edit(CANDLE_AGGREGATOR, 'candle.eventTime <= lastTime', 'candle.eventTime < lastTime'),
  },
  {
    name: 'CLOSED_CANDLE_AGGREGATOR_KEEPS_ACCEPTING',
    edits: edit(CANDLE_AGGREGATOR, 'if (isClosed || (lastTime', 'if ((lastTime'),
  },
  {
    name: 'CANDLE_STREAM_NAME_NOT_CROSS_CHECKED',
    edits: edit(
      CANDLE_SCHEMA,
      'const isSameStream = stream === `${k.s.toLowerCase()}${KLINE_STREAM_SUFFIX}${k.i}`;',
      'const isSameStream = true;',
    ),
  },
  {
    name: 'CANDLE_PAIR_NOT_CROSS_CHECKED',
    edits: edit(CANDLE_SCHEMA, 'if (!isSameStream || data.s !== k.s)', 'if (!isSameStream)'),
  },
  {
    name: 'CANDLE_CLOSED_FLAG_LOST',
    edits: edit(CANDLE_SCHEMA, 'isClosed: k.x,', 'isClosed: false,'),
  },
  {
    name: 'CANDLE_OF_AN_UNSUBSCRIBED_SIZE_DELIVERED',
    edits: edit(
      STREAM,
      'config.symbols.has(candle.symbol) && config.timeframes.has(candle.timeframe)',
      'config.symbols.has(candle.symbol)',
    ),
  },
  {
    name: 'CANDLE_OF_AN_UNSUBSCRIBED_PAIR_DELIVERED',
    edits: edit(
      STREAM,
      'config.symbols.has(candle.symbol) && config.timeframes.has(candle.timeframe)',
      'config.timeframes.has(candle.timeframe)',
    ),
  },
  {
    name: 'KLINE_STREAMS_ALWAYS_THE_FIRST_SIZE',
    edits: edit(
      SETTINGS,
      '${KLINE_STREAM_SUFFIX}${timeframe}',
      '${KLINE_STREAM_SUFFIX}${[...timeframes][0] ?? timeframe}',
    ),
  },
];

const MUTANTS: readonly SourceMutant[] = [
  ...AGGREGATOR_MUTANTS,
  ...CANDLE_MUTANTS,
  ...PERCENT_MUTANTS,
  ...STREAM_MUTANTS,
];

describe('ticker público: os contratos reprovam cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(TICKER_MUTANT_TARGET, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(() => removeMutantCopies(TICKER_MUTANT_TARGET));

  test('a cópia sem edição passa nos mesmos testes: o arnês é sólido', () => {
    expect(verdicts.get(CONTROL.name)).toStrictEqual({
      exitCode: 0,
      failedTests: 0,
      hasLoadError: false,
    });
  });

  test.each(MUTANTS.map((mutant) => [mutant.name, mutant] as const))('%s', (_name, mutant) => {
    const verdict = verdicts.get(mutant.name);
    expect(verdict?.hasLoadError).toBe(false);
    expect(verdict?.exitCode).not.toBe(0);
    expect(verdict?.failedTests ?? 0).toBeGreaterThan(0);
  });

  test('os nomes são distintos', () => {
    expect(new Set(MUTANTS.map((mutant) => mutant.name)).size).toBe(MUTANTS.length);
  });
});
