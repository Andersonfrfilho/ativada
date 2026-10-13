// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { formatRelativeMoment } from '../src/format/zoned-moment.js';
import { nextCandleClose } from '../src/goals/next-candle-close.js';
import {
  DEFAULT_SIMULATION_TIMEFRAME,
  HIDDEN_SIMULATION_TIMEFRAME_OPTIONS,
  isSimulationTimeframe,
  DEFAULT_LIVE_RUN_LIMIT,
  RANKING_TIMEFRAME_NOTICE,
  SIMULATION_TIMEFRAME_OPTIONS,
  SMALL_CANDLE_FEES_NOTICE,
} from '../src/goals/simulation-timeframe.constant.js';
import { describeFrequency, describeSimulationSummary } from '../src/goals/simulation-text.js';

const SAO_PAULO = 'America/Sao_Paulo';
const NEW_YORK = 'America/New_York';
// 12:20 UTC = 09:20 em São Paulo (UTC−3, sem horário de verão).
const NOW = Date.parse('2026-10-13T12:20:00.000Z');

function utc(text: string): number {
  return Date.parse(text);
}

describe('nextCandleClose', () => {
  test('ends the candle in progress at each timeframe, aligned to the UTC epoch', () => {
    expect(nextCandleClose({ timeframe: '15m', now: NOW })).toBe(utc('2026-10-13T12:30:00.000Z'));
    expect(nextCandleClose({ timeframe: '1h', now: NOW })).toBe(utc('2026-10-13T13:00:00.000Z'));
    expect(nextCandleClose({ timeframe: '4h', now: NOW })).toBe(utc('2026-10-13T16:00:00.000Z'));
    expect(nextCandleClose({ timeframe: '1d', now: NOW })).toBe(utc('2026-10-14T00:00:00.000Z'));
  });

  test('at the exact close the next candle is born, so the end is one candle later', () => {
    const boundary = utc('2026-10-13T13:00:00.000Z');
    expect(nextCandleClose({ timeframe: '1h', now: boundary })).toBe(
      utc('2026-10-13T14:00:00.000Z'),
    );
    expect(nextCandleClose({ timeframe: '1h', now: boundary - 1 })).toBe(boundary);
    expect(nextCandleClose({ timeframe: '1d', now: utc('2026-10-14T00:00:00.000Z') })).toBe(
      utc('2026-10-15T00:00:00.000Z'),
    );
  });

  test('the 4 h candles close at 00, 04, 08, 12, 16 and 20 UTC', () => {
    const closes = [0, 4, 8, 12, 16, 20].map((hour) =>
      nextCandleClose({ timeframe: '4h', now: utc('2026-10-13T00:00:00.000Z') + hour * 3_600_000 }),
    );
    expect(closes.map((close) => new Date(close).getUTCHours())).toEqual([4, 8, 12, 16, 20, 0]);
  });

  test('is a pure function of its arguments: same input, same output, always after now', () => {
    for (const timeframe of ['15m', '1h', '4h', '1d'] as const) {
      const close = nextCandleClose({ timeframe, now: NOW });
      expect(nextCandleClose({ timeframe, now: NOW })).toBe(close);
      expect(close).toBeGreaterThan(NOW);
    }
  });
});

describe('the day turns over in the zone of the user', () => {
  test('the daily candle closes at 00:00 UTC, which is 21:00 the day before in São Paulo', () => {
    const close = nextCandleClose({ timeframe: '1d', now: NOW });
    expect(formatRelativeMoment(close, { now: NOW, timeZone: SAO_PAULO })).toBe('21:00 de hoje');
  });

  test('after 21:00 in São Paulo the next daily close is tomorrow', () => {
    const now = utc('2026-10-14T01:00:00.000Z');
    const close = nextCandleClose({ timeframe: '1d', now });
    expect(formatRelativeMoment(close, { now, timeZone: SAO_PAULO })).toBe('21:00 de amanhã');
  });

  test('a close past local midnight is tomorrow even though it is the same UTC day', () => {
    const now = utc('2026-10-14T02:59:00.000Z');
    const close = nextCandleClose({ timeframe: '1h', now });
    expect(formatRelativeMoment(close, { now, timeZone: SAO_PAULO })).toBe('00:00 de amanhã');
  });

  test('yesterday and far dates keep the full date', () => {
    const zone = { now: NOW, timeZone: SAO_PAULO };
    expect(formatRelativeMoment(utc('2026-10-12T23:00:00.000Z'), zone)).toBe('20:00 de ontem');
    expect(formatRelativeMoment(utc('2026-10-20T15:00:00.000Z'), zone)).toBe('20/10/2026 12:00');
  });
});

describe('the sentences of the spec', () => {
  const sao = { now: NOW, timeZone: SAO_PAULO };

  test('RF02 frequency per option', () => {
    expect(describeFrequency('1h', sao)).toBe('A cada 1 hora: até 24 decisões por dia.');
    expect(describeFrequency('4h', sao)).toBe('A cada 4 horas: até 6 por dia.');
    expect(describeFrequency('1d', sao)).toBe('Uma vez por dia, às 21:00 (horário de Brasília).');
  });

  test('the daily hour follows the zone of the user and names its offset', () => {
    expect(describeFrequency('1d', { now: NOW, timeZone: NEW_YORK })).toBe(
      'Uma vez por dia, às 20:00 (GMT−4).',
    );
  });

  test('RF03 notices are exactly the spec text', () => {
    expect(RANKING_TIMEFRAME_NOTICE).toBe(
      'O ranking desta meta é calculado com velas diárias. Simular com velas menores é um teste ao vivo: o resultado pode ser diferente e não muda o ranking.',
    );
    expect(SMALL_CANDLE_FEES_NOTICE).toBe(
      'Com velas de 15 min a estratégia opera mais vezes e as taxas pesam mais.',
    );
  });

  test('the summary says how often and when the first candle closes', () => {
    expect(describeSimulationSummary('1h', sao)).toBe(
      'A simulação olha o mercado a cada 1 hora. Primeira vela fecha às 10:00 de hoje (horário de Brasília).',
    );
    expect(describeSimulationSummary('1d', sao)).toBe(
      'A simulação olha o mercado uma vez por dia. Primeira vela fecha às 21:00 de hoje (horário de Brasília).',
    );
  });
});

describe('the options', () => {
  test('1 hour is the default; 1 hour, 4 hours and 1 day are visible; 15 min is hidden', () => {
    expect(DEFAULT_SIMULATION_TIMEFRAME).toBe('1h');
    expect(SIMULATION_TIMEFRAME_OPTIONS).toEqual(['1h', '4h', '1d']);
    expect(HIDDEN_SIMULATION_TIMEFRAME_OPTIONS).toEqual(['15m']);
    expect(DEFAULT_LIVE_RUN_LIMIT).toBe(5);
  });

  test('only the four timeframes of the API are accepted', () => {
    expect(['15m', '1h', '4h', '1d'].every(isSimulationTimeframe)).toBe(true);
    expect(isSimulationTimeframe('1w')).toBe(false);
    expect(isSimulationTimeframe('')).toBe(false);
  });
});
