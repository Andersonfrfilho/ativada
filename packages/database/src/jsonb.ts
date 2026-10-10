// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql, type SQL } from 'drizzle-orm';

import type { JsonContainer, JsonValue } from './json-value.types.js';

// Sem o cast o driver bun-sql grava jsonb como string JSON (ADR 0001 §n); `sql.param` impede o Drizzle de
// expandir a lista em vários parâmetros, e um texto já serializado seria codificado de novo pelo driver.
export function toJsonb(value: JsonContainer): SQL {
  return sql`${sql.param(value)}::jsonb`;
}

export function toNullableJsonb(value: JsonContainer | undefined): SQL | null {
  return value === undefined ? null : toJsonb(value);
}

export function readJsonb(value: unknown): JsonValue {
  return value as JsonValue;
}

export function readJsonContainer(value: unknown): JsonContainer {
  return value as JsonContainer;
}
