// Copyright (c) 2026 Ada Technology. All rights reserved.
import { refuse } from './assert-candle.js';
import { hashRunParameters, hashStrategyConfig } from './parse-strategy-config.js';
import type { RunSetup, StrategyVersion } from './strategy-config.types.js';
import {
  ENGINE_INPUT_ERROR_CODE,
  RunParametersError,
  StrategyConfigError,
} from './strategy-engine.error.js';

// Cada objeto é conferido uma vez (um SHA-256 por execução, não por passo). Objeto mutado depois de conferido
// escapa: quem chama passa estratégia e parâmetros congelados, como o harness exige.
const VERIFIED_STRATEGIES = new WeakMap<object, true>();
const VERIFIED_RUNS = new WeakMap<object, true>();

function recomputeStrategyHash(strategy: StrategyVersion): string | undefined {
  try {
    return hashStrategyConfig(strategy.config);
  } catch (error) {
    if (error instanceof StrategyConfigError) return undefined;
    throw error;
  }
}

function recomputeRunHash(run: RunSetup): string | undefined {
  try {
    return hashRunParameters(run.parameters);
  } catch (error) {
    if (error instanceof RunParametersError) return undefined;
    throw error;
  }
}

// O `configHash` é o SHA-256 do JSON canônico da configuração: o motor o recalcula e recusa o rótulo que
// não bate com o conteúdo.
export function assertStrategyHash(strategy: StrategyVersion): void {
  if (VERIFIED_STRATEGIES.has(strategy)) return;
  if (recomputeStrategyHash(strategy) !== strategy.configHash) {
    refuse(
      ENGINE_INPUT_ERROR_CODE.CONFIG_HASH_MISMATCH,
      'O configHash não corresponde à configuração da estratégia.',
    );
  }
  VERIFIED_STRATEGIES.set(strategy, true);
}

export function assertRunHash(run: RunSetup): void {
  if (VERIFIED_RUNS.has(run)) return;
  if (recomputeRunHash(run) !== run.runHash) {
    refuse(
      ENGINE_INPUT_ERROR_CODE.RUN_HASH_MISMATCH,
      'O runHash não corresponde aos parâmetros da execução.',
    );
  }
  VERIFIED_RUNS.set(run, true);
}
