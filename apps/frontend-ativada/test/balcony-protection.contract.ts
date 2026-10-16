// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { parseScaled } from '../src/format/decimal.js';
import { buildPlaques } from '../src/runs/team-room/balcony/plaque-model.js';
import {
  describeNet,
  describeRatio,
  measureProtection,
  projectNet,
  readCostRates,
  type NetOutcome,
} from '../src/runs/team-room/balcony/protection-math.js';
import type { Trade } from '../src/runs/run.validation.js';

const COSTS = readCostRates({ feeRate: '0.001', slippageRate: '0.0005' });

function scaled(text: string): bigint {
  const value = parseScaled(text);
  if (value === undefined) throw new Error(`valor inválido ${text}`);
  return value;
}

function netOf(entry: string, exit: string): NetOutcome {
  if (COSTS === undefined) throw new Error('custos ausentes');
  const outcome = projectNet({
    entry: scaled(entry),
    exit: scaled(exit),
    quantity: scaled('87.6'),
    costs: COSTS,
  });
  if (outcome === undefined) throw new Error('sem resultado');
  return outcome;
}

// Oráculo independente: a razão exata receita ÷ custo, sem os arredondamentos por passo do painel.
function exactNetRatePercent(entry: string, exit: string): number {
  const fee = 0.001;
  const slip = 0.0005;
  const proceeds = Number(exit) * (1 - slip) * (1 - fee);
  const cost = Number(entry) * (1 + slip) * (1 + fee);
  return (proceeds / cost - 1) * 100;
}

describe('plaquinhas líquidas de custo (escritório E-RF13)', () => {
  test('the target gain is net of fee and slippage and never above the exact value', () => {
    const outcome = netOf('12.87', '13.007');
    const text = describeNet(outcome);
    const exact = exactNetRatePercent('12.87', '13.007');
    const shown = Number(text.percent.replace('%', '').replace('+', '').replace(',', '.'));
    expect(shown).toBeLessThanOrEqual(exact);
    expect(exact - shown).toBeLessThan(0.0101);
    expect(text.gross).toBe('+1,06%');
    expect(text.tone).toBe('gain');
  });

  test('the loss at the protection rounds against the user (more negative) and uses the typographic minus', () => {
    const text = describeNet(netOf('12.87', '12.789'));
    const exact = exactNetRatePercent('12.87', '12.789');
    expect(text.percent.startsWith('−')).toBe(true);
    const shown = -Number(text.percent.replace('−', '').replace('%', '').replace(',', '.'));
    expect(shown).toBeLessThanOrEqual(exact);
    expect(text.tone).toBe('loss');
  });

  test('gain over risk uses the net numbers and needs a gain and a loss', () => {
    const ratio = describeRatio(netOf('12.87', '13.007'), netOf('12.87', '12.789'));
    expect(ratio).toBe('0,8');
    expect(describeRatio(netOf('12.87', '13.007'), netOf('12.87', '13.0'))).toBeUndefined();
  });

  test('without the fee and slippage of the run nothing is invented', () => {
    expect(readCostRates({ feeRate: '0.001' })).toBeUndefined();
    expect(readCostRates({})).toBeUndefined();
  });
});

describe('distância até a proteção (E-RF12)', () => {
  const entry = scaled('100');
  const stop = scaled('90');

  test('far above half of the slack, near between 20% and 50%, very near below 20%', () => {
    expect(measureProtection(entry, stop, scaled('96'))?.level).toBe('far');
    expect(measureProtection(entry, stop, scaled('93'))?.level).toBe('near');
    expect(measureProtection(entry, stop, scaled('91'))?.level).toBe('veryNear');
  });

  test('a price under the protection counts as zero left and never as negative distance', () => {
    const under = measureProtection(entry, stop, scaled('89'));
    expect(under?.remainingPercent).toBe(0);
    expect(under?.gapText).toBe('0,00');
  });

  test('a protection above the entry has no slack to measure', () => {
    expect(measureProtection(scaled('90'), scaled('100'), scaled('95'))).toBeUndefined();
  });
});

function tradeOf(overrides: Partial<Trade>): Trade {
  return {
    engineKey: 'p1',
    status: 'open',
    entryPrice: '12.87',
    quantity: '87.6',
    stopPrice: '12.789',
    targetPrice: '13.007',
    openedCandleTime: Date.UTC(2026, 9, 16, 3, 0),
    ...overrides,
  };
}

describe('as plaquinhas da operação', () => {
  const base = { symbol: 'LINKUSDT', timeZone: 'UTC', costs: COSTS, currentPrice: undefined };

  test('the buy plaque shows the net percent big, the protection and the gain over risk', () => {
    const [buy] = buildPlaques({ ...base, openTrade: tradeOf({}), closedTrade: undefined });
    expect(buy?.word).toBe('COMPRA');
    expect(buy?.priceText).toBe('12,870');
    expect(buy?.percent.startsWith('+0,7')).toBe(true);
    expect(buy?.lines.some((line) => line.startsWith('proteção −'))).toBe(true);
    expect(buy?.lines.some((line) => line.startsWith('ganho ÷ risco'))).toBe(true);
  });

  test('the open plaque needs the price of now and says what selling now would give, net', () => {
    const withoutPrice = buildPlaques({ ...base, openTrade: tradeOf({}), closedTrade: undefined });
    expect(withoutPrice.some((plaque) => plaque.key === 'open')).toBe(false);
    const withPrice = buildPlaques({
      ...base,
      openTrade: tradeOf({}),
      closedTrade: undefined,
      currentPrice: '12.86',
    });
    const open = withPrice.find((plaque) => plaque.key === 'open');
    expect(open?.word).toContain('COMPRADO desde 03:00');
    expect(open?.tone).toBe('loss');
  });

  test('the closed plaque names the exit: sale at the target or exit by the protection, net from the server', () => {
    const sold = buildPlaques({
      ...base,
      openTrade: undefined,
      closedTrade: tradeOf({
        status: 'closed',
        exitPrice: '13.013',
        exitReason: 'target',
        netProfitRate: '0.0076',
        netProfit: '8.5',
      }),
    });
    expect(sold[0]?.word).toBe('VENDA');
    expect(sold[0]?.percent).toBe('+0,76%');
    const stopped = buildPlaques({
      ...base,
      openTrade: undefined,
      closedTrade: tradeOf({
        status: 'closed',
        exitPrice: '12.372',
        exitReason: 'stop',
        netProfitRate: '-0.0099',
        netProfit: '-10.8',
      }),
    });
    expect(stopped[0]?.word).toBe('SAÍDA PELA PROTEÇÃO');
    expect(stopped[0]?.percent).toBe('−0,99%');
    expect(stopped[0]?.lines).toContain('−10,80 USDT');
  });

  test('no money goes through Number in the plaque code', () => {
    const text = readFileSync(
      new URL('../src/runs/team-room/balcony/plaque-model.ts', import.meta.url),
      'utf8',
    );
    expect(text).not.toMatch(/Number\(/);
    expect(text).not.toMatch(/parseFloat|parseInt/);
  });
});
