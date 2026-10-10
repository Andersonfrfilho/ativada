// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { z } from '@cryptoada/environment';

import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { convertSchema, type JsonObject } from './json-schema.js';
import {
  ADMIN_ERRORS,
  AUTHENTICATED_ERRORS,
  BEARER_SECURITY_SCHEME,
  COMMON_ERRORS,
  ERROR_ENVELOPE_SCHEMA,
  JSON_CONTENT_TYPE,
  PAGINATION_SCHEMA_KEY,
} from './openapi.constant.js';
import type {
  DocumentedError,
  DocumentedSuccess,
  RouteDocumentation,
} from './route-documentation.types.js';

export type SchemaRegistry = Record<string, unknown>;

type ParameterLocation = 'path' | 'query';
type SchemaScope = { readonly prefix: string; readonly registry: SchemaRegistry };

const NON_IDENTIFIER_PATTERN = /[^A-Za-z0-9]+/g;
const PATH_PARAMETER_PATTERN = /:([A-Za-z0-9_]+)/g;

export function toOpenApiPath(path: string): string {
  return path.replace(PATH_PARAMETER_PATTERN, '{$1}');
}

export function toOperationId(route: Route): string {
  return `${route.method.toLowerCase()}_${route.path.replace(NON_IDENTIFIER_PATTERN, '_').replace(/^_|_$/g, '')}`;
}

function readStringList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function convertInto(schema: z.ZodType, io: 'input' | 'output', scope: SchemaScope): JsonObject {
  const converted = convertSchema(schema, io, scope.prefix);
  Object.assign(scope.registry, converted.definitions);
  return converted.schema;
}

function buildParameters(
  schema: z.ZodType,
  location: ParameterLocation,
  scope: SchemaScope,
): readonly JsonObject[] {
  const converted = convertInto(schema, 'input', scope);
  const required = readStringList(converted['required']);
  const properties = converted['properties'];
  if (typeof properties !== 'object' || properties === null) return [];
  const entries: [string, unknown][] = Object.entries(properties);
  return entries.map(([name, property]) => ({
    name,
    in: location,
    required: location === 'path' || required.includes(name),
    schema: property,
  }));
}

function buildSuccess(success: DocumentedSuccess, scope: SchemaScope): JsonObject {
  if (success.schema === undefined && success.contentType === undefined) {
    return { description: success.description };
  }
  const data = success.schema === undefined ? {} : convertInto(success.schema, 'output', scope);
  if (success.contentType !== undefined) {
    return {
      description: success.description,
      content: { [success.contentType]: { schema: data } },
    };
  }
  const properties: JsonObject = { data };
  const required = ['data'];
  if (success.isList === true) {
    properties['pagination'] = { $ref: `#/components/schemas/${PAGINATION_SCHEMA_KEY}` };
    required.push('pagination');
  }
  return {
    description: success.description,
    content: {
      [JSON_CONTENT_TYPE]: {
        schema: { type: 'object', required, properties, additionalProperties: false },
      },
    },
  };
}

function buildErrorResponse(codes: readonly string[]): JsonObject {
  return {
    description: `Erro. Códigos: ${codes.join(', ')}.`,
    content: {
      [JSON_CONTENT_TYPE]: {
        schema: {
          type: 'object',
          required: ['error'],
          additionalProperties: false,
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              additionalProperties: false,
              properties: {
                code: { type: 'string', enum: [...codes] },
                message: { type: 'string' },
                details: { $ref: `#/components/schemas/${ERROR_ENVELOPE_SCHEMA}` },
              },
            },
          },
        },
      },
    },
  };
}

// Os erros próprios da rota somam-se aos comuns do `access`; os códigos de um mesmo status ficam na mesma resposta.
export function collectErrors(
  route: Route,
  documentation: RouteDocumentation,
): Map<number, string[]> {
  const access = route.access === ROUTE_ACCESS.PUBLIC ? [] : AUTHENTICATED_ERRORS;
  const admin = route.access === ROUTE_ACCESS.ADMIN ? ADMIN_ERRORS : [];
  const byStatus = new Map<number, string[]>();
  const all: readonly DocumentedError[] = [
    ...documentation.errors,
    ...access,
    ...admin,
    ...COMMON_ERRORS,
  ];
  for (const { status, code } of all) {
    const codes = byStatus.get(status) ?? [];
    if (!codes.includes(code)) codes.push(code);
    byStatus.set(status, codes);
  }
  return byStatus;
}

function buildResponses(
  route: Route,
  documentation: RouteDocumentation,
  scope: SchemaScope,
): JsonObject {
  const responses: JsonObject = {};
  for (const success of documentation.successes) {
    responses[String(success.status)] = buildSuccess(success, scope);
  }
  for (const [status, codes] of collectErrors(route, documentation)) {
    responses[String(status)] = buildErrorResponse(codes);
  }
  return responses;
}

export function buildOperation(
  route: Route,
  documentation: RouteDocumentation,
  registry: SchemaRegistry,
): JsonObject {
  const operationId = toOperationId(route);
  const scope: SchemaScope = { prefix: `${operationId}_`, registry };
  const parameters = [
    ...(documentation.params === undefined
      ? []
      : buildParameters(documentation.params, 'path', scope)),
    ...(documentation.query === undefined
      ? []
      : buildParameters(documentation.query, 'query', scope)),
  ];
  return {
    operationId,
    summary: documentation.summary,
    tags: [documentation.tag],
    ...(route.access === ROUTE_ACCESS.PUBLIC
      ? {}
      : { security: [{ [BEARER_SECURITY_SCHEME]: [] }] }),
    ...(parameters.length === 0 ? {} : { parameters }),
    ...(documentation.body === undefined
      ? {}
      : {
          requestBody: {
            required: true,
            content: {
              [JSON_CONTENT_TYPE]: { schema: convertInto(documentation.body, 'input', scope) },
            },
          },
        }),
    responses: buildResponses(route, documentation, scope),
  };
}
