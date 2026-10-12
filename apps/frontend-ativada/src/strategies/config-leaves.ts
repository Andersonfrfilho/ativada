// Copyright (c) 2026 Ada Technology. All rights reserved.
import { labelForKey, RULE_FIELDS, STATIC_TUNABLE_KEYS } from './leaf-labels.js';

export type LeafKind = 'number' | 'text';

export type Leaf = {
  readonly key: string;
  readonly label: string;
  readonly kind: LeafKind;
  readonly value: string;
  readonly path: readonly (string | number)[];
};

export type LeafGroup = { readonly title: string; readonly leaves: readonly Leaf[] };

export type LeafProblem = { readonly key: string; readonly message: string };

const READ_ONLY_KEYS: readonly string[] = ['schemaVersion', 'id', 'kind', 'orderType'];
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
const INTEGER_PATTERN = /^-?\d+$/;
const GROUP_TITLES: readonly (readonly [string, string])[] = [
  ['rules', 'Regras'],
  ['regime', 'Regime'],
  ['thresholds', 'Limiares'],
  ['entry', 'Entrada'],
  ['risk', 'Risco'],
];

type Walk = { readonly path: (string | number)[]; readonly keyParts: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toLeaf(walk: Walk, value: string | number): Leaf {
  const key = walk.keyParts.join('.');
  return {
    key,
    label: labelForKey(key),
    kind: typeof value === 'number' ? 'number' : 'text',
    value: String(value),
    path: walk.path,
  };
}

function collect(value: unknown, walk: Walk, leaves: Leaf[]): void {
  if (typeof value === 'number' || typeof value === 'string') {
    leaves.push(toLeaf(walk, value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      // Cada regra é identificada pelo id (`rules.ema-9-21.fastPeriod`), o mesmo caminho do walk-forward.
      const ruleId = isRecord(item) && typeof item['id'] === 'string' ? item['id'] : String(index);
      collect(item, { path: [...walk.path, index], keyParts: [...walk.keyParts, ruleId] }, leaves);
    });
    return;
  }
  if (!isRecord(value)) return;
  for (const [name, child] of Object.entries(value)) {
    if (READ_ONLY_KEYS.includes(name)) continue;
    collect(child, { path: [...walk.path, name], keyParts: [...walk.keyParts, name] }, leaves);
  }
}

// Os números e decimais editáveis da configuração; identificadores, tipos e a versão do esquema ficam de fora.
export function listLeaves(config: unknown): Leaf[] {
  const leaves: Leaf[] = [];
  collect(config, { path: [], keyParts: [] }, leaves);
  return leaves;
}

export function groupLeaves(leaves: readonly Leaf[]): LeafGroup[] {
  return GROUP_TITLES.map(([prefix, title]) => ({
    title,
    leaves: leaves.filter((leaf) => leaf.key.split('.')[0] === prefix),
  })).filter((group) => group.leaves.length > 0);
}

export function tunableLeaves(leaves: readonly Leaf[]): Leaf[] {
  return leaves.filter((leaf) => {
    if (STATIC_TUNABLE_KEYS.includes(leaf.key)) return true;
    const [section, , field] = leaf.key.split('.');
    return section === 'rules' && field !== undefined && RULE_FIELDS.includes(field);
  });
}

function parseEdit(leaf: Leaf, text: string): { ok: true; value: string | number } | { ok: false } {
  const pattern = leaf.kind === 'number' ? INTEGER_PATTERN : DECIMAL_PATTERN;
  if (!pattern.test(text.trim())) return { ok: false };
  return { ok: true, value: leaf.kind === 'number' ? Number(text.trim()) : text.trim() };
}

function childOf(node: unknown, step: string | number): unknown {
  if (Array.isArray(node) && typeof step === 'number') return node[step];
  return isRecord(node) ? node[String(step)] : undefined;
}

function assign(root: unknown, path: readonly (string | number)[], value: string | number): void {
  const parent = path.slice(0, -1).reduce<unknown>(childOf, root);
  const last = path.at(-1);
  if (Array.isArray(parent) && typeof last === 'number') parent[last] = value;
  else if (isRecord(parent) && last !== undefined) parent[String(last)] = value;
}

// Copia a configuração e troca só os valores editados, mantendo o tipo de cada um (número continua número).
export function applyLeafEdits(
  config: unknown,
  edits: Readonly<Record<string, string>>,
): { config: unknown; problems: LeafProblem[] } {
  const copy: unknown = structuredClone(config);
  const problems: LeafProblem[] = [];
  const byKey = new Map(listLeaves(config).map((leaf) => [leaf.key, leaf]));
  for (const [key, text] of Object.entries(edits)) {
    const leaf = byKey.get(key);
    if (leaf === undefined) continue;
    const parsed = parseEdit(leaf, text);
    if (parsed.ok) assign(copy, leaf.path, parsed.value);
    else {
      problems.push({
        key,
        message:
          leaf.kind === 'number' ? 'use um número inteiro.' : 'use um número decimal (ex.: 1.5).',
      });
    }
  }
  return { config: copy, problems };
}
