// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, describe, expect, test } from 'bun:test';

import { PRODUCTION_SIGNAL_API } from './fixtures/strategy-engine/signal/signal-api.fixture.js';
import { buildSignalScenarios } from './fixtures/strategy-engine/signal/signal-contract-scenarios.fixture.js';
import {
  runSignalCheck,
  SIGNAL_CONTRACT_CHECK,
  SignalContractViolation,
} from './fixtures/strategy-engine/signal/signal-contract.fixture.js';
import {
  createRegimeOnFutureAdxApi,
  createVoteLookaheadApi,
  judgeMutant,
  loadMutantApi,
  removeMutants,
  type SourceMutant,
} from './fixtures/strategy-engine/signal/signal-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 60_000;
const RULE_CASES = 'rule-cases';
const SCENARIOS = 'scoreboard-scenarios';
const SELECTION = 'selection-cases';
const COMPLETES = `contract:${SIGNAL_CONTRACT_CHECK.COMPLETES}`;
const TIMING = `contract:${SIGNAL_CONTRACT_CHECK.TIMING}`;

type SourceMutantCase = SourceMutant & { readonly detector: string };

// Cada mutante é o `src` de produção com UMA mutação (texto trocado numa cópia do pacote); o
// detector é quem o reprova primeiro. Mutante vivo é defeito do teste, não do código.
const SOURCE_MUTANTS: readonly SourceMutantCase[] = [
  {
    name: 'THRESHOLD_EXCLUSIVE',
    file: 'scoreboard.ts',
    find: 'score.gte(thresholds.buy)',
    replace: 'score.greaterThan(thresholds.buy)',
    detector: SCENARIOS,
  },
  {
    name: 'THRESHOLD_EXCLUSIVE_SELL',
    file: 'scoreboard.ts',
    find: 'score.lte(thresholds.sell)',
    replace: 'score.lessThan(thresholds.sell)',
    detector: SCENARIOS,
  },
  {
    name: 'WEIGHTS_SWAPPED',
    file: 'regime.ts',
    find: 'regimeConfig.weights.trending : regimeConfig.weights.ranging',
    replace: 'regimeConfig.weights.ranging : regimeConfig.weights.trending',
    detector: RULE_CASES,
  },
  {
    name: 'SENTIMENT_STALE_ACCEPTED',
    file: 'sentiment.ts',
    find: 'return age > SENTIMENT_STALE_AFTER_MILLISECONDS ? null : sentiment;',
    replace: 'return age > 0 ? sentiment : sentiment;',
    detector: SCENARIOS,
  },
  {
    name: 'SENTIMENT_WRONG_SOURCE',
    file: 'scoreboard.ts',
    find: 'sentiment.source !== input.sentimentSource',
    replace: 'sentiment.value < 0',
    detector: SCENARIOS,
  },
  {
    name: 'ADX_ROUNDED_UP',
    file: 'regime.ts',
    find: 'EngineDecimal.ROUND_DOWN',
    replace: 'EngineDecimal.ROUND_HALF_UP',
    detector: RULE_CASES,
  },
  {
    name: 'HOLD_BEFORE_WARMUP_MISSING',
    file: 'signal-step.ts',
    find: 'processedCandles < state.leadInCandles',
    replace: 'processedCandles < 0',
    detector: COMPLETES,
  },
  {
    name: 'WARMUP_ONE_CANDLE_LATE',
    file: 'signal-step.ts',
    find: 'processedCandles < state.leadInCandles',
    replace: 'processedCandles <= state.leadInCandles',
    detector: TIMING,
  },
  {
    name: 'DONCHIAN_WITHOUT_EXTRA_CANDLE',
    file: 'strategy-horizons.ts',
    find: 'const BREAKOUT_EXTRA_CANDLES = 1;',
    replace: 'const BREAKOUT_EXTRA_CANDLES = 0;',
    detector: COMPLETES,
  },
  {
    name: 'DONCHIAN_USES_CURRENT_CHANNEL',
    file: 'rule-vote.ts',
    find: 'value: reading.previous,',
    replace: 'value: reading.current,',
    occurrences: 2,
    detector: RULE_CASES,
  },
  {
    name: 'DONCHIAN_PREVIOUS_NOT_STORED',
    file: 'signal-indicators.ts',
    find: 'if (current !== undefined) next[previousId] = current;',
    replace: 'void previousId;',
    detector: COMPLETES,
  },
  {
    name: 'SNAPSHOT_NOT_SAVED',
    file: 'signal-indicators.ts',
    find: '\n  next[id] = indicator.snapshot();',
    replace: '\n  void indicator.snapshot();',
    detector: COMPLETES,
  },
  {
    name: 'RSI_AT_OVERSOLD_BUYS',
    file: 'rule-vote.ts',
    find: 'if (params.value < params.floor) return 1;',
    replace: 'if (params.value <= params.floor) return 1;',
    detector: RULE_CASES,
  },
  {
    name: 'EQUAL_AVERAGES_BUY',
    file: 'rule-vote.ts',
    find: 'if (left > right) return 1;',
    replace: 'if (left >= right) return 1;',
    detector: RULE_CASES,
  },
  {
    name: 'FEAR_NOT_CONTRARIAN',
    file: 'rule-vote.ts',
    find: 'if (sentiment.value <= rule.fearAtOrBelow) return decided(1);',
    replace: 'if (sentiment.value <= rule.fearAtOrBelow) return decided(-1);',
    detector: RULE_CASES,
  },
  {
    name: 'MISSING_SENTIMENT_NOT_FLAGGED',
    file: 'rule-vote.ts',
    find: 'if (sentiment === null) return { vote: 0, isMissing: true };',
    replace: 'if (sentiment === null) return { vote: 0, isMissing: false };',
    detector: RULE_CASES,
  },
  {
    name: 'REGIME_THRESHOLD_EXCLUSIVE',
    file: 'regime.ts',
    find: 'adx >= regime.trendThreshold',
    replace: 'adx > regime.trendThreshold',
    detector: RULE_CASES,
  },
  {
    name: 'SELECTOR_IGNORES_SOURCE',
    file: 'sentiment.ts',
    find: 'observation.source === params.source &&',
    replace: 'params.source.length > 0 &&',
    detector: SELECTION,
  },
  {
    name: 'SELECTOR_IGNORES_INSERTION_CUTOFF',
    file: 'sentiment.ts',
    find: 'observation.createdAt <= params.insertionCutoff &&',
    replace: 'params.insertionCutoff > 0 &&',
    detector: SELECTION,
  },
  {
    name: 'SELECTOR_ACCEPTS_FUTURE_OBSERVATION',
    file: 'sentiment.ts',
    find: 'observation.observedAt <= params.closeTime',
    replace: 'params.closeTime > 0',
    detector: SELECTION,
  },
];

describe('production signal step: source mutants are rejected', () => {
  afterAll(removeMutants);

  test('the production code survives the same gauntlet', () => {
    expect(judgeMutant(PRODUCTION_SIGNAL_API)).toBeUndefined();
  });

  test.each(SOURCE_MUTANTS.map((mutant) => [mutant.name, mutant] as const))(
    '%s',
    async (_name, mutant) => {
      const verdict = judgeMutant(await loadMutantApi(mutant));
      expect(verdict?.detector).toBe(mutant.detector);
    },
    MUTANT_TIMEOUT_MILLISECONDS,
  );

  test('the mandatory mutants are all in the list', () => {
    const names = SOURCE_MUTANTS.map((mutant) => mutant.name);
    for (const mandatory of [
      'THRESHOLD_EXCLUSIVE',
      'WEIGHTS_SWAPPED',
      'SENTIMENT_STALE_ACCEPTED',
      'SENTIMENT_WRONG_SOURCE',
      'ADX_ROUNDED_UP',
      'HOLD_BEFORE_WARMUP_MISSING',
    ]) {
      expect(names).toContain(mandatory);
    }
  });
});

function expectViolation(run: () => void): SignalContractViolation {
  try {
    run();
  } catch (error) {
    if (error instanceof SignalContractViolation) return error;
    throw error;
  }
  throw new Error('O contrato deveria ter reprovado o mutante.');
}

describe('production signal step: lookahead mutants are rejected by the contract', () => {
  const [scenario] = buildSignalScenarios();
  if (scenario === undefined) throw new Error('Cenário ausente.');
  const LOOKAHEAD_MUTANTS = [
    ['VOTE_LOOKAHEAD', createVoteLookaheadApi(PRODUCTION_SIGNAL_API)],
    ['REGIME_ON_FUTURE_ADX', createRegimeOnFutureAdxApi(PRODUCTION_SIGNAL_API)],
  ] as const;

  test.each(LOOKAHEAD_MUTANTS)('%s is stamped in the past: timing rejects it', (_name, api) => {
    expect(judgeMutant(api)?.detector).toBe(TIMING);
  });

  test.each(LOOKAHEAD_MUTANTS)('%s: the no-lookahead check rejects it on its own', (_name, api) => {
    const violation = expectViolation(() =>
      runSignalCheck({ api, scenario, check: SIGNAL_CONTRACT_CHECK.NO_LOOKAHEAD }),
    );
    expect(violation.check).toBe(SIGNAL_CONTRACT_CHECK.NO_LOOKAHEAD);
    expect(violation.message).toContain('depois do índice');
  });
});
