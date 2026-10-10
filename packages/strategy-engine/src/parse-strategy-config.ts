// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createHash } from 'node:crypto';

import type { z } from '@cryptoada/environment';

import { canonicalJson } from './canonical-json.js';
import { STRATEGY_CONFIG_SCHEMA } from './strategy-config.schema.js';
import type { StrategyConfig, StrategyVersion } from './strategy-config.types.js';
import { StrategyConfigError, type StrategyConfigIssue } from './strategy-engine.error.js';

export function toConfigIssues(
  issues: readonly z.core.$ZodIssue[],
): readonly StrategyConfigIssue[] {
  return issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

export function parseStrategyConfig(input: unknown): StrategyConfig {
  const result = STRATEGY_CONFIG_SCHEMA.safeParse(input);
  if (!result.success) throw new StrategyConfigError(toConfigIssues(result.error.issues));
  return result.data;
}

// Reparseia antes de hashear: objeto montado à mão com "0.0010" e o mesmo valor em "0.001" dão o mesmo hash.
export function hashStrategyConfig(config: StrategyConfig): string {
  const canonicalText = canonicalJson(parseStrategyConfig(config));
  return createHash('sha256').update(canonicalText).digest('hex');
}

export function createStrategyVersion(input: unknown): StrategyVersion {
  const config = parseStrategyConfig(input);
  return { config, configHash: hashStrategyConfig(config) };
}
