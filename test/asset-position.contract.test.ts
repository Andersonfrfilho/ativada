// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { UserAssetDecision, UserAssetRecord } from '../packages/database/src/index.js';
import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';

const { assetPosition } = await loadApiApp();

function position(quantity: string, averagePrice: string): UserAssetRecord {
  return {
    id: '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d00',
    symbol: 'BTCUSDT',
    quantity,
    averagePrice,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

const saved = (quantity: string, averagePrice: string): UserAssetDecision => ({
  kind: 'save',
  quantity,
  averagePrice,
});

describe('compra: o preço médio é PONDERADO pela quantidade e arredondado para CIMA a 8 casas (tabela à mão)', () => {
  test.each([
    ['sem posição, vale o preço pago', undefined, '0.5', '60000', '0.5', '60000'],
    [
      '0,5 a 60.000 + 0,25 a 66.000 = 0,75 a 62.000',
      position('0.5', '60000'),
      '0.25',
      '66000',
      '0.75',
      '62000',
    ],
    [
      '1 a 100 + 2 a 101: 302/3 sobe ao 8º decimal',
      position('1', '100'),
      '2',
      '101',
      '3',
      '100.66666667',
    ],
    ['dízima que já cai na grade não sobe', position('1', '1'), '1', '3', '2', '2'],
    [
      'quantidade de 8 casas: 1e-8 a 1 + 2e-8 a 2 = 5/3',
      position('0.00000001', '1'),
      '0.00000002',
      '2',
      '0.00000003',
      '1.66666667',
    ],
    [
      'posição zerada por venda total: vale o preço pago de novo',
      position('0', '55'),
      '1',
      '70',
      '1',
      '70',
    ],
    ['compra mais barata puxa a média para baixo', position('2', '100'), '2', '50', '4', '75'],
    [
      'o 9º decimal pequeno (3) ainda sobe, não arredonda para o mais próximo',
      position('9', '100'),
      '1',
      '100.00000003',
      '10',
      '100.00000001',
    ],
    [
      'quantidade grande e preço quebrado',
      position('1234.5678', '0.12345678'),
      '10',
      '0.2',
      '1244.5678',
      '0.1240718',
    ],
  ])('%s', (_name, current, quantity, price, expectedQuantity, expectedAverage) => {
    expect(
      assetPosition.decideBuy({
        current,
        quantity: quantity,
        price: price,
      }),
    ).toStrictEqual(saved(expectedQuantity, expectedAverage));
  });
});

describe('venda: nunca passa da quantidade e o preço médio não muda', () => {
  test('vender parte desconta a quantidade e mantém o médio', () => {
    expect(
      assetPosition.decideSell({ current: position('0.75', '62000'), quantity: '0.25' }),
    ).toStrictEqual(saved('0.5', '62000'));
  });

  test('vender tudo zera a quantidade (a linha fica, com o médio de antes)', () => {
    expect(
      assetPosition.decideSell({ current: position('0.5', '62000'), quantity: '0.5' }),
    ).toStrictEqual(saved('0', '62000'));
  });

  test('vender 8 casas de diferença: a conta é exata', () => {
    expect(
      assetPosition.decideSell({ current: position('1', '10'), quantity: '0.99999999' }),
    ).toStrictEqual(saved('0.00000001', '10'));
  });

  test('vender mais do que há é recusado, mesmo por um satoshi', () => {
    expect(
      assetPosition.decideSell({ current: position('0.5', '62000'), quantity: '0.50000001' }),
    ).toStrictEqual({
      kind: 'refuse',
      reason: 'insufficient_quantity',
    });
  });

  test('vender sem ter o ativo é recusado como não encontrado', () => {
    expect(assetPosition.decideSell({ current: undefined, quantity: '1' })).toStrictEqual({
      kind: 'refuse',
      reason: 'not_found',
    });
  });
});

describe('substituição: a posição como o usuário a digitou', () => {
  test('grava os dois campos sem conta', () => {
    expect(assetPosition.decideReplace({ quantity: '3', averagePrice: '99.5' })).toStrictEqual(
      saved('3', '99.5'),
    );
  });
});
