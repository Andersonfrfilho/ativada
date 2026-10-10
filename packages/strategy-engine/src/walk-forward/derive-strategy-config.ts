// Copyright (c) 2026 Ada Technology. All rights reserved.
import { toConfigIssues } from '../parse-strategy-config.js';
import { STRATEGY_CONFIG_SCHEMA } from '../strategy-config.schema.js';
import type { StrategyConfig } from '../strategy-config.types.js';
import type { StrategyConfigIssue } from '../strategy-engine.error.js';
import { parseTunablePath, type ParsedTunablePath } from './tunable-parameter.catalog.js';
import type { GridAssignment } from './walk-forward.types.js';

export type DerivedStrategyConfig =
  | { readonly isValid: true; readonly config: StrategyConfig }
  | { readonly isValid: false; readonly issues: readonly StrategyConfigIssue[] };

type JsonRecord = Record<string, unknown>;

export function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readField(record: unknown, field: string): unknown {
  if (!isJsonRecord(record)) return undefined;
  return Object.getOwnPropertyDescriptor(record, field)?.value;
}

function findRule(rules: unknown, ruleId: string): unknown {
  if (!Array.isArray(rules)) return undefined;
  return rules.find((rule: unknown) => readField(rule, 'id') === ruleId);
}

// O contêiner do campo ajustável na configuração: a seção (`risk`) ou a regra (`rules` com o id).
function locateContainer(draft: unknown, path: ParsedTunablePath): unknown {
  if (path.kind === 'static') return readField(draft, path.section);
  return findRule(readField(draft, 'rules'), path.ruleId);
}

// O valor atual do caminho na configuração (ou `undefined` quando o campo não existe nela: regime sem ADX,
// entrada a mercado, regra de outro tipo).
export function readTunableValue(config: StrategyConfig, path: string): unknown {
  const parsed = parseTunablePath(path);
  if (parsed === undefined) return undefined;
  return readField(locateContainer(config, parsed), parsed.field);
}

function assignValue(draft: unknown, assignment: GridAssignment): void {
  const parsed = parseTunablePath(assignment.path);
  if (parsed === undefined) return;
  const container = locateContainer(draft, parsed);
  if (isJsonRecord(container)) container[parsed.field] = assignment.value;
}

// Aplica uma atribuição à configuração-base e devolve uma configuração que passa o ESQUEMA INTEIRO da
// estratégia (período rápido < lento, intervalos, regras entre campos). Combinação que o esquema recusa é
// descartada pelo chamador e contada à parte. Pura: a base nunca é alterada.
export function deriveStrategyConfig(
  base: StrategyConfig,
  assignment: readonly GridAssignment[],
): DerivedStrategyConfig {
  const draft: unknown = structuredClone(base);
  for (const item of assignment) assignValue(draft, item);
  const parsed = STRATEGY_CONFIG_SCHEMA.safeParse(draft);
  if (!parsed.success) return { isValid: false, issues: toConfigIssues(parsed.error.issues) };
  return { isValid: true, config: parsed.data };
}
