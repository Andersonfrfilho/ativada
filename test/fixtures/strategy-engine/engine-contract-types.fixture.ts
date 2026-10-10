// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  CreateEngine,
  EngineCandle,
  StepResult,
  StrategyVersion,
} from '../../../packages/strategy-engine/src/index.js';

// Eventos que um cenário promete exercitar: cenário que não dispara o que promete reprova (pular não é passar).
export const ENGINE_EVENT_KIND = {
  MARKET_ENTRY_FILL: 'market-entry-fill',
  LIMIT_ENTRY_FILL_AT_OPEN: 'limit-entry-fill-at-open',
  LIMIT_ENTRY_FILL_INTRA_CANDLE: 'limit-entry-fill-intra-candle',
  LIMIT_EXPIRED: 'limit-expired',
  STOP_EXIT_WITH_TARGET_TOUCHED: 'stop-exit-with-target-touched',
  STOP_EXIT_ON_GAP: 'stop-exit-on-gap',
  TARGET_EXIT: 'target-exit',
  BUY_SIGNAL_WHILE_POSITION_OPEN: 'buy-signal-while-position-open',
} as const;

export type EngineEventKind = (typeof ENGINE_EVENT_KIND)[keyof typeof ENGINE_EVENT_KIND];

export const ENGINE_CONTRACT_CHECK = {
  COMPLETES: 'completes',
  IMMUTABILITY: 'immutability',
  SERIALIZATION: 'serialization',
  DETERMINISM: 'determinism',
  TIMING: 'timing',
  NO_LOOKAHEAD: 'no-lookahead',
  RESUME: 'resume',
  BATCHES: 'batches',
  SINGLE_POSITION: 'single-position',
  FEES_AND_SLIPPAGE: 'fees-and-slippage',
  STOP_BEFORE_TARGET: 'stop-before-target',
  GAP_BEYOND_STOP: 'gap-beyond-stop',
  LIMIT_ORDERS: 'limit-orders',
  REQUIRED_EVENTS: 'required-events',
} as const;

export type EngineContractCheck =
  (typeof ENGINE_CONTRACT_CHECK)[keyof typeof ENGINE_CONTRACT_CHECK];

export type EngineScenario = {
  readonly name: string;
  readonly strategy: StrategyVersion;
  readonly candles: readonly EngineCandle[];
  readonly requiredEvents: readonly EngineEventKind[];
};

export type RecordedStep = {
  readonly candle: EngineCandle;
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
