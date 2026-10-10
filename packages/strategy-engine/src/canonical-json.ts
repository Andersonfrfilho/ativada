// Copyright (c) 2026 Ada Technology. All rights reserved.
import { StrategyEngineError } from './strategy-engine.error.js';

function isPlainObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new StrategyEngineError('JSON canônico não aceita número não finito.');
  }
  return JSON.stringify(value);
}

function serializeObject(value: object): string {
  if (!isPlainObject(value)) {
    throw new StrategyEngineError(
      'JSON canônico aceita só objeto simples (sem classe, Map ou Set).',
    );
  }
  const entries = Object.entries(value).sort(([left], [right]) => (left < right ? -1 : 1));
  const members = entries.map(
    ([key, member]: [string, unknown]) => `${JSON.stringify(key)}:${canonicalJson(member)}`,
  );
  return `{${members.join(',')}}`;
}

// Chaves em ordem de código, sem espaço: a mesma entrada dá os mesmos bytes em qualquer processo.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') return serializeNumber(value);
  if (Array.isArray(value)) {
    return `[${value.map((member: unknown) => canonicalJson(member)).join(',')}]`;
  }
  if (typeof value === 'object') return serializeObject(value);
  throw new StrategyEngineError(`JSON canônico não aceita valor do tipo ${typeof value}.`);
}
