// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer, JsonValue } from '@cryptoada/database';

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== 'object') return false;
  return Object.values(value).every(isJsonValue);
}

export function isJsonContainer(value: unknown): value is JsonContainer {
  return typeof value === 'object' && value !== null && isJsonValue(value);
}

// O JSON canônico do estado do motor, no formato que o repositório aceita para `jsonb`.
export function parseJsonContainer(text: string): JsonContainer {
  const parsed: unknown = JSON.parse(text);
  if (!isJsonContainer(parsed)) throw new TypeError('Esperado objeto ou lista JSON.');
  return parsed;
}
