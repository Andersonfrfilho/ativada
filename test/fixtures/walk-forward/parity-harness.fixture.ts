// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleSeries } from '../../../apps/api-cryptoada/src/walk-forward/candle-series.js';
import type { SignalSeries } from '../../../apps/api-cryptoada/src/walk-forward/signal-series.js';
import type { WalletSpan } from '../../../apps/api-cryptoada/src/walk-forward/window-spans.js';
import {
  COMMAND_KIND,
  COMMAND_REASON,
  computeStrategyLeadInCandles,
  createEngine,
  createRunSetup,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  type Engine,
  type EngineCandle,
  type RunSetup,
  type SignalDecision,
  type StepDecisions,
  type StrategyVersion,
  type WalletDecisions,
} from '../../../packages/strategy-engine/src/index.js';

import { loadWalkForwardApp } from './walk-forward-app.fixture.js';

const app = await loadWalkForwardApp();
const { countGapsBefore } = app.series;
const { runWindowWallet } = app.wallet;
const { computeSignalSeries } = app.signals;

export type ParityCase = {
  readonly candles: readonly EngineCandle[];
  readonly strategy: StrategyVersion;
  readonly setup: RunSetup;
};

export function buildSeries(candles: readonly EngineCandle[], setup: RunSetup): CandleSeries {
  const duration = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[setup.parameters.timeframe];
  return {
    candles,
    gaps: countGapsBefore(candles, duration),
    sentiments: candles.map(() => undefined),
    durationMilliseconds: duration,
  };
}

export type WalletRecord = {
  readonly decisions: WalletDecisions;
  readonly signal: SignalDecision | null;
};

// O pipeline do walk-forward: sinal calculado uma vez e a carteira avulsa sobre ele, de `anchorIndex` até `limit`.
export function runPipeline(params: {
  readonly parityCase: ParityCase;
  readonly span: WalletSpan;
  readonly keyPrefix: string;
  readonly signals: SignalSeries;
}): WalletRecord[] {
  const { parityCase, span } = params;
  const records: WalletRecord[] = [];
  runWindowWallet({
    engine: createEngine(),
    series: buildSeries(parityCase.candles, parityCase.setup),
    signals: params.signals,
    strategy: parityCase.strategy,
    setup: parityCase.setup,
    span,
    keyPrefix: params.keyPrefix,
    isParked: false,
    collect: (decisions, signal) => records.push({ decisions, signal }),
  });
  return records;
}

export function computeWindowStartSignals(parityCase: ParityCase, span: WalletSpan): SignalSeries {
  return computeSignalSeries({
    engine: createEngine(),
    series: buildSeries(parityCase.candles, parityCase.setup),
    strategy: parityCase.strategy,
    setup: parityCase.setup,
    firstAnchorIndex: span.anchorIndex,
    limitIndex: span.limitIndex,
  });
}

function toWalletDecisions(decisions: StepDecisions): WalletDecisions {
  return {
    commands: decisions.commands,
    orders: decisions.orders,
    fills: decisions.fills,
    openedPositions: decisions.openedPositions,
    closedPositions: decisions.closedPositions,
    equityPoint: decisions.equityPoint,
  };
}

// A REFERÊNCIA: o motor COMPLETO (`step`) sobre os candles da janela, do começo do aquecimento ao fim, com a
// mesma ordem de fim de janela no último candle e o mesmo prefixo de chaves.
export function runFullEngine(params: {
  readonly parityCase: ParityCase;
  readonly span: WalletSpan;
  readonly keyPrefix: string;
  readonly engine?: Engine;
}): WalletRecord[] {
  const { parityCase, span } = params;
  const engine = params.engine ?? createEngine();
  const { candles, strategy, setup } = parityCase;
  const leadIn = computeStrategyLeadInCandles(strategy.config);
  const first = span.anchorIndex - (leadIn - 1);
  const initial = engine.createInitialState({ strategy, run: setup });
  let state = { ...initial, wallet: { ...initial.wallet, keyPrefix: params.keyPrefix } };
  const records: WalletRecord[] = [];
  for (let index = first; index < span.limitIndex; index += 1) {
    const candle = candles[index];
    if (candle === undefined) break;
    const gap =
      index > first ? (candles[index]?.openTime ?? 0) - (candles[index - 1]?.openTime ?? 0) : 0;
    const missing = gap / ENGINE_TIMEFRAME_DURATION_MILLISECONDS[setup.parameters.timeframe] - 1;
    const isLast = index === span.limitIndex - 1;
    const result = engine.step({
      strategy,
      run: setup,
      state,
      candle,
      confirmedGapCandles: index > first && missing > 0 ? missing : undefined,
      commands: isLast
        ? [
            {
              commandId: `${params.keyPrefix}window-end`,
              issuedAt: candle.closeTime,
              kind: COMMAND_KIND.HALT,
              reason: COMMAND_REASON.WINDOW_END,
            },
          ]
        : [],
    });
    state = result.state;
    if (index >= span.anchorIndex) {
      records.push({
        decisions: toWalletDecisions(result.decisions),
        signal: result.decisions.signal,
      });
    }
  }
  return records;
}

export function buildParityCase(params: {
  readonly candles: readonly EngineCandle[];
  readonly strategy: StrategyVersion;
  readonly parameters: unknown;
}): ParityCase {
  return {
    candles: params.candles,
    strategy: params.strategy,
    setup: createRunSetup(params.parameters),
  };
}
