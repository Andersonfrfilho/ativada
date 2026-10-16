// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { BINANCE_SYMBOL_FILTERS } from '../packages/market-data-crypto/src/symbol-filters.constant.js';
import { SYMBOL_FILTERS } from '../apps/frontend-ativada/src/notices/symbol-filters.js';

describe('filtros por par do painel (avisos)', () => {
  test('o espelho do painel é igual à tabela de produção, par a par', () => {
    expect(SYMBOL_FILTERS).toEqual(BINANCE_SYMBOL_FILTERS);
  });
});
