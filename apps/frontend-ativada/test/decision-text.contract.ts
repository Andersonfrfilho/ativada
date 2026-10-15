// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import {
  describeLiveResult,
  formatClosingMoment,
  formatDirectedPercent,
  formatScoreOfThreshold,
  formatUsdt,
} from '../src/runs/live-tracking/decision-text.js';

const SAO_PAULO = 'America/Sao_Paulo';
const NEW_YORK = 'America/New_York';
// 14/10/2026 09:00 em São Paulo e 08:00 em Nova York (horário de verão, GMT−4).
const NOW = Date.parse('2026-10-14T12:00:00.000Z');

function at(isoInstant: string, timeZone: string, now: number = NOW): string {
  return formatClosingMoment(Date.parse(isoInstant), { now, timeZone });
}

describe('formatClosingMoment', () => {
  test('says today and yesterday in the user zone', () => {
    expect(at('2026-10-14T11:00:00.000Z', SAO_PAULO)).toBe('08:00 de hoje');
    expect(at('2026-10-13T20:00:00.000Z', SAO_PAULO)).toBe('17:00 de ontem');
    expect(at('2026-10-14T11:00:00.000Z', NEW_YORK)).toBe('07:00 de hoje');
  });

  test('the day turns at local midnight, and it is not the same instant in both zones', () => {
    expect(at('2026-10-14T02:59:00.000Z', SAO_PAULO)).toBe('23:59 de ontem');
    expect(at('2026-10-14T03:00:00.000Z', SAO_PAULO)).toBe('00:00 de hoje');
    expect(at('2026-10-14T03:59:00.000Z', NEW_YORK)).toBe('23:59 de ontem');
    expect(at('2026-10-14T04:00:00.000Z', NEW_YORK)).toBe('00:00 de hoje');
  });

  test('the same close is "ontem" in São Paulo and "hoje" in New York when "now" is just after midnight there', () => {
    const justAfterMidnightInSaoPaulo = Date.parse('2026-10-14T03:30:00.000Z');
    expect(at('2026-10-14T02:00:00.000Z', SAO_PAULO, justAfterMidnightInSaoPaulo)).toBe(
      '23:00 de ontem',
    );
    expect(at('2026-10-14T02:00:00.000Z', NEW_YORK, justAfterMidnightInSaoPaulo)).toBe(
      '22:00 de hoje',
    );
  });

  test('older closes show the full local date and time', () => {
    expect(at('2026-10-10T15:00:00.000Z', SAO_PAULO)).toBe('10/10/2026 12:00');
    expect(at('2026-10-10T15:00:00.000Z', NEW_YORK)).toBe('10/10/2026 11:00');
  });
});

describe('formatScoreOfThreshold', () => {
  test('writes the score against the threshold in pt-BR', () => {
    expect(formatScoreOfThreshold('1', '2')).toBe('+1 de +2');
    expect(formatScoreOfThreshold('-2.5', '2')).toBe('−2,5 de +2');
    expect(formatScoreOfThreshold('0.50000000', '2.00000000')).toBe('+0,5 de +2');
    expect(formatScoreOfThreshold('0', '2.5')).toBe('0 de +2,5');
    expect(formatScoreOfThreshold('-1', '-2')).toBe('−1 de −2');
  });

  test('keeps at most two decimals and rounds half up on the text', () => {
    expect(formatScoreOfThreshold('0.125', '2.004')).toBe('+0,13 de +2');
  });
});

describe('formatUsdt', () => {
  test('rounds in the direction of the server field, on the exact decimal text', () => {
    expect(formatUsdt('1030.501', 'down')).toBe('1.030,50 USDT');
    expect(formatUsdt('1030.501', 'up')).toBe('1.030,51 USDT');
    expect(formatUsdt('1030.50', 'up')).toBe('1.030,50 USDT');
  });

  test('keeps every digit above 2^53 (no Number)', () => {
    expect(formatUsdt('9007199254740993.019', 'down')).toBe('9.007.199.254.740.993,01 USDT');
    expect(formatUsdt('9007199254740993.011', 'up')).toBe('9.007.199.254.740.993,02 USDT');
  });

  test('a loss rounds against the user in both directions of the line', () => {
    expect(formatUsdt('-0.001', 'down')).toBe('-0,01 USDT');
    expect(formatUsdt('-0.019', 'up')).toBe('-0,01 USDT');
  });
});

describe('formatDirectedPercent', () => {
  test('moves the comma and rounds down or up to two decimals', () => {
    expect(formatDirectedPercent('0.030599999999', 'down')).toBe('+3,05%');
    expect(formatDirectedPercent('0.030500000001', 'up')).toBe('+3,06%');
    expect(formatDirectedPercent('0.0305', 'up')).toBe('+3,05%');
  });

  test('a negative rate keeps its sign and rounds toward the correct side', () => {
    expect(formatDirectedPercent('-0.012301', 'down')).toBe('−1,24%');
    expect(formatDirectedPercent('-0.012301', 'up')).toBe('−1,23%');
  });

  test('zero has no sign, and a tiny gain rounded down is zero', () => {
    expect(formatDirectedPercent('0', 'down')).toBe('0,00%');
    expect(formatDirectedPercent('0.000099999999', 'down')).toBe('0,00%');
    expect(formatDirectedPercent('0.000099999999', 'up')).toBe('+0,01%');
  });

  test('a rate with more digits than any Number holds stays exact', () => {
    expect(formatDirectedPercent('12345678901234.123456789012', 'down')).toBe(
      '+1.234.567.890.123.412,34%',
    );
  });

  test('text that is not a decimal becomes a dash, never "NaN"', () => {
    expect(formatDirectedPercent('NaN', 'down')).toBe('—');
    expect(formatDirectedPercent('1e-5', 'up')).toBe('—');
  });
});

describe('describeLiveResult', () => {
  test('a gain, with the amount rounded down and the percentage', () => {
    expect(describeLiveResult('30.509', '0.0305')).toEqual({
      text: '+30,50 (+3,05%)',
      trend: 'gain',
    });
  });

  test('a loss rounds down too (the loss never looks smaller)', () => {
    expect(describeLiveResult('-12.341', '-0.012341')).toEqual({
      text: '-12,35 (−1,24%)',
      trend: 'loss',
    });
  });

  test('exact zero is flat, written with "=" and no gain or loss sign', () => {
    expect(describeLiveResult('0', '0')).toEqual({ text: '= 0,00 (0,00%)', trend: 'flat' });
    expect(describeLiveResult('0.009', '0.000009')).toEqual({
      text: '= 0,00 (0,00%)',
      trend: 'flat',
    });
  });

  test('a loss of a fraction of a cent is already a loss', () => {
    expect(describeLiveResult('-0.001', '-0.000001').trend).toBe('loss');
  });
});

describe('the text module never turns money into a Number', () => {
  test('no Number, parseFloat, toFixed or Math in decision-text.ts', () => {
    const source = readFileSync(
      new URL('../src/runs/live-tracking/decision-text.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/\bNumber\(|parseFloat|parseInt|toFixed|Math\./);
  });
});
