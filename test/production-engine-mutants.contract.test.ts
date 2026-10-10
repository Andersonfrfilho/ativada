// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, describe, expect, test } from 'bun:test';

import { PRODUCTION_ENGINE_API } from './fixtures/strategy-engine/production/engine-api.fixture.js';
import {
  JUDGE_STAGE,
  judgeEngineApiAgainstReference,
  type JudgeStage,
} from './fixtures/strategy-engine/production/engine-judge.fixture.js';
import {
  loadEngineMutantApi,
  type EngineSourceEdit,
} from './fixtures/strategy-engine/production/engine-mutation.fixture.js';
import { removeMutants } from './fixtures/strategy-engine/signal/signal-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 120_000;
const MUTANT_FLOW_COUNT = 400;
const PRICING = 'wallet/wallet-pricing.ts';
const FILL_MODEL = 'wallet/fill-model.ts';
const LIMIT_FILL = 'wallet/limit-fill.ts';
const PROTECTIVE = 'wallet/protective-exit.ts';
const ENTRY_FILL = 'wallet/entry-fill.ts';
const EXIT_FILL = 'wallet/exit-fill.ts';
const ENTRY_ORDER = 'wallet/entry-order.ts';
const POLICY = 'wallet/signal-policy.ts';
const VALUATION = 'wallet/wallet-valuation.ts';
const GUARD = 'wallet/wallet-guard.ts';
const WALLET_STEP = 'wallet/wallet-step.ts';
const SIGNAL_STEP = 'signal-step.ts';
const GAP_CLOSE = 'wallet/gap-close.ts';

type Mutant = {
  readonly name: string;
  readonly edits: readonly EngineSourceEdit[];
  // Quem reprova primeiro: o diferencial contra a referência, as guardas, a API do motor ou o harness.
  readonly stage: JudgeStage;
};

function edit(file: string, find: string, replace: string): readonly EngineSourceEdit[] {
  return [{ file, find, replace }];
}

const FILL_MUTANTS: readonly Mutant[] = [
  {
    name: 'FILL_AT_THE_CLOSE_OF_THE_FILL_CANDLE',
    edits: edit(
      FILL_MODEL,
      'marketBuyPrice(context.candle.open, context.parameters)',
      'marketBuyPrice(context.candle.close, context.parameters)',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'FILL_IN_THE_DECISION_CANDLE',
    edits: [
      ...edit(
        WALLET_STEP,
        '  else applyFillModel(draft, context);\n  buyBenchmark',
        '  buyBenchmark',
      ),
      ...edit(
        WALLET_STEP,
        '  const equityPoint = input.signal === null',
        '  applyFillModel(draft, context);\n  const equityPoint = input.signal === null',
      ),
    ],
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'FEE_IGNORED',
    edits: edit(
      PRICING,
      'notional.times(toEngineDecimal(parameters.feeRate))',
      'notional.times(0)',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'EXIT_FEE_IGNORED',
    edits: edit(
      EXIT_FILL,
      'const exitFee = tradeFee(notional, parameters);',
      'const exitFee = tradeFee(notional.times(0), parameters);',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'BUY_SLIPPAGE_IGNORED',
    edits: edit(PRICING, 'ONE.plus(toEngineDecimal(parameters.slippageRate))', 'ONE'),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'SELL_SLIPPAGE_IGNORED',
    edits: edit(PRICING, 'ONE.minus(toEngineDecimal(parameters.slippageRate))', 'ONE'),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'BUY_PRICE_ROUNDED_DOWN',
    edits: edit(
      PRICING,
      'return tickUp(slipped, parameters);',
      'return tickDown(slipped, parameters);',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'TARGET_BEFORE_STOP',
    edits: edit(
      PROTECTIVE,
      'if (toEngineDecimal(candle.low).lte(position.stopPrice)) {',
      'if (\n    toEngineDecimal(candle.low).lte(position.stopPrice) &&\n    !toEngineDecimal(candle.high).greaterThan(position.targetPrice)\n  ) {',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'GAP_EXIT_AT_THE_STOP_PRICE',
    edits: edit(
      PRICING,
      'EngineDecimal.min(toEngineDecimal(params.stop), toEngineDecimal(params.open))',
      'toEngineDecimal(params.stop)',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'STOP_NEEDS_TO_CROSS',
    edits: edit(
      PROTECTIVE,
      'toEngineDecimal(candle.low).lte(position.stopPrice)',
      'toEngineDecimal(candle.low).lessThan(position.stopPrice)',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'TARGET_ON_TOUCH',
    edits: edit(
      PROTECTIVE,
      '!isBlocked && toEngineDecimal(candle.high).greaterThan(position.targetPrice)',
      '!isBlocked && toEngineDecimal(candle.high).gte(position.targetPrice)',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'INTRA_CANDLE_FILL_COUNTS_THE_TARGET',
    edits: edit(
      PROTECTIVE,
      'const isBlocked = isEntryCandle && draft.isIntraCandleEntry;',
      'const isBlocked = false;',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'LIMIT_FILLS_ON_TOUCH',
    edits: edit(
      LIMIT_FILL,
      'toEngineDecimal(candle.low).lessThan(limit)',
      'toEngineDecimal(candle.low).lte(limit)',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'PRICE_IMPROVEMENT_ON_EVERY_CANDLE',
    edits: edit(
      LIMIT_FILL,
      'const price = isFirstEligibleCandle(order, context) ? improved : limit;',
      'const price = improved;',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'LIMIT_EXPIRES_ONE_CANDLE_EARLY',
    edits: edit(LIMIT_FILL, 'if (remaining > 0) {', 'if (remaining > 1) {'),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'PROTECTION_FROM_THE_OPEN_NOT_THE_FILL_PRICE',
    edits: edit(
      ENTRY_FILL,
      'entryPrice: formatEngineDecimal(fill.price),\n    atr: recoverDecisionAtr',
      'entryPrice: context.candle.open,\n    atr: recoverDecisionAtr',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'VOLUME_OF_THE_FILL_CANDLE',
    edits: edit(
      ENTRY_FILL,
      "candleVolume: requireText(fill.order.decisionVolume, 'volume de decisão'),",
      'candleVolume: context.candle.volume,',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'CASH_CAP_FORGOTTEN',
    edits: edit(ENTRY_FILL, '    cash: draft.state.cash,', "    cash: '1000000000000',"),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'BENCHMARK_BOUGHT_AT_THE_CLOSE',
    edits: edit(
      VALUATION,
      'const price = marketBuyPrice(candle.open, parameters);',
      'const price = marketBuyPrice(candle.close, parameters);',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'EQUITY_AT_LOW_MARKED_AT_THE_CLOSE',
    edits: edit(
      VALUATION,
      'price: candle.low }, parameters)',
      'price: candle.close }, parameters)',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'EQUITY_LOW_IGNORES_EXITING_POSITION',
    edits: edit(
      VALUATION,
      '(position) => position.exitReason === EXIT_REASON.TARGET',
      '() => false',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'EQUITY_LOW_COUNTS_STOP_AT_LOW',
    edits: edit(
      VALUATION,
      '(position) => position.exitReason === EXIT_REASON.TARGET',
      '(position) =>\n      position.exitReason === EXIT_REASON.TARGET || position.exitReason === EXIT_REASON.STOP',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
];

const POLICY_MUTANTS: readonly Mutant[] = [
  {
    name: 'SECOND_POSITION_ALLOWED',
    edits: edit(
      ENTRY_ORDER,
      'if (state.isHalted || state.pendingOrder !== null || state.position !== null) return;',
      'if (state.isHalted || state.pendingOrder !== null) return;',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'SELL_IGNORED',
    edits: edit(POLICY, '  createExit(draft, context, EXIT_REASON.SIGNAL);\n}', '}'),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'SELL_KEEPS_THE_LIVE_LIMIT',
    edits: edit(
      POLICY,
      '  cancelPendingEntry(draft, context, ORDER_EVENT_REASON.OPPOSITE_SIGNAL);\n',
      '',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'HALT_IGNORED',
    edits: edit(
      POLICY,
      'draft.state = { ...draft.state, isHalted: true };',
      'draft.state = { ...draft.state };',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'COMMAND_REAPPLIED',
    edits: edit(
      POLICY,
      'for (const command of closing.commands) applyCommand(draft, context, command);',
      'for (const command of closing.commands) {\n    applyCommand(draft, context, command);\n    applyCommand(draft, context, command);\n  }',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
];

const GAP_MUTANTS: readonly Mutant[] = [
  {
    name: 'GAP_KEEPS_POSITION',
    edits: edit(GAP_CLOSE, '  closeOnGap(draft, context);\n', ''),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'GAP_KEEPS_PENDING',
    edits: edit(GAP_CLOSE, '  cancelPendingOrder(draft, context);\n', ''),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'GAP_ALLOWS_ENTRY',
    edits: edit(
      POLICY,
      'return closing.isAfterGap ? undefined : placeEntry(draft, context, signal);',
      'return placeEntry(draft, context, signal);',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'GAP_EXIT_AT_THE_STOP_NOT_THE_OPEN',
    edits: edit(
      GAP_CLOSE,
      '{ stop: position.stopPrice, open: context.candle.open }',
      '{ stop: position.stopPrice, open: position.stopPrice }',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
  {
    name: 'GAP_NEEDS_TWO_CANDLES',
    edits: edit(
      WALLET_STEP,
      '(input.signal?.confirmedGapCandles ?? 0) > 0',
      '(input.signal?.confirmedGapCandles ?? 0) > 1',
    ),
    stage: JUDGE_STAGE.DIFFERENTIAL,
  },
];

const GUARD_MUTANTS: readonly Mutant[] = [
  {
    name: 'CONTIGUITY_NOT_CHECKED',
    edits: edit(GUARD, '  assertWalletContiguity(input);\n}', '}'),
    stage: JUDGE_STAGE.GUARDS,
  },
  {
    name: 'GAP_ECHO_IGNORED',
    edits: edit(
      GUARD,
      'const declared = input.signal?.confirmedGapCandles ?? 0;',
      'const declared = missing;',
    ),
    stage: JUDGE_STAGE.GUARDS,
  },
  {
    name: 'HASHES_NOT_CHECKED',
    edits: edit(GUARD, '  assertWalletHashes(input);\n', ''),
    stage: JUDGE_STAGE.GUARDS,
  },
  {
    name: 'SIGNAL_HASH_NOT_CHECKED',
    edits: edit(
      GUARD,
      'if (input.signal !== null && input.signal.configHash !== input.strategy.configHash) {',
      'if (false) {',
    ),
    stage: JUDGE_STAGE.GUARDS,
  },
  {
    name: 'EXECUTION_REPORTS_IGNORED',
    edits: edit(
      FILL_MODEL,
      'if ((reports?.length ?? 0) === 0) return;',
      'if ((reports?.length ?? 0) >= 0) return;',
    ),
    stage: JUDGE_STAGE.GUARDS,
  },
  {
    name: 'SIGNAL_DOES_NOT_ECHO_THE_GAP',
    edits: edit(
      SIGNAL_STEP,
      'confirmedGapCandles: input.confirmedGapCandles ?? 0,',
      'confirmedGapCandles: 0,',
    ),
    stage: JUDGE_STAGE.ENGINE_API,
  },
];

const CREATE_ENGINE = 'create-engine.ts';
const ASSERT_HASHES = 'assert-hashes.ts';
const ASSERT_STEP = 'assert-step-input.ts';

const HASH_MUTANTS: readonly Mutant[] = [
  {
    name: 'RUN_HASH_NOT_RECOMPUTED',
    edits: edit(ASSERT_HASHES, 'if (recomputeRunHash(run) !== run.runHash) {', 'if (false) {'),
    stage: JUDGE_STAGE.GUARDS,
  },
  {
    name: 'CONFIG_HASH_NOT_RECOMPUTED',
    edits: edit(
      ASSERT_HASHES,
      'if (recomputeStrategyHash(strategy) !== strategy.configHash) {',
      'if (false) {',
    ),
    stage: JUDGE_STAGE.GUARDS,
  },
  {
    name: 'HASH_CACHE_DISABLED',
    edits: edit(ASSERT_HASHES, 'if (VERIFIED_STRATEGIES.has(strategy)) return;', ''),
    stage: JUDGE_STAGE.GUARDS,
  },
  {
    name: 'STEP_DOES_NOT_RECOMPUTE_THE_HASHES',
    edits: edit(
      ASSERT_STEP,
      '  assertStrategyHash(input.strategy);\n  assertRunHash(input.run);\n',
      '',
    ),
    stage: JUDGE_STAGE.ENGINE_API,
  },
];

const COMPOSITION_MUTANTS: readonly Mutant[] = [
  {
    name: 'STEP_DROPS_THE_COMMANDS',
    edits: edit(CREATE_ENGINE, '    commands: input.commands,\n', ''),
    stage: JUDGE_STAGE.HARNESS,
  },
  {
    name: 'STEP_WITHOUT_THE_INPUT_GUARD',
    edits: edit(
      CREATE_ENGINE,
      '  assertStepInput({ input, engineVersion: ENGINE_VERSION });\n',
      '',
    ),
    stage: JUDGE_STAGE.ENGINE_API,
  },
];

const SOURCE_MUTANTS: readonly Mutant[] = [
  ...FILL_MUTANTS,
  ...POLICY_MUTANTS,
  ...GAP_MUTANTS,
  ...GUARD_MUTANTS,
  ...COMPOSITION_MUTANTS,
  ...HASH_MUTANTS,
];

describe('production engine: the guards, the differential and the harness reject every mutant', () => {
  afterAll(removeMutants);

  test('there are at least twenty mutants and every name is unique', () => {
    expect(SOURCE_MUTANTS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(SOURCE_MUTANTS.map((mutant) => mutant.name)).size).toBe(SOURCE_MUTANTS.length);
  });

  test(
    'the production code survives the same gauntlet (the 3.000 flows run in the differential tests)',
    () => {
      const verdict = judgeEngineApiAgainstReference({
        api: PRODUCTION_ENGINE_API,
        flowCount: MUTANT_FLOW_COUNT,
      });
      expect(verdict).toBeUndefined();
    },
    MUTANT_TIMEOUT_MILLISECONDS,
  );

  test.each(SOURCE_MUTANTS.map((mutant) => [mutant.name, mutant] as const))(
    '%s',
    async (_name, mutant) => {
      const api = await loadEngineMutantApi(mutant);
      const verdict = judgeEngineApiAgainstReference({ api, flowCount: MUTANT_FLOW_COUNT });
      expect(verdict?.stage).toBe(mutant.stage);
    },
    MUTANT_TIMEOUT_MILLISECONDS,
  );

  test('the mutants the brief listed are all there', () => {
    const names = SOURCE_MUTANTS.map((mutant) => mutant.name);
    for (const mandatory of [
      'FILL_AT_THE_CLOSE_OF_THE_FILL_CANDLE',
      'FILL_IN_THE_DECISION_CANDLE',
      'FEE_IGNORED',
      'BUY_SLIPPAGE_IGNORED',
      'TARGET_BEFORE_STOP',
      'GAP_EXIT_AT_THE_STOP_PRICE',
      'LIMIT_FILLS_ON_TOUCH',
      'PRICE_IMPROVEMENT_ON_EVERY_CANDLE',
      'LIMIT_EXPIRES_ONE_CANDLE_EARLY',
      'CASH_CAP_FORGOTTEN',
      'SECOND_POSITION_ALLOWED',
      'SELL_IGNORED',
      'HALT_IGNORED',
      'COMMAND_REAPPLIED',
      'GAP_KEEPS_POSITION',
      'GAP_KEEPS_PENDING',
      'EQUITY_AT_LOW_MARKED_AT_THE_CLOSE',
      'EQUITY_LOW_IGNORES_EXITING_POSITION',
      'EQUITY_LOW_COUNTS_STOP_AT_LOW',
      'CONTIGUITY_NOT_CHECKED',
      'HASHES_NOT_CHECKED',
      'RUN_HASH_NOT_RECOMPUTED',
      'CONFIG_HASH_NOT_RECOMPUTED',
      'HASH_CACHE_DISABLED',
    ]) {
      expect(names).toContain(mandatory);
    }
  });
});
