// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createHash } from 'node:crypto';

import type { z } from 'zod';

import { canonicalJson } from './canonical-json.js';
import { RUN_PARAMETERS_SCHEMA } from './run-parameters.schema.js';
import { STRATEGY_CONFIG_SCHEMA } from './strategy-config.schema.js';
import type {
  RunParameters,
  RunSetup,
  StrategyConfig,
  StrategyVersion,
} from './strategy-config.types.js';
import {
  RunParametersError,
  StrategyConfigError,
  type StrategyConfigIssue,
} from './strategy-engine.error.js';

export function toConfigIssues(
  issues: readonly z.core.$ZodIssue[],
): readonly StrategyConfigIssue[] {
  return issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

function hashCanonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function parseStrategyConfig(input: unknown): StrategyConfig {
  const result = STRATEGY_CONFIG_SCHEMA.safeParse(input);
  if (!result.success) throw new StrategyConfigError(toConfigIssues(result.error.issues));
  return result.data;
}

// O hash reparseia: defaults preenchidos e decimais canônicos antes de serializar.
export function hashStrategyConfig(config: StrategyConfig): string {
  return hashCanonical(parseStrategyConfig(config));
}

export function createStrategyVersion(input: unknown): StrategyVersion {
  const config = parseStrategyConfig(input);
  return { config, configHash: hashStrategyConfig(config) };
}

export function parseRunParameters(input: unknown): RunParameters {
  const result = RUN_PARAMETERS_SCHEMA.safeParse(input);
  if (!result.success) throw new RunParametersError(toConfigIssues(result.error.issues));
  return result.data;
}

export function hashRunParameters(parameters: RunParameters): string {
  return hashCanonical(parseRunParameters(parameters));
}

export function createRunSetup(input: unknown): RunSetup {
  const parameters = parseRunParameters(input);
  return { parameters, runHash: hashRunParameters(parameters) };
}
