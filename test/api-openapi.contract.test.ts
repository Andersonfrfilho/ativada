// Copyright (c) 2026 Ada Technology. All rights reserved.
import { beforeAll, describe, expect, test } from 'bun:test';

import type { Route } from '../apps/api-ativada/src/router/route.types.js';
import { loadApiApp, type ApiApp } from './fixtures/api-routes/api-app.fixture.js';
import { buildApiRouteDependencies } from './fixtures/api-route-dependencies.fixture.js';

const app: ApiApp = await loadApiApp();

type Json = Record<string, unknown>;

function buildTable(isDocumentationEnabled: boolean): readonly Route[] {
  return app.apiRoutes.createApiRoutes(
    buildApiRouteDependencies(() => Promise.resolve(true), isDocumentationEnabled),
  );
}

// Montadas em `beforeAll`: uma tabela que nem consegue ser montada (rota sem `access`) reprova os testes, não o carregamento.
let DEVELOPMENT_ROUTES: readonly Route[] = [];
let PRODUCTION_ROUTES: readonly Route[] = [];

beforeAll(() => {
  DEVELOPMENT_ROUTES = buildTable(true);
  PRODUCTION_ROUTES = buildTable(false);
});

function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function routeKey(route: Route): string {
  return `${route.method.toLowerCase()} ${toOpenApiPath(route.path)}`;
}

function asRecord(value: unknown): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('objeto esperado');
  }
  return value as Json;
}

function documentedKeys(document: Json): string[] {
  return Object.entries(asRecord(document['paths'])).flatMap(([path, operations]) =>
    Object.keys(asRecord(operations)).map((method) => `${method} ${path}`),
  );
}

// A regra que a tabela inteira precisa cumprir: nenhuma rota sem documentação. É a mesma checagem que o gerador faz;
// o teste a reaplica à tabela real.
function undocumentedOf(routes: readonly Route[]): string[] {
  return routes
    .filter((route) => route.documentation === undefined)
    .map((route) => `${route.method} ${route.path}`);
}

function collectReferences(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, found);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key === '$ref' && typeof child === 'string') found.push(child);
      else collectReferences(child, found);
    }
  }
  return found;
}

function resolveReference(document: Json, reference: string): unknown {
  expect(reference.startsWith('#/')).toBe(true);
  let current: unknown = document;
  for (const segment of reference.slice(2).split('/')) {
    current = asRecord(current)[segment.replaceAll('~1', '/').replaceAll('~0', '~')];
  }
  return current;
}

function collectErrorCodes(
  document: Json,
): { operation: string; status: string; codes: string[] }[] {
  const found: { operation: string; status: string; codes: string[] }[] = [];
  for (const [path, operations] of Object.entries(asRecord(document['paths']))) {
    for (const [method, operation] of Object.entries(asRecord(operations))) {
      for (const [status, response] of Object.entries(asRecord(asRecord(operation)['responses']))) {
        if (Number(status) < 400) continue;
        const content = asRecord(asRecord(asRecord(response)['content'])['application/json']);
        const properties = asRecord(asRecord(content['schema'])['properties']);
        // O 503 de `/v1/health` é uma resposta `{ data: { status } }`, não o envelope de erro.
        if (!('error' in properties)) continue;
        const error = asRecord(properties['error']);
        const code = asRecord(asRecord(error['properties'])['code']);
        found.push({ operation: `${method} ${path}`, status, codes: code['enum'] as string[] });
      }
    }
  }
  return found;
}

describe('OpenAPI gerado da tabela de rotas', () => {
  test('toda rota da tabela real (com e sem as rotas de documentação) tem documentação', () => {
    expect(undocumentedOf(DEVELOPMENT_ROUTES)).toStrictEqual([]);
    expect(undocumentedOf(PRODUCTION_ROUTES)).toStrictEqual([]);
  });

  test('uma rota FAKE acrescentada à tabela sem documentação reprova (o gerador a recusa e a lista)', () => {
    const fake: Route = {
      method: 'GET',
      path: '/v1/fake/sem-documentacao',
      access: 'public',
      handler: () => Promise.resolve({ status: 200 }),
    };
    const table = [...DEVELOPMENT_ROUTES, fake];
    expect(undocumentedOf(table)).toStrictEqual(['GET /v1/fake/sem-documentacao']);
    expect(() => app.openApi.buildOpenApiDocument(table)).toThrow(
      app.undocumentedError.UndocumentedRouteError,
    );
  });

  test('toda rota REAL aparece no documento e todo caminho do documento é uma rota real (as duas direções)', () => {
    for (const routes of [DEVELOPMENT_ROUTES, PRODUCTION_ROUTES]) {
      const document = app.openApi.buildOpenApiDocument(routes);
      const fromRoutes = routes.map(routeKey).sort();
      expect(documentedKeys(document).sort()).toStrictEqual(fromRoutes);
      expect(new Set(fromRoutes).size).toBe(routes.length);
    }
  });

  test('as rotas com limite por minuto documentam o 429 (prazos e metas)', () => {
    const paths = asRecord(app.openApi.buildOpenApiDocument(DEVELOPMENT_ROUTES)['paths']);
    for (const path of [
      '/v1/horizons',
      '/v1/goals/{goalId}/evaluation',
      '/v1/runs/{runId}/chart',
      '/v1/runs/{runId}/trade-summary',
      '/v1/runs/{runId}/live-status',
      '/v1/runs/{runId}/decisions',
    ]) {
      const operation = asRecord(asRecord(paths[path])['get']);
      expect(Object.keys(asRecord(operation['responses']))).toContain('429');
    }
  });

  test('o documento é OpenAPI 3.1 estruturalmente válido', () => {
    const document = app.openApi.buildOpenApiDocument(DEVELOPMENT_ROUTES);
    expect(document['openapi']).toBe('3.1.0');
    const info = asRecord(document['info']);
    expect(typeof info['title']).toBe('string');
    expect(typeof info['version']).toBe('string');
    const components = asRecord(document['components']);
    const schemes = asRecord(components['securitySchemes']);
    expect(Object.keys(schemes)).toContain('bearerAuth');
    const operationIds = new Set<string>();
    for (const [path, operations] of Object.entries(asRecord(document['paths']))) {
      expect(path.startsWith('/')).toBe(true);
      const templated = [...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]);
      for (const [method, rawOperation] of Object.entries(asRecord(operations))) {
        const operation = asRecord(rawOperation);
        expect(['get', 'post', 'put', 'patch', 'delete']).toContain(method);
        const operationId = operation['operationId'] as string;
        expect(operationIds.has(operationId)).toBe(false);
        operationIds.add(operationId);
        expect(typeof operation['summary']).toBe('string');
        const responses = Object.keys(asRecord(operation['responses']));
        expect(responses.some((status) => status.startsWith('2'))).toBe(true);
        const pathParameters = ((operation['parameters'] as Json[] | undefined) ?? [])
          .filter((parameter) => parameter['in'] === 'path')
          .map((parameter) => parameter['name']);
        expect(pathParameters.sort()).toStrictEqual([...templated].sort());
        for (const parameter of (operation['parameters'] as Json[] | undefined) ?? []) {
          expect(typeof parameter['name']).toBe('string');
          expect(['path', 'query']).toContain(String(parameter['in']));
          expect(parameter['schema']).toBeDefined();
        }
        const security = operation['security'] as Json[] | undefined;
        for (const requirement of security ?? []) {
          for (const name of Object.keys(requirement)) expect(Object.keys(schemes)).toContain(name);
        }
      }
    }
  });

  test('nenhuma referência ($ref) está quebrada', () => {
    const document = app.openApi.buildOpenApiDocument(DEVELOPMENT_ROUTES);
    const references = collectReferences(document);
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect({
        reference,
        resolved: resolveReference(document, reference) !== undefined,
      }).toStrictEqual({
        reference,
        resolved: true,
      });
    }
  });

  test('rotas protegidas exigem o bearer; as públicas não declaram segurança', () => {
    const document = app.openApi.buildOpenApiDocument(DEVELOPMENT_ROUTES);
    const paths = asRecord(document['paths']);
    for (const route of DEVELOPMENT_ROUTES) {
      const operation = asRecord(
        asRecord(paths[toOpenApiPath(route.path)])[route.method.toLowerCase()],
      );
      expect({
        route: routeKey(route),
        isSecured: operation['security'] !== undefined,
      }).toStrictEqual({
        route: routeKey(route),
        isSecured: route.access !== 'public',
      });
    }
  });

  test('cada resposta de erro documentada corresponde a um código real', () => {
    const document = app.openApi.buildOpenApiDocument(DEVELOPMENT_ROUTES);
    const catalog = app.errorCatalog.ERROR_CODE_CATALOG;
    const errors = collectErrorCodes(document);
    expect(errors.length).toBeGreaterThan(0);
    for (const { operation, status, codes } of errors) {
      expect(codes.length).toBeGreaterThan(0);
      for (const code of codes) {
        expect({ operation, status, code, isReal: catalog.has(code) }).toStrictEqual({
          operation,
          status,
          code,
          isReal: true,
        });
      }
    }
  });

  test('todo caminho documenta o 503 DATABASE_UNAVAILABLE, menos o /v1/health, que responde 503 { status: degraded }', () => {
    const document = app.openApi.buildOpenApiDocument(DEVELOPMENT_ROUTES);
    for (const { operation, status, codes } of collectErrorCodes(document)) {
      if (status !== '503') continue;
      expect(operation).not.toBe('get /v1/health');
      expect(codes).toContain('DATABASE_UNAVAILABLE');
    }
    const operations = asRecord(asRecord(document['paths'])['/v1/health']);
    const responses = asRecord(asRecord(operations['get'])['responses']);
    const schema = asRecord(
      asRecord(asRecord(asRecord(responses['503'])['content'])['application/json'])['schema'],
    );
    const data = asRecord(asRecord(schema['properties'])['data']);
    expect(asRecord(asRecord(data['properties'])['status'])['const']).toBe('degraded');
    expect(asRecord(data['properties'])).toStrictEqual({ status: expect.anything() });
  });

  test('as rotas novas declaram os erros próprios (404 do recurso, 400, 409, 501)', () => {
    const document = app.openApi.buildOpenApiDocument(DEVELOPMENT_ROUTES);
    const byOperation = new Map<string, Map<string, string[]>>();
    for (const { operation, status, codes } of collectErrorCodes(document)) {
      const statuses = byOperation.get(operation) ?? new Map<string, string[]>();
      statuses.set(status, codes);
      byOperation.set(operation, statuses);
    }
    expect(byOperation.get('get /v1/runs/{runId}')?.get('404')).toStrictEqual(['RUN_NOT_FOUND']);
    expect(byOperation.get('get /v1/strategies/{strategyId}')?.get('404')).toStrictEqual([
      'STRATEGY_NOT_FOUND',
    ]);
    expect(byOperation.get('post /v1/runs/{runId}/stop')?.get('409')).toStrictEqual([
      'RUN_ALREADY_FINISHED',
    ]);
    for (const operation of [
      'get /v1/runs/{runId}/live-status',
      'get /v1/runs/{runId}/decisions',
    ]) {
      expect(byOperation.get(operation)?.get('404')).toStrictEqual(['RUN_NOT_FOUND']);
      expect(byOperation.get(operation)?.get('409')).toStrictEqual(['RUN_NOT_LIVE']);
    }
    for (const code of [
      'REQUEST_VALIDATION_FAILED',
      'GRID_TOO_LARGE',
      'PERIOD_TOO_SHORT',
      'INVALID_GRID',
    ]) {
      expect(byOperation.get('post /v1/runs')?.get('400')).toContain(code);
    }
  });

  test('o documento descreve as rotas novas com seus esquemas Zod', () => {
    const document = app.openApi.buildOpenApiDocument(DEVELOPMENT_ROUTES);
    const paths = asRecord(document['paths']);
    const candles = asRecord(asRecord(paths['/v1/markets/candles'])['get']);
    const names = ((candles['parameters'] as Json[]) ?? [])
      .map((parameter) => parameter['name'])
      .sort();
    expect(names).toStrictEqual(['from', 'symbol', 'timeframe', 'to']);
    const create = asRecord(asRecord(paths['/v1/runs'])['post']);
    const body = asRecord(
      asRecord(asRecord(asRecord(create['requestBody'])['content'])['application/json'])['schema'],
    );
    const bodyProperties = Object.keys(asRecord(body['properties']));
    for (const name of [
      'strategyVersionId',
      'kind',
      'symbol',
      'timeframe',
      'periodStart',
      'periodEnd',
      'grid',
    ])
      expect(bodyProperties).toContain(name);
    const csv = asRecord(asRecord(paths['/v1/runs/{runId}/export.csv'])['get']);
    expect(
      Object.keys(asRecord(asRecord(csv['responses'])['200'])['content'] as Json),
    ).toStrictEqual(['text/csv; charset=utf-8']);
  });
});
