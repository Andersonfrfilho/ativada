// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { MutantTarget } from '../walk-forward/walk-forward-mutation.fixture.js';
import { TICKER_SOURCE_VARIABLE } from './ticker-source.fixture.js';

const REPOSITORY_ROOT = new URL('../../../', import.meta.url).pathname;

// O ticker público (T4.7): a cópia leva o `src` INTEIRO do pacote de mercado, julgada só pelos contratos do ticker, da
// agregação e da variação de 24 h.
export const TICKER_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}packages/market-data/src`,
  mutantRoot: `${REPOSITORY_ROOT}packages/market-data/.mutants`,
  directoryPrefix: 'ticker-',
  judgeTestFiles: [
    'test/percent-change.contract.test.ts',
    'test/tick-aggregator.contract.test.ts',
    'test/ticker-stream.contract.test.ts',
  ],
  sourceVariable: TICKER_SOURCE_VARIABLE,
  judgeTimeoutMilliseconds: 120_000,
  shouldBailOnFirstFailure: true,
};
