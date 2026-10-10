// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

export type JsonObject = { [key: string]: unknown };

export type SchemaConversion = {
  readonly schema: JsonObject;
  readonly definitions: Readonly<Record<string, unknown>>;
};

const JSON_SCHEMA_DIALECT_KEY = '$schema';
const DEFINITIONS_KEY = '$defs';
const LOCAL_DEFINITION_PREFIX = '#/$defs/';

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Aponta as referências locais (`#/$defs/x`) para `components.schemas`, com prefixo para não colidir entre rotas.
function rewriteReferences(value: unknown, prefix: string): unknown {
  if (Array.isArray(value)) return value.map((item) => rewriteReferences(item, prefix));
  if (!isJsonObject(value)) return value;
  const rewritten: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    rewritten[key] =
      key === '$ref' && typeof child === 'string' && child.startsWith(LOCAL_DEFINITION_PREFIX)
        ? `#/components/schemas/${prefix}${child.slice(LOCAL_DEFINITION_PREFIX.length)}`
        : rewriteReferences(child, prefix);
  }
  return rewritten;
}

function toJsonObject(value: unknown): JsonObject {
  if (!isJsonObject(value)) throw new TypeError('JSON Schema esperado como objeto.');
  return value;
}

// Esquema Zod -> JSON Schema 2020-12 (o dialeto do OpenAPI 3.1). `input` descreve o que a rota ACEITA (antes das
// transformações), `output` o que ela DEVOLVE.
export function convertSchema(
  schema: z.ZodType,
  io: 'input' | 'output',
  prefix: string,
): SchemaConversion {
  const converted = z.toJSONSchema(schema, { io, unrepresentable: 'any' });
  const body = Object.fromEntries(
    Object.entries(converted).filter(
      ([key]) => key !== JSON_SCHEMA_DIALECT_KEY && key !== DEFINITIONS_KEY,
    ),
  );
  const definitions = converted[DEFINITIONS_KEY];
  const definitionEntries = isJsonObject(definitions) ? Object.entries(definitions) : [];
  return {
    schema: toJsonObject(rewriteReferences(body, prefix)),
    definitions: Object.fromEntries(
      definitionEntries.map(([name, definition]) => [
        `${prefix}${name}`,
        rewriteReferences(definition, prefix),
      ]),
    ),
  };
}
