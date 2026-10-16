// Copyright (c) 2026 Ada Technology. All rights reserved.
// Spec 013, T0.1: o oráculo `bigint` da regra `minimum-profit-1` (ADR 0002 "Lucro mínimo por operação") conferido contra
// contas à mão, contra os conjuntos reais de `scripts/minimum-edge-estimate.ts` e por propriedades. A Fase 1 compara o
// motor com ESTE oráculo; aqui ele só prova a si mesmo, sem importar `src`.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  compareExact,
  describeMinimumProfitWait,
  formatHundredths,
  grossTargetHundredthsDown,
  isEntryAllowed,
  MINIMUM_PROFIT_MESSAGE_WITHOUT_NUMBERS,
  minimumProfitMessage,
  netTargetRateAt12,
  parseExact,
  rateHundredthsUp,
  roundTripCostRate,
  type MinimumProfitCase,
} from './fixtures/minimum-profit/minimum-profit-oracle.js';
import realBuyCandles from './fixtures/minimum-profit/real-buy-candles.json' with { type: 'json' };

const DEFAULTS = { targetAtrMultiple: '3', feeRate: '0.001', slippageRate: '0.0005' } as const;

type HandCase = {
  readonly name: string;
  readonly input: MinimumProfitCase;
  readonly isAllowed: boolean;
  readonly message?: string;
};

// Contas à mão (ADR 0002, seção da spec 013): alvo = m × ATR, exigido = (mínimo + custo) × fechamento.
const HAND_CASES: readonly HandCase[] = [
  {
    name: 'líquido igual ao mínimo passa (0,9 = 0,009 × 100)',
    input: { ...DEFAULTS, atr: 0.3, close: '100', minimumNetTargetRate: '0.006' },
    isAllowed: true,
  },
  {
    name: '1e-12 abaixo do mínimo barra (2.699,9999997 < 2.700)',
    input: { ...DEFAULTS, atr: 899.9999999, close: '300000', minimumNetTargetRate: '0.006' },
    isAllowed: false,
    message:
      'Esperou: o ganho possível até o alvo (0,89%) não paga o custo de ida e volta (0,30%) mais o lucro mínimo que você pediu (0,60%).',
  },
  {
    name: 'mínimo zero com alvo abaixo do custo barra, frase curta',
    input: { ...DEFAULTS, atr: 0.09, close: '100', minimumNetTargetRate: '0' },
    isAllowed: false,
    message:
      'Esperou: o ganho possível até o alvo (0,27%) não paga o custo de ida e volta (0,30%).',
  },
  {
    name: 'mínimo zero com alvo igual ao custo passa',
    input: { ...DEFAULTS, atr: 0.1, close: '100', minimumNetTargetRate: '0' },
    isAllowed: true,
  },
  {
    name: 'o exemplo da spec: 0,66% não paga 0,30% + 0,60%',
    input: { ...DEFAULTS, atr: 135.74, close: '61700', minimumNetTargetRate: '0.006' },
    isAllowed: false,
    message:
      'Esperou: o ganho possível até o alvo (0,66%) não paga o custo de ida e volta (0,30%) mais o lucro mínimo que você pediu (0,60%).',
  },
  {
    name: 'custo e mínimo para CIMA (0,300002 → 0,31; 0,600001 → 0,61)',
    input: {
      ...DEFAULTS,
      feeRate: '0.00100001',
      atr: 0.3,
      close: '100',
      minimumNetTargetRate: '0.00600001',
    },
    isAllowed: false,
    message:
      'Esperou: o ganho possível até o alvo (0,90%) não paga o custo de ida e volta (0,31%) mais o lucro mínimo que você pediu (0,61%).',
  },
  {
    name: 'ganho bruto para BAIXO (0,37035% → 0,37)',
    input: { ...DEFAULTS, atr: 0.12345, close: '100', minimumNetTargetRate: '0.001' },
    isAllowed: false,
    message:
      'Esperou: o ganho possível até o alvo (0,37%) não paga o custo de ida e volta (0,30%) mais o lucro mínimo que você pediu (0,10%).',
  },
  {
    // Exigido = 1.200.000.000.000,003 + 3e-28 (41 algarismos): a 40 algarismos (HALF_UP) ficaria IGUAL ao alvo e passaria.
    name: 'armadilha de precisão: 41º algarismo decide, barra',
    input: {
      atr: 400000000000.001,
      close: '40000000000000100000.00000000000000000001',
      targetAtrMultiple: '3',
      feeRate: '0.00000001',
      slippageRate: '0',
      minimumNetTargetRate: '0.00000001',
    },
    isAllowed: false,
    message:
      'Esperou: o ganho possível até o alvo (0,00%) não paga o custo de ida e volta (0,01%) mais o lucro mínimo que você pediu (0,01%).',
  },
];

describe('oráculo minimum-profit-1: contas à mão', () => {
  for (const handCase of HAND_CASES) {
    test(handCase.name, () => {
      expect(isEntryAllowed(handCase.input)).toBe(handCase.isAllowed);
      if (handCase.message !== undefined) {
        expect(minimumProfitMessage(handCase.input)).toBe(handCase.message);
      }
    });
  }

  test('frase sem números: sem leitura de ATR ou quando a conta refeita não barraria', () => {
    const [first, , barred] = HAND_CASES;
    expect(describeMinimumProfitWait(undefined)).toBe(MINIMUM_PROFIT_MESSAGE_WITHOUT_NUMBERS);
    if (first === undefined || barred === undefined) throw new Error('casos à mão ausentes');
    expect(describeMinimumProfitWait(first.input)).toBe(MINIMUM_PROFIT_MESSAGE_WITHOUT_NUMBERS);
    expect(describeMinimumProfitWait(barred.input)).toBe(barred.message ?? '');
    expect(MINIMUM_PROFIT_MESSAGE_WITHOUT_NUMBERS).toBe(
      'Esperou: o ganho possível até o alvo não pagava o custo mais o lucro mínimo.',
    );
  });

  test('custo de ida e volta padrão = 0,003 exato; porcentagem pt-BR com milhar', () => {
    expect(compareExact(roundTripCostRate('0.001', '0.0005'), parseExact('0.003'))).toBe(0);
    expect(formatHundredths(0n)).toBe('0,00');
    expect(formatHundredths(5n)).toBe('0,05');
    expect(formatHundredths(123450n)).toBe('1.234,50');
  });

  test('ATR entra por 15 algarismos significativos, inclusive em notação exponencial', () => {
    expect(parseExact((1.5e-7).toPrecision(15))).toEqual({ units: 150000000000000n, scale: 21 });
    expect(parseExact('1.5e+3')).toEqual({ units: 1500n, scale: 0 });
  });
});

type BuyCandle = [number, string, number];

function isBuyCandle(row: (string | number)[]): row is BuyCandle {
  return (
    row.length === 3 &&
    typeof row[0] === 'number' &&
    typeof row[1] === 'string' &&
    typeof row[2] === 'number'
  );
}
const MINIMUMS = ['0', '0.003', '0.006', '0.01'] as const;
// Velas de compra barradas por mínimo, na ordem de MINIMUMS (a tabela do spec.md §7 traz 0,3%, 0,6% e 1,0%).
const EXPECTED_BLOCKED: Readonly<Record<string, readonly number[]>> = {
  'BTCUSDT 1h × 500': [0, 0, 0, 10],
  'ETHUSDT 1d × 400': [0, 0, 0, 0],
  'BTCUSDT 15m × 3300': [131, 372, 693, 843],
};
const EXPECTED_BUY_CANDLES: Readonly<Record<string, number>> = {
  'BTCUSDT 1h × 500': 113,
  'ETHUSDT 1d × 400': 60,
  'BTCUSDT 15m × 3300': 879,
};

describe('oráculo minimum-profit-1: conjuntos reais', () => {
  for (const dataset of realBuyCandles.datasets) {
    test(dataset.name, () => {
      const candles = dataset.buyCandles.filter(isBuyCandle);
      expect(candles.length).toBe(EXPECTED_BUY_CANDLES[dataset.name] ?? -1);
      const blocked = MINIMUMS.map(
        (minimum) =>
          candles.filter(
            ([, close, atr]) =>
              !isEntryAllowed({ ...dataset, atr, close, minimumNetTargetRate: minimum }),
          ).length,
      );
      expect(blocked).toEqual([...(EXPECTED_BLOCKED[dataset.name] ?? [])]);
    });
  }
});

// Sorteio determinístico (mulberry32): a mesma semente dá os mesmos casos em qualquer máquina.
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function eightPlaces(random: () => number, maximum: number): string {
  return (Math.floor(random() * maximum * 1e8) / 1e8).toFixed(8);
}

function drawCase(random: () => number): MinimumProfitCase {
  const close = (random() * 10 ** Math.floor(random() * 7)).toFixed(Math.floor(random() * 9));
  const safeClose = Number(close) > 0 ? close : '1';
  return {
    atr: Number(safeClose) * random() * 0.05 + 1e-9,
    close: safeClose,
    targetAtrMultiple: (0.5 + random() * 6).toFixed(Math.floor(random() * 4)),
    feeRate: eightPlaces(random, 0.01),
    slippageRate: eightPlaces(random, 0.05),
    minimumNetTargetRate: eightPlaces(random, 0.1),
  };
}

describe('oráculo minimum-profit-1: propriedades (3.000 sorteios)', () => {
  test('cruzar sem divisão = comparar o líquido a 12 casas; mínimo maior nunca libera; frase sem contradição', () => {
    const random = createRandom(13);
    for (let index = 0; index < 3000; index += 1) {
      const input = drawCase(random);
      const isAllowed = isEntryAllowed(input);
      const minimum = parseExact(input.minimumNetTargetRate);
      expect(compareExact(netTargetRateAt12(input), minimum) >= 0).toBe(isAllowed);
      if (!isAllowed) {
        const shown =
          rateHundredthsUp(roundTripCostRate(input.feeRate, input.slippageRate)) +
          rateHundredthsUp(minimum);
        expect(grossTargetHundredthsDown(input) < shown).toBe(true);
      }
      const higher = (Number(input.minimumNetTargetRate) + random() * 0.01).toFixed(8);
      if (!isAllowed) {
        expect(isEntryAllowed({ ...input, minimumNetTargetRate: higher })).toBe(false);
      }
    }
  });

  test('o oráculo não importa o motor nem decimal.js', () => {
    const source = readFileSync(
      new URL('./fixtures/minimum-profit/minimum-profit-oracle.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/from\s+['"][^'"]*(\/src\/|strategy-engine|decimal\.js)/);
    expect(source).not.toMatch(/\bimport\b/);
  });
});
