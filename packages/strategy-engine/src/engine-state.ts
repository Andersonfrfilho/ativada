// Copyright (c) 2026 Ada Technology. All rights reserved.
import { canonicalJson } from './canonical-json.js';
import { ENGINE_STATE_VERSION } from './engine.constant.js';
import { ENGINE_STATE_SCHEMA } from './engine-state.schema.js';
import type { EngineState, SignalState, WalletState } from './engine-state.types.js';
import { toConfigIssues } from './parse-strategy-config.js';
import type { RunSetup, StrategyVersion } from './strategy-config.types.js';
import { ENGINE_STATE_ERROR_CODE, EngineStateError } from './strategy-engine.error.js';

export type CreateInitialEngineStateParams = {
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  readonly engineVersion: string;
  readonly leadInCandles: number;
};

export type CreateInitialWalletStateParams = {
  readonly run: RunSetup;
  readonly keyPrefix?: string;
};

export function createInitialSignalState(leadInCandles: number): SignalState {
  return { leadInCandles, processedCandles: 0, lastCandleOpenTime: null, indicators: {} };
}

// Carteira nova sobre um sinal já aquecido (walk-forward por janela, meta): `keyPrefix` evita colisão.
export function createInitialWalletState(params: CreateInitialWalletStateParams): WalletState {
  return {
    keyPrefix: params.keyPrefix ?? '',
    lastCandleOpenTime: null,
    firstSignalCandleOpenTime: null,
    sequence: 0,
    isHalted: false,
    cash: params.run.parameters.initialBalance,
    position: null,
    pendingOrder: null,
    benchmark: null,
  };
}

export function createInitialEngineState(params: CreateInitialEngineStateParams): EngineState {
  return validateEngineState({
    version: ENGINE_STATE_VERSION,
    engineVersion: params.engineVersion,
    configHash: params.strategy.configHash,
    runHash: params.run.runHash,
    signal: createInitialSignalState(params.leadInCandles),
    wallet: createInitialWalletState({ run: params.run }),
  });
}

export function validateEngineState(candidate: unknown): EngineState {
  const result = ENGINE_STATE_SCHEMA.safeParse(candidate);
  if (!result.success) {
    throw new EngineStateError({
      code: ENGINE_STATE_ERROR_CODE.INVALID_STATE,
      message: 'Estado do motor inválido.',
      issues: toConfigIssues(result.error.issues),
    });
  }
  return result.data;
}

// Valida antes de escrever: estado que não volta igual do JSON nunca chega ao banco.
export function serializeEngineState(state: EngineState): string {
  return canonicalJson(validateEngineState(state));
}

function readVersion(candidate: unknown): unknown {
  if (typeof candidate !== 'object' || candidate === null) return undefined;
  return Object.getOwnPropertyDescriptor(candidate, 'version')?.value;
}

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new EngineStateError({
      code: ENGINE_STATE_ERROR_CODE.INVALID_JSON,
      message: 'Estado do motor não é JSON válido.',
    });
  }
}

export function deserializeEngineState(text: string): EngineState {
  const candidate = parseJsonText(text);
  if (readVersion(candidate) !== ENGINE_STATE_VERSION) {
    throw new EngineStateError({
      code: ENGINE_STATE_ERROR_CODE.UNSUPPORTED_VERSION,
      message: `Versão de estado não suportada; esperada ${ENGINE_STATE_VERSION}. Replique desde o início.`,
    });
  }
  return validateEngineState(candidate);
}
