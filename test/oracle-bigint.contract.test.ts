// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';

import {
  createEngine,
  EngineDecimal,
  ROUNDING_DIRECTION,
  roundMoney,
  roundToIncrement,
  walletStep,
} from '../packages/strategy-engine/src/index.js';
import { runSteps } from './fixtures/strategy-engine/engine-contract-runs.fixture.js';
import {
  deviationOfEngineRun,
  deviationOfWalletFlow,
  oracleStepsOfEngineRun,
} from './fixtures/strategy-engine/oracle-bigint-adapter.fixture.js';
import {
  findOracleDeviation,
  type OracleStep,
} from './fixtures/strategy-engine/oracle-bigint/oracle-ledger.fixture.js';
import {
  buyDebit,
  ceilDiv,
  ceilToIncrement,
  floorDiv,
  floorToIncrement,
  formatFixed,
  moneyDown,
  moneyUp,
  parseScaled,
  sellCredit,
  tradeFee,
} from './fixtures/strategy-engine/oracle-bigint/oracle-scaled.fixture.js';
import {
  buildClassicScenario,
  GOLDEN_DATASETS,
  runClassicEngine,
} from './fixtures/strategy-engine/production/engine-golden.fixture.js';
import { buildProductionScenarios } from './fixtures/strategy-engine/production/production-scenarios.fixture.js';
import { loadEngineMutantApi } from './fixtures/strategy-engine/production/engine-mutation.fixture.js';
import { removeMutants } from './fixtures/strategy-engine/signal/signal-mutation.fixture.js';
import { createWalletProbeEngine } from './fixtures/strategy-engine/production/wallet-probe-engine.fixture.js';
import { buildReferenceScenarios } from './fixtures/strategy-engine/reference-scenarios.fixture.js';
import {
  iterateFlows,
  runWalletFlow,
} from './fixtures/strategy-engine/wallet/wallet-differential.fixture.js';

const TIMEOUT_MILLISECONDS = 300_000;
const MUTANT_FLOWS = 400;
// Valores à mão em unidades de 1e-8 (dinheiro) e 1e-16 (notional).
const NOTIONAL_ENTRY = 1524156788599300000n;
const NOTIONAL_EXIT = 1524690121543300000n;
const FEE_RATE = parseScaled('0.001');

describe('bigint oracle: the rounding primitives by hand', () => {
  test('floor and ceiling division, with negatives and exact multiples', () => {
    expect([floorDiv(7n, 2n), ceilDiv(7n, 2n)]).toStrictEqual([3n, 4n]);
    expect([floorDiv(-7n, 2n), ceilDiv(-7n, 2n)]).toStrictEqual([-4n, -3n]);
    expect([floorDiv(6n, 3n), ceilDiv(6n, 3n)]).toStrictEqual([2n, 2n]);
    expect([floorDiv(-6n, 3n), ceilDiv(-6n, 3n)]).toStrictEqual([-2n, -2n]);
    expect([floorDiv(0n, 5n), ceilDiv(0n, 5n)]).toStrictEqual([0n, 0n]);
  });

  test('rounding to an increment: exactly on a multiple stays, negatives go the right way', () => {
    expect([floorToIncrement(105n, 10n), ceilToIncrement(105n, 10n)]).toStrictEqual([100n, 110n]);
    expect([floorToIncrement(100n, 10n), ceilToIncrement(100n, 10n)]).toStrictEqual([100n, 100n]);
    expect([floorToIncrement(-105n, 10n), ceilToIncrement(-105n, 10n)]).toStrictEqual([
      -110n,
      -100n,
    ]);
  });

  test('the production decimals agree with the same hand values', () => {
    const round = (value: string, increment: string, direction: 'up' | 'down'): string =>
      roundToIncrement({
        value: new EngineDecimal(value),
        increment: new EngineDecimal(increment),
        direction,
      }).toFixed();
    expect(round('1.05', '0.1', ROUNDING_DIRECTION.DOWN)).toBe('1');
    expect(round('1.0', '0.1', ROUNDING_DIRECTION.UP)).toBe('1');
    expect(round('-1.05', '0.1', ROUNDING_DIRECTION.DOWN)).toBe('-1.1');
    expect(round('-1.05', '0.1', ROUNDING_DIRECTION.UP)).toBe('-1');
    const money = (value: string, direction: 'up' | 'down'): string =>
      roundMoney({ value: new EngineDecimal(value), direction }).toFixed();
    expect(money('-1.234567891', ROUNDING_DIRECTION.DOWN)).toBe('-1.2345679');
    expect(money('-1.234567891', ROUNDING_DIRECTION.UP)).toBe('-1.23456789');
  });

  test('money: debit rounds up, credit rounds down, the fee rounds up (8 places)', () => {
    expect(moneyDown(NOTIONAL_ENTRY)).toBe(15_241_567_885n);
    expect(moneyUp(NOTIONAL_ENTRY)).toBe(15_241_567_886n);
    expect(tradeFee(NOTIONAL_ENTRY, FEE_RATE)).toBe(15_241_568n);
    expect(buyDebit(NOTIONAL_ENTRY, FEE_RATE)).toBe(15_256_809_454n);
    expect(tradeFee(NOTIONAL_EXIT, FEE_RATE)).toBe(15_246_902n);
    expect(sellCredit(NOTIONAL_EXIT, FEE_RATE)).toBe(15_231_654_313n);
  });

  test('parsing refuses a twelve-place increment and any text that is not a plain decimal', () => {
    expect(parseScaled('0.00000001')).toBe(1n);
    expect(formatFixed(parseScaled('-0.5'), 8)).toBe('-0.5');
    expect(() => parseScaled('0.000000000001')).toThrow();
    expect(() => parseScaled('1e-8')).toThrow();
    expect(() => parseScaled('1,5')).toThrow();
  });

  test('the oracle imports nothing from the engine source nor from the reference', () => {
    const directory = new URL('./fixtures/strategy-engine/oracle-bigint/', import.meta.url)
      .pathname;
    const files = readdirSync(directory);
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const file of files) {
      const importLines = readFileSync(`${directory}${file}`, 'utf8')
        .split('\n')
        .filter((line) => /\bfrom\s+'/.test(line));
      expect(importLines.filter((line) => /packages\/|reference-/.test(line))).toStrictEqual([]);
    }
  });
});

describe('bigint oracle: the engine ledger matches it step by step', () => {
  test(
    'the harness scenarios (production engine, real scoreboard signal)',
    () => {
      for (const scenario of buildProductionScenarios()) {
        const run = runSteps({ engine: createEngine(), scenario });
        expect([scenario.name, deviationOfEngineRun(scenario.run.parameters, run)]).toStrictEqual([
          scenario.name,
          undefined,
        ]);
      }
    },
    TIMEOUT_MILLISECONDS,
  );

  test('the reference scenarios (production wallet, reference signal), gaps and commands included', () => {
    for (const scenario of buildReferenceScenarios()) {
      const run = runSteps({ engine: createWalletProbeEngine(), scenario });
      expect([scenario.name, deviationOfEngineRun(scenario.run.parameters, run)]).toStrictEqual([
        scenario.name,
        undefined,
      ]);
    }
  });

  test(
    'the 3.000 generated wallet flows of the differential',
    () => {
      let steps = 0;
      for (const flow of iterateFlows()) {
        const run = runWalletFlow(flow, walletStep);
        steps += run.length;
        expect([flow.index, deviationOfWalletFlow(flow.run.parameters, run)]).toStrictEqual([
          flow.index,
          undefined,
        ]);
      }
      expect(steps).toBeGreaterThan(100_000);
    },
    TIMEOUT_MILLISECONDS,
  );

  test.each(GOLDEN_DATASETS.map((dataset) => [dataset.name, dataset] as const))(
    'the real dataset %s',
    (_name, dataset) => {
      const scenario = buildClassicScenario(dataset);
      expect(
        deviationOfEngineRun(scenario.run.parameters, runClassicEngine(dataset)),
      ).toBeUndefined();
    },
    TIMEOUT_MILLISECONDS,
  );
});

const ORACLE_MUTANTS = [
  {
    name: 'ORACLE_SELL_CREDIT_ROUNDED_UP',
    edits: [
      {
        file: 'money.ts',
        find: 'return moneyDown(notional).minus(computeTradeFee(notional, feeRate));',
        replace: 'return moneyUp(notional).minus(computeTradeFee(notional, feeRate));',
      },
    ],
  },
  {
    name: 'ORACLE_BUY_DEBIT_ROUNDED_DOWN',
    edits: [
      {
        file: 'money.ts',
        find: 'return moneyUp(notional).plus(computeTradeFee(notional, feeRate));',
        replace: 'return moneyDown(notional).plus(computeTradeFee(notional, feeRate));',
      },
    ],
  },
  {
    name: 'ORACLE_FEE_ROUNDED_DOWN',
    edits: [
      {
        file: 'money.ts',
        find: 'return moneyUp(notional.times(feeRate));',
        replace: 'return moneyDown(notional.times(feeRate));',
      },
    ],
  },
  {
    name: 'ORACLE_EQUITY_LOW_IGNORES_THE_TARGET_EXIT',
    edits: [
      {
        file: 'wallet/wallet-valuation.ts',
        find: '(position) => position.exitReason === EXIT_REASON.TARGET',
        replace: '() => false',
      },
    ],
  },
] as const;

describe('bigint oracle: it reproves mutated wallets on its own (no reference involved)', () => {
  afterAll(removeMutants);

  test.each(ORACLE_MUTANTS.map((mutant) => [mutant.name, mutant] as const))(
    '%s',
    async (_name, mutant) => {
      const api = await loadEngineMutantApi({ name: mutant.name, edits: mutant.edits });
      let deviation: string | undefined;
      for (const flow of iterateFlows(MUTANT_FLOWS)) {
        deviation = deviationOfWalletFlow(flow.run.parameters, runWalletFlow(flow, api.walletStep));
        if (deviation !== undefined) break;
      }
      expect(deviation).toBeDefined();
    },
    TIMEOUT_MILLISECONDS,
  );
});

describe('bigint oracle: it is not vacuous (a corrupted step is reported)', () => {
  const scenario = buildProductionScenarios()[0];
  if (scenario === undefined) throw new Error('Cenário ausente.');
  const steps = oracleStepsOfEngineRun(runSteps({ engine: createEngine(), scenario }));
  const parameters = scenario.run.parameters;
  const closedIndex = steps.findIndex((step) => step.closed.length > 0);

  function corrupt(index: number, patch: (step: OracleStep) => OracleStep): string | undefined {
    const changed = steps.map((step, position) => (position === index ? patch(step) : step));
    return findOracleDeviation(parameters, changed);
  }

  test('the untouched run passes and has trades to corrupt', () => {
    expect(closedIndex).toBeGreaterThan(0);
    expect(findOracleDeviation(parameters, steps)).toBeUndefined();
  });

  const CORRUPTIONS: readonly (readonly [string, (step: OracleStep) => OracleStep])[] = [
    ['the cash', (step): OracleStep => ({ ...step, reportedCash: '1' })],
    [
      'a fee',
      (step): OracleStep => ({
        ...step,
        fills: step.fills.map((fill) => ({ ...fill, fee: '0' })),
      }),
    ],
    [
      'the net profit',
      (step): OracleStep => ({
        ...step,
        closed: step.closed.map((closed) => ({ ...closed, netProfit: '0' })),
      }),
    ],
    [
      'the equity at the close',
      (step): OracleStep => ({
        ...step,
        point: step.point && { ...step.point, equity: '1' },
      }),
    ],
    [
      'the equity at the low',
      (step): OracleStep => ({
        ...step,
        point: step.point && { ...step.point, equityAtLow: '1' },
      }),
    ],
  ];

  test.each(CORRUPTIONS)('detects a wrong value for %s', (_label, patch) => {
    expect(corrupt(closedIndex, patch)).toBeDefined();
  });
});
