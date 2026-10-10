// Copyright (c) 2026 Ada Technology. All rights reserved.
import { canonicalJson } from './canonical-json.js';
import { ENGINE_STATE_VERSION } from './engine.constant.js';
import { ENGINE_STATE_SCHEMA } from './engine-state.schema.js';
import type { EngineState } from './engine-state.types.js';
import { toConfigIssues } from './parse-strategy-config.js';
import type { StrategyVersion } from './strategy-config.types.js';
import { ENGINE_STATE_ERROR_CODE, EngineStateError } from './strategy-engine.error.js';

export type CreateInitialEngineStateParams = {
  readonly strategy: StrategyVersion;
  readonly engineVersion: string;
  readonly leadInCandles: number;
};

export function createInitialEngineState(params: CreateInitialEngineStateParams): EngineState {
  return validateEngineState({
    version: ENGINE_STATE_VERSION,
    engineVersion: params.engineVersion,
    configHash: params.strategy.configHash,
    leadInCandles: params.leadInCandles,
    processedCandles: 0,
    lastCandleOpenTime: null,
    sequence: 0,
    isHalted: false,
    cash: params.strategy.config.execution.initialBalance,
    position: null,
    pendingOrder: null,
    benchmark: null,
    indicators: {},
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
