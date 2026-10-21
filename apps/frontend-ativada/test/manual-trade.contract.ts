// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { buildExchangeUrl } from '../src/notices/exchange-link.js';
import {
  buildCopyTexts,
  computeProportionalQuantity,
  normalizeBalanceInput,
  toPlainPrice,
  toPlainQuantity,
} from '../src/notices/manual-trade.js';
import { MY_BALANCE_KEY, readMyBalance, writeMyBalance } from '../src/notices/my-balance.js';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & {
  saved: Map<string, string>;
} {
  const saved = new Map<string, string>();
  return {
    saved,
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => void saved.set(key, value),
    removeItem: (key) => void saved.delete(key),
  };
}

describe('quantidade proporcional ao "Meu saldo" (RF28, D12-A)', () => {
  const base = { quantity: '113.50000000', runBalance: '10000', quantityStep: '0.01' };

  test('2.000 USDT sobre a simulação de 10.000 dá 22,70 LINK', () => {
    expect(computeProportionalQuantity({ ...base, myBalance: '2000' })).toBe('22.70000000');
  });

  test('sempre para BAIXO no passo do par, nunca arredondando a favor', () => {
    expect(computeProportionalQuantity({ ...base, myBalance: '2049.99' })).toBe('23.26000000');
    expect(computeProportionalQuantity({ ...base, myBalance: '1' })).toBe('0.01000000');
    expect(computeProportionalQuantity({ ...base, myBalance: '0.5' })).toBe('0.00000000');
    expect(
      computeProportionalQuantity({
        quantity: '10',
        runBalance: '10000',
        myBalance: '1234',
        quantityStep: '1',
      }),
    ).toBe('1.00000000');
  });

  test('dado ruim não vira número', () => {
    expect(computeProportionalQuantity({ ...base, myBalance: '-5' })).toBeUndefined();
    expect(computeProportionalQuantity({ ...base, myBalance: '0' })).toBeUndefined();
    expect(
      computeProportionalQuantity({ ...base, runBalance: '0', myBalance: '100' }),
    ).toBeUndefined();
    expect(
      computeProportionalQuantity({ ...base, quantityStep: '0', myBalance: '100' }),
    ).toBeUndefined();
  });

  test('o código não usa Number em dinheiro', () => {
    const source = readFileSync(new URL('../src/notices/manual-trade.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/Number\(|parseFloat|parseInt/);
  });
});

describe('texto copiado para a corretora (RF34)', () => {
  test('ponto decimal, sem milhar e nas casas do par', () => {
    expect(toPlainPrice('LINKUSDT', '12.59000000')).toBe('12.590');
    expect(toPlainPrice('BTCUSDT', '61700.5')).toBe('61700.50');
    expect(toPlainPrice('PEPEUSDT', '0.0000040')).toBe('0.00000400');
    expect(toPlainQuantity('22.70999999', '0.01')).toBe('22.70');
    expect(toPlainQuantity('113.5', '0.01')).toBe('113.50');
  });

  test('"Copiar todas as ordens" junta entrada, alvo e proteção', () => {
    const texts = buildCopyTexts({
      symbol: 'LINKUSDT',
      referencePrice: '12.45800000',
      targetPrice: '12.59000000',
      stopPrice: '12.37900000',
      quantity: '22.70000000',
      quantityStep: '0.01',
    });
    expect(texts.price).toBe('12.458');
    expect(texts.quantity).toBe('22.70');
    expect(texts.target).toBe('12.590');
    expect(texts.stop).toBe('12.379');
    expect(texts.all).toBe(
      'Entrada: 12.458 · quantidade 22.70\nAlvo (venda limitada): 12.590\nProteção: 12.379',
    );
  });
});

describe('link do par na Binance (RF34, D13-A)', () => {
  test('só o par entra na URL e nada de dado da pessoa', () => {
    expect(buildExchangeUrl('LINKUSDT')).toBe('https://www.binance.com/pt-BR/trade/LINK_USDT');
    expect(buildExchangeUrl('BTCUSDT')).toBe('https://www.binance.com/pt-BR/trade/BTC_USDT');
    const url = buildExchangeUrl('PEPEUSDT') ?? '';
    expect(new URL(url).search).toBe('');
    expect(new URL(url).hash).toBe('');
  });

  test('símbolo fora do padrão não gera link', () => {
    expect(buildExchangeUrl('link/usdt')).toBeUndefined();
    expect(buildExchangeUrl('LINKUSDT?x=1')).toBeUndefined();
    expect(buildExchangeUrl('LINKBTC')).toBeUndefined();
  });
});

describe('"Meu saldo" só neste navegador (D12-A)', () => {
  test('aceita vírgula e ponto, recusa lixo, zero e negativo', () => {
    expect(normalizeBalanceInput('2000,50')).toBe('2000.50');
    expect(normalizeBalanceInput(' 2000 ')).toBe('2000');
    expect(normalizeBalanceInput('abc')).toBeUndefined();
    expect(normalizeBalanceInput('0')).toBeUndefined();
    expect(normalizeBalanceInput('-3')).toBeUndefined();
    expect(normalizeBalanceInput('')).toBeUndefined();
  });

  test('guarda, relê, apaga o vazio e tolera armazenamento negado', () => {
    const storage = memoryStorage();
    writeMyBalance('2000,5', storage);
    expect(storage.saved.get(MY_BALANCE_KEY)).toBe('2000.5');
    expect(readMyBalance(storage)).toBe('2000.5');
    writeMyBalance('', storage);
    expect(readMyBalance(storage)).toBeUndefined();
    const denied = {
      getItem: (): never => {
        throw new Error('negado');
      },
      setItem: (): never => {
        throw new Error('negado');
      },
      removeItem: (): never => {
        throw new Error('negado');
      },
    };
    expect(readMyBalance(denied)).toBeUndefined();
    expect(() => writeMyBalance('10', denied)).not.toThrow();
  });
});
