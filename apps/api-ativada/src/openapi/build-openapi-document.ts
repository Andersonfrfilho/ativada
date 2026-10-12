// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Route } from '../router/route.types.js';
import { buildOperation, toOpenApiPath, type SchemaRegistry } from './build-operation.js';
import type { JsonObject } from './json-schema.js';
import {
  API_DESCRIPTION,
  API_TITLE,
  API_VERSION,
  BEARER_SECURITY_SCHEME,
  ERROR_ENVELOPE_SCHEMA,
  OPENAPI_VERSION,
  PAGINATION_SCHEMA_KEY,
} from './openapi.constant.js';
import { UndocumentedRouteError } from './undocumented-route.error.js';

export type OpenApiDocument = JsonObject;

const SHARED_SCHEMAS: SchemaRegistry = {
  [ERROR_ENVELOPE_SCHEMA]: {
    type: 'array',
    items: {
      type: 'object',
      required: ['field', 'reason'],
      additionalProperties: false,
      properties: { field: { type: 'string' }, reason: { type: 'string' } },
    },
  },
  [PAGINATION_SCHEMA_KEY]: {
    type: 'object',
    required: ['nextCursor', 'perPage'],
    additionalProperties: false,
    properties: {
      nextCursor: { type: ['string', 'null'] },
      perPage: { type: 'integer', minimum: 1 },
    },
  },
};

function describeRoute(route: Route): string {
  return `${route.method} ${route.path}`;
}

// O documento OpenAPI 3.1 NASCE da tabela de rotas: cada rota declara o que diz sobre si. Rota sem documentação
// derruba a geração (lista as rotas), em vez de sair omitida em silêncio.
export function buildOpenApiDocument(routes: readonly Route[]): OpenApiDocument {
  const undocumented = routes.filter((route) => route.documentation === undefined);
  if (undocumented.length > 0) throw new UndocumentedRouteError(undocumented.map(describeRoute));
  const registry: SchemaRegistry = { ...SHARED_SCHEMAS };
  const paths: Record<string, Record<string, unknown>> = {};
  const tags = new Set<string>();
  for (const route of routes) {
    const { documentation } = route;
    if (documentation === undefined) continue;
    tags.add(documentation.tag);
    const path = toOpenApiPath(route.path);
    paths[path] = {
      ...paths[path],
      [route.method.toLowerCase()]: buildOperation(route, documentation, registry),
    };
  }
  return {
    openapi: OPENAPI_VERSION,
    info: { title: API_TITLE, version: API_VERSION, description: API_DESCRIPTION },
    tags: [...tags].map((name) => ({ name })),
    paths,
    components: {
      schemas: registry,
      securitySchemes: {
        [BEARER_SECURITY_SCHEME]: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  };
}
