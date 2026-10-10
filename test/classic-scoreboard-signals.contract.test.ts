// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  EngineDecimal,
  RULE_FAMILY,
  SIGNAL_ACTION,
  SIGNAL_ENGINE_VERSION,
  type SignalDecision,
} from '../packages/strategy-engine/src/index.js';
import {
  CLASSIC_STRATEGY,
  REAL_DATASETS,
  runClassicSignals,
  summarizeSignals,
  type RealDataset,
  type SignalSummary,
} from './fixtures/strategy-engine/signal/classic-signals.fixture.js';
import { PRODUCTION_SIGNAL_API } from './fixtures/strategy-engine/signal/signal-api.fixture.js';

const API = PRODUCTION_SIGNAL_API;
const LEAD_IN_CANDLES = 194;
const GOLDEN_PATH = `${new URL('./fixtures/strategy-engine/golden/', import.meta.url).pathname}classic-scoreboard-signals.${SIGNAL_ENGINE_VERSION}.json`;
const TREND_THRESHOLD = 25;
const ONE_DECIMAL = 1;
const RULE_LABEL: Readonly<Record<string, string>> = {
  'ema-9-21': 'EMA 9×21',
  'macd-12-26-9': 'MACD 12/26/9',
  'rsi-14': 'RSI 14',
  'obv-ema-20': 'OBV×EMA 20',
};
const ACTION_LABEL = { BUY: 'Compra', SELL: 'Venda', HOLD: 'Neutro' } as const;

type Golden = {
  readonly engineVersion: string;
  readonly datasets: Readonly<Record<string, SignalSummary>>;
};

function decidedOf(signals: readonly (SignalDecision | null)[]): SignalDecision[] {
  return signals.filter((signal): signal is SignalDecision => signal !== null);
}

function signOf(left: number, right: number): -1 | 0 | 1 {
  if (left > right) return 1;
  if (left < right) return -1;
  return 0;
}

function indicator(signal: SignalDecision, id: string): number {
  const value = signal.indicators[id];
  if (value === undefined || value === null) throw new Error(`Indicador ${id} ausente.`);
  return value;
}

// Reconstrução independente do voto a partir dos valores de indicador gravados no próprio sinal.
function expectedVoteOf(signal: SignalDecision, ruleId: string): -1 | 0 | 1 {
  const at = (output: string): number => indicator(signal, `rule:${ruleId}.${output}`);
  if (ruleId === 'ema-9-21') return signOf(at('fast'), at('slow'));
  if (ruleId === 'macd-12-26-9') return signOf(at('macd'), at('signal'));
  if (ruleId === 'obv-ema-20') return signOf(at('obv'), at('ema'));
  const rsi = indicator(signal, `rule:${ruleId}`);
  if (rsi < 30) return 1;
  return rsi > 70 ? -1 : 0;
}

function expectedReason(signal: SignalDecision): string {
  const adx = new EngineDecimal(indicator(signal, 'regime:adx.adx').toPrecision(15))
    .toDecimalPlaces(ONE_DECIMAL, EngineDecimal.ROUND_DOWN)
    .toFixed(ONE_DECIMAL);
  const regime = signal.regime === 'trending' ? `tendência (ADX ${adx})` : `lateral (ADX ${adx})`;
  const names = (vote: number): string => {
    const labels = signal.votes
      .filter((candidate) => candidate.vote === vote)
      .map((candidate) => RULE_LABEL[candidate.ruleId]);
    return labels.length === 0 ? 'nenhuma' : labels.join(', ');
  };
  const score = new EngineDecimal(signal.score);
  const signed = score.greaterThan(0) ? `+${signal.score}` : signal.score;
  return [
    ACTION_LABEL[signal.action],
    `pontuação ${signed}`,
    regime,
    `compra: ${names(1)}`,
    `venda: ${names(-1)}`,
    `neutras: ${names(0)}`,
  ].join(' · ');
}

function assertSignalAgreesWithItsVotes(signal: SignalDecision): void {
  const weights =
    CLASSIC_STRATEGY.config.regime.kind === 'adx' ? CLASSIC_STRATEGY.config.regime.weights : null;
  if (weights === null) throw new Error('Regime ADX esperado.');
  const regimeWeights = signal.regime === 'trending' ? weights.trending : weights.ranging;
  expect(signal.regime).toBe(
    indicator(signal, 'regime:adx.adx') >= TREND_THRESHOLD ? 'trending' : 'ranging',
  );
  expect(signal.votes.map((vote) => vote.ruleId)).toStrictEqual(Object.keys(RULE_LABEL));
  let score = new EngineDecimal(0);
  for (const vote of signal.votes) {
    const family =
      RULE_FAMILY[
        CLASSIC_STRATEGY.config.rules.find((rule) => rule.id === vote.ruleId)?.kind ?? 'rsi'
      ];
    expect(vote.family).toBe(family);
    expect(vote.weight).toBe(regimeWeights[family]);
    expect(vote.vote).toBe(expectedVoteOf(signal, vote.ruleId));
    expect(vote.isMissing).toBe(false);
    score = score.plus(new EngineDecimal(vote.weight).times(vote.vote));
  }
  expect(signal.score).toBe(score.toFixed());
  const expectedAction = score.gte(2) ? 'BUY' : score.lte(-2) ? 'SELL' : 'HOLD';
  expect(signal.action).toBe(expectedAction);
  expect(signal.sentiment).toBeNull();
  expect(signal.reason).toBe(expectedReason(signal));
}

async function readGolden(): Promise<Golden> {
  const file = Bun.file(GOLDEN_PATH);
  if (!(await file.exists())) {
    throw new Error(`Grave o dourado da versão ${SIGNAL_ENGINE_VERSION} em ${GOLDEN_PATH}.`);
  }
  return (await file.json()) as Golden;
}

describe.each(REAL_DATASETS.map((dataset) => [dataset.name, dataset] as const))(
  'Placar clássico over real candles: %s',
  (_name, dataset: RealDataset) => {
    const signals = runClassicSignals(API, dataset);

    test('decides nothing during the 194-candle lead-in and one signal per candle after it', () => {
      expect(API.computeStrategyLeadInCandles(CLASSIC_STRATEGY.config)).toBe(LEAD_IN_CANDLES);
      expect(signals.slice(0, LEAD_IN_CANDLES - 1).every((signal) => signal === null)).toBe(true);
      expect(signals.slice(LEAD_IN_CANDLES - 1).every((signal) => signal !== null)).toBe(true);
      decidedOf(signals).forEach((signal, index) => {
        expect(signal.candleOpenTime).toBe(
          dataset.candles[LEAD_IN_CANDLES - 1 + index]?.openTime ?? -1,
        );
      });
    });

    test('every signal agrees with its votes: weights, score, action, regime and reason', () => {
      for (const signal of decidedOf(signals)) assertSignalAgreesWithItsVotes(signal);
    });

    test('is reproducible and matches the golden of this engine version', async () => {
      const again = runClassicSignals(API, dataset);
      expect(summarizeSignals(again)).toStrictEqual(summarizeSignals(signals));
      const golden = await readGolden();
      expect(golden.engineVersion).toBe(SIGNAL_ENGINE_VERSION);
      expect(summarizeSignals(signals)).toStrictEqual(golden.datasets[dataset.name]);
    });
  },
);

describe('the golden is pinned to the engine version', () => {
  test('the golden file is named by the version and covers every dataset', async () => {
    const golden = await readGolden();
    expect(Object.keys(golden.datasets).sort()).toStrictEqual(
      REAL_DATASETS.map((dataset) => dataset.name).sort(),
    );
    expect(GOLDEN_PATH).toContain(`.${SIGNAL_ENGINE_VERSION}.json`);
  });

  test('both real series produce at least one BUY and one SELL', async () => {
    const golden = await readGolden();
    for (const dataset of Object.values(golden.datasets)) {
      expect(dataset.buy).toBeGreaterThan(0);
      expect(dataset.sell).toBeGreaterThan(0);
      expect(dataset.buy + dataset.sell + dataset.hold).toBe(dataset.decided);
    }
  });
});
