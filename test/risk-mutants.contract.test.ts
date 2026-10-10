// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, describe, expect, test } from 'bun:test';

import { PRODUCTION_RISK_API } from './fixtures/strategy-engine/risk/risk-api.fixture.js';
import { buildRiskGrid, type RiskCase } from './fixtures/strategy-engine/risk/risk-grid.fixture.js';
import {
  judgeRiskApi,
  type RiskRewrite,
} from './fixtures/strategy-engine/risk/risk-judge.fixture.js';
import {
  loadRiskMutantApi,
  type RiskSourceEdit,
} from './fixtures/strategy-engine/risk/risk-mutation.fixture.js';
import { removeMutants } from './fixtures/strategy-engine/signal/signal-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 60_000;
const BOUND = 'risk/quantity-bound.ts';
const TRADE_COST = 'risk/trade-cost.ts';
const POSITION_SIZE = 'risk/position-size.ts';
const PROTECTIVE = 'risk/protective-prices.ts';

const GRID = buildRiskGrid();

type Mutant = {
  readonly name: string;
  readonly edits: readonly RiskSourceEdit[];
  // A propriedade (sem consultar o oráculo) também reprova o mutante?
  readonly isCaughtByProperty: boolean;
};

function edit(file: string, find: string, replace: string): readonly RiskSourceEdit[] {
  return [{ file, find, replace }];
}

const SOURCE_MUTANTS: readonly Mutant[] = [
  {
    name: 'EXIT_FEE_IGNORED_IN_SIZE',
    edits: edit(BOUND, '.plus(exitPrice.times(feeRate))', ''),
    isCaughtByProperty: true,
  },
  {
    name: 'QUANTITY_ROUNDED_UP',
    edits: [
      ...edit(
        BOUND,
        "import { floorToIncrement } from './rounding.js';",
        "import { ceilToIncrement } from './rounding.js';",
      ),
      ...edit(
        BOUND,
        'return floorToIncrement(EngineDecimal.max(value, ZERO), step);',
        'return ceilToIncrement(EngineDecimal.max(value, ZERO), step);',
      ),
    ],
    isCaughtByProperty: true,
  },
  {
    name: 'CASH_CAP_FORGOTTEN',
    edits: edit(BOUND, 'quantity: byCash }', 'quantity: byRisk }'),
    isCaughtByProperty: true,
  },
  {
    name: 'EXPOSURE_CAP_FORGOTTEN',
    edits: edit(BOUND, 'quantity: byExposure }', 'quantity: byRisk }'),
    isCaughtByProperty: true,
  },
  {
    name: 'VOLUME_CAP_FORGOTTEN',
    edits: edit(BOUND, 'quantity: byVolume }', 'quantity: byRisk }'),
    isCaughtByProperty: true,
  },
  {
    name: 'EXPOSURE_ON_CASH_INSTEAD_OF_EQUITY',
    edits: edit(
      BOUND,
      'new EngineDecimal(params.equity).times(params.maxExposureRate)',
      'new EngineDecimal(params.cash).times(params.maxExposureRate)',
    ),
    isCaughtByProperty: true,
  },
  {
    name: 'MIN_NOTIONAL_IGNORED',
    edits: edit(
      POSITION_SIZE,
      'const isBelowMinimum = notional.lessThan(params.minNotional);',
      'const isBelowMinimum = false;',
    ),
    isCaughtByProperty: true,
  },
  {
    name: 'INVALID_STOP_ACCEPTED',
    edits: edit(POSITION_SIZE, 'stopPrice.gte(highestStop)', 'stopPrice.gte(entryPrice)'),
    isCaughtByProperty: false,
  },
  {
    name: 'STOP_EXIT_WITHOUT_SLIPPAGE',
    edits: edit(
      TRADE_COST,
      'new EngineDecimal(params.stopPrice).times(ONE.minus(params.slippageRate))',
      'new EngineDecimal(params.stopPrice)',
    ),
    isCaughtByProperty: true,
  },
  {
    name: 'MONEY_DEBIT_ROUNDED_DOWN',
    edits: edit(
      TRADE_COST,
      'return roundMoney({ value, direction: ROUNDING_DIRECTION.UP });',
      'return roundMoney({ value, direction: ROUNDING_DIRECTION.DOWN });',
    ),
    isCaughtByProperty: true,
  },
  {
    name: 'LOSS_ROUNDING_SLACK_DROPPED',
    edits: edit(
      BOUND,
      'new EngineDecimal(params.riskAmount).minus(LOSS_SLACK)',
      'new EngineDecimal(params.riskAmount)',
    ),
    isCaughtByProperty: true,
  },
  {
    name: 'DEBIT_ROUNDING_SLACK_DROPPED',
    edits: edit(
      BOUND,
      'new EngineDecimal(params.cash).minus(DEBIT_SLACK)',
      'new EngineDecimal(params.cash)',
    ),
    isCaughtByProperty: true,
  },
  {
    name: 'STOP_ROUNDED_UP',
    edits: edit(
      PROTECTIVE,
      'floorToIncrement(rawStop, params.tickSize)',
      'ceilToIncrement(rawStop, params.tickSize)',
    ),
    isCaughtByProperty: true,
  },
  {
    name: 'TARGET_ROUNDED_DOWN',
    edits: edit(
      PROTECTIVE,
      'ceilToIncrement(entryPrice.plus(targetDistance), params.tickSize)',
      'floorToIncrement(entryPrice.plus(targetDistance), params.tickSize)',
    ),
    isCaughtByProperty: true,
  },
  {
    name: 'ZERO_ATR_NOT_REFUSED',
    edits: edit(PROTECTIVE, 'if (atr.lte(ZERO)) return refuse(PROTECTIVE_REFUSAL.ZERO_ATR);', ''),
    isCaughtByProperty: false,
  },
];

// Mutantes de ENTRADA: a produção é a mesma, mas quem chama lhe dá o dado errado (o futuro ou o candle
// errado). O diferencial usa a entrada legítima no oráculo e a trocada na produção.
type InputMutant = {
  readonly name: string;
  readonly rewrite: RiskRewrite;
};

const INPUT_MUTANTS: readonly InputMutant[] = [
  {
    name: 'CLOSE_OF_DECISION_INSTEAD_OF_FILL_PRICE',
    rewrite: (riskCase: RiskCase): RiskCase => ({
      ...riskCase,
      protective: { ...riskCase.protective, entryPrice: riskCase.decisionClose },
    }),
  },
  {
    name: 'ATR_OF_NEXT_CANDLE',
    rewrite: (riskCase: RiskCase): RiskCase => ({
      ...riskCase,
      protective: { ...riskCase.protective, atr: riskCase.nextAtr },
    }),
  },
  {
    name: 'VOLUME_OF_FILL_CANDLE',
    rewrite: (riskCase: RiskCase): RiskCase => ({
      ...riskCase,
      sizing: { ...riskCase.sizing, candleVolume: riskCase.fillCandleVolume },
    }),
  },
];

describe('production risk: the differential and the properties reject every mutant', () => {
  afterAll(removeMutants);

  test('the production code survives the same gauntlet', () => {
    const verdict = judgeRiskApi({ api: PRODUCTION_RISK_API, cases: GRID });
    expect(verdict).toStrictEqual({ differential: undefined, property: undefined });
  });

  test.each(SOURCE_MUTANTS.map((mutant) => [mutant.name, mutant] as const))(
    '%s',
    async (_name, mutant) => {
      const api = await loadRiskMutantApi(mutant);
      const verdict = judgeRiskApi({ api, cases: GRID });
      expect(verdict.differential).toBeDefined();
      expect(verdict.property !== undefined).toBe(mutant.isCaughtByProperty);
    },
    MUTANT_TIMEOUT_MILLISECONDS,
  );

  test.each(INPUT_MUTANTS.map((mutant) => [mutant.name, mutant] as const))(
    '%s',
    (_name, mutant) => {
      const verdict = judgeRiskApi({
        api: PRODUCTION_RISK_API,
        cases: GRID,
        rewrite: mutant.rewrite,
      });
      expect(verdict.differential).toBeDefined();
    },
  );

  test('the mutants the architect listed are all there', () => {
    const names = [...SOURCE_MUTANTS, ...INPUT_MUTANTS].map((mutant) => mutant.name);
    for (const mandatory of [
      'EXIT_FEE_IGNORED_IN_SIZE',
      'CLOSE_OF_DECISION_INSTEAD_OF_FILL_PRICE',
      'QUANTITY_ROUNDED_UP',
      'CASH_CAP_FORGOTTEN',
      'EXPOSURE_CAP_FORGOTTEN',
      'VOLUME_OF_FILL_CANDLE',
      'MIN_NOTIONAL_IGNORED',
      'STOP_ROUNDED_UP',
      'TARGET_ROUNDED_DOWN',
      'ATR_OF_NEXT_CANDLE',
    ]) {
      expect(names).toContain(mandatory);
    }
  });
});
