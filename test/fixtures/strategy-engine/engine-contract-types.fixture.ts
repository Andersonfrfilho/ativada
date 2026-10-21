// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  CreateEngine,
  EngineCandle,
  EngineCommand,
  EntryRiskScale,
  RunSetup,
  SentimentObservation,
  StepResult,
  StrategyVersion,
} from '../../../packages/strategy-engine/src/index.js';

// Eventos que um cenário promete exercitar: cenário que não dispara o que promete reprova (pular não é passar).
export const ENGINE_EVENT_KIND = {
  MARKET_ENTRY_FILL: 'market-entry-fill',
  LIMIT_ENTRY_FILL_AT_OPEN: 'limit-entry-fill-at-open',
  LIMIT_ENTRY_FILL_AT_LIMIT_ON_LATER_OPEN: 'limit-entry-fill-at-limit-on-later-open',
  LIMIT_ENTRY_FILL_INTRA_CANDLE: 'limit-entry-fill-intra-candle',
  LIMIT_TOUCHED_WITHOUT_FILL: 'limit-touched-without-fill',
  LIMIT_EXPIRED: 'limit-expired',
  STOP_EXIT_WITH_TARGET_TOUCHED: 'stop-exit-with-target-touched',
  STOP_EXIT_WITHOUT_GAP: 'stop-exit-without-gap',
  STOP_EXIT_ON_GAP: 'stop-exit-on-gap',
  TARGET_EXIT: 'target-exit',
  TARGET_EXIT_ON_GAP: 'target-exit-on-gap',
  TARGET_TOUCHED_WITHOUT_EXIT: 'target-touched-without-exit',
  TARGET_PASSED_ON_INTRA_CANDLE_ENTRY: 'target-passed-on-intra-candle-entry',
  BUY_SIGNAL_WHILE_POSITION_OPEN: 'buy-signal-while-position-open',
  SELL_CANCELS_LIMIT: 'sell-cancels-limit',
  SELL_EXITS_AT_MARKET: 'sell-exits-at-market',
  HALT_BLOCKS_ENTRY: 'halt-blocks-entry',
  RESUME_AFTER_HALT: 'resume-after-halt',
  COMMAND_EXIT: 'command-exit',
  REJECTED_ZERO_ATR: 'rejected-zero-atr',
  REJECTED_BELOW_MIN_NOTIONAL: 'rejected-below-min-notional',
  REJECTED_INVALID_STOP: 'rejected-invalid-stop',
  VOLUME_CAPPED_FILL: 'volume-capped-fill',
  CASH_BOUND_ENTRY: 'cash-bound-entry',
  GAP_UP_ENTRY: 'gap-up-entry',
  SENTIMENT_USED: 'sentiment-used',
  SENTIMENT_STALE: 'sentiment-stale',
  GAP_CLOSES_POSITION: 'gap-closes-position',
  GAP_CANCELS_PENDING_ORDER: 'gap-cancels-pending-order',
  EXIT_COMMAND_BLOCKS_ENTRY: 'exit-command-blocks-entry',
  DUPLICATE_COMMAND_IGNORED: 'duplicate-command-ignored',
  SCALED_ENTRY: 'scaled-entry',
  ZERO_SCALE_BLOCKS_ENTRY: 'zero-scale-blocks-entry',
} as const;

export type EngineEventKind = (typeof ENGINE_EVENT_KIND)[keyof typeof ENGINE_EVENT_KIND];

export const ENGINE_CONTRACT_CHECK = {
  COMPLETES: 'completes',
  DETERMINISM: 'determinism',
  IMMUTABILITY: 'immutability',
  RESTEP_IDEMPOTENT: 'restep-idempotent',
  CASH_NON_NEGATIVE: 'cash-non-negative',
  SERIALIZATION: 'serialization',
  STEP_COMPOSITION: 'step-composition',
  TIMING: 'timing',
  NO_LOOKAHEAD: 'no-lookahead',
  RESUME: 'resume',
  BATCHES: 'batches',
  INPUT_GUARDS: 'input-guards',
  SINGLE_POSITION: 'single-position',
  PROTECTIVE_PRICES: 'protective-prices',
  REALIZED_RISK: 'realized-risk',
  FEES_AND_SLIPPAGE: 'fees-and-slippage',
  STOP_BEFORE_TARGET: 'stop-before-target',
  GAP_BEYOND_STOP: 'gap-beyond-stop',
  LIMIT_ORDERS: 'limit-orders',
  SIGNAL_POLICY: 'signal-policy',
  GAP_POLICY: 'gap-policy',
  REQUIRED_EVENTS: 'required-events',
} as const;

export type EngineContractCheck =
  (typeof ENGINE_CONTRACT_CHECK)[keyof typeof ENGINE_CONTRACT_CHECK];

// Comandos por `openTime` do candle em cujo fechamento agem (sobrevive ao fatiamento da série).
export type ScenarioCommands = Readonly<Record<number, readonly EngineCommand[]>>;

// Teto da entrada por `openTime` do candle (ADR 0002 A21); candle fora do mapa vai sem escala.
export type ScenarioEntryRiskScales = Readonly<Record<number, EntryRiskScale>>;

export type EngineScenario = {
  readonly name: string;
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  readonly candles: readonly EngineCandle[];
  readonly sentiment: readonly SentimentObservation[];
  readonly commands: ScenarioCommands;
  readonly entryRiskScales?: ScenarioEntryRiskScales;
  readonly requiredEvents: readonly EngineEventKind[];
};

export type RecordedStep = {
  readonly candle: EngineCandle;
  readonly sentiment: SentimentObservation | undefined;
  readonly commands: readonly EngineCommand[];
  readonly entryRiskScale?: EntryRiskScale | undefined;
  // Lacuna confirmada que o chamador declarou antes deste candle (0 quando contíguo).
  readonly confirmedGapCandles: number;
  readonly result: StepResult;
};

export type EngineRun = readonly RecordedStep[];

export type CheckContext = {
  readonly createEngine: CreateEngine;
  readonly scenario: EngineScenario;
  readonly baseline: EngineRun;
};

export type ContractCheck = (context: CheckContext) => void;

export class EngineContractViolation extends Error {
  readonly check: EngineContractCheck;
  readonly scenarioName: string;

  constructor(params: {
    readonly check: EngineContractCheck;
    readonly scenarioName: string;
    readonly detail: string;
  }) {
    super(`[${params.scenarioName}] ${params.check}: ${params.detail}`);
    this.name = 'EngineContractViolation';
    this.check = params.check;
    this.scenarioName = params.scenarioName;
  }
}

export function assertContract(condition: boolean, detail: string): void {
  if (!condition) throw new Error(detail);
}
