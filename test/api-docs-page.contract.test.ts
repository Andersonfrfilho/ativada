// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { Route } from '../apps/api-ativada/src/router/route.types.js';
import { loadApiApp, type ApiApp } from './fixtures/api-routes/api-app.fixture.js';
import { buildApiRouteDependencies } from './fixtures/api-route-dependencies.fixture.js';

const app: ApiApp = await loadApiApp();
const SCALAR_PACKAGE = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@';
const DEFAULT_CSP = app.securityConstant.SECURITY_HEADERS['Content-Security-Policy'] ?? '';

function createHandler(isDocumentationEnabled: boolean): {
  readonly routes: readonly Route[];
  readonly get: (path: string) => Promise<Response>;
} {
  const routes = app.apiRoutes.createApiRoutes(
    buildApiRouteDependencies(() => Promise.resolve(true), isDocumentationEnabled),
  );
  const router = app.router.createRouter({
    routes,
    verifyAccessToken: () => Promise.reject(new Error('rota pública não verifica token')),
    resolveUser: () => Promise.reject(new Error('rota pública não resolve usuário')),
    rateLimiter: app.rateLimiter.createRateLimiter({ now: () => Date.now() }),
    trustedProxyHops: 0,
    reportUnexpectedError: (error) => {
      throw error;
    },
  });
  const handler = app.requestHandler.createRequestHandler({
    router,
    corsAllowedOrigins: [],
    logger: app.logger.createLogger({ appName: 'api-ativada', write: () => undefined }),
  });
  return {
    routes,
    get: (path) => handler(new Request(`http://harness.test${path}`), '203.0.113.9'),
  };
}

describe('documentação da API (só fora de produção)', () => {
  test('em PRODUÇÃO /v1/openapi.json e /v1/docs respondem 404 e a rota nem entra na tabela nem no documento', async () => {
    const production = createHandler(false);
    for (const path of ['/v1/openapi.json', '/v1/docs']) {
      const response = await production.get(path);
      expect({ path, status: response.status }).toStrictEqual({ path, status: 404 });
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
        'ROUTE_NOT_FOUND',
      );
    }
    const paths = production.routes.map((route) => route.path);
    expect(paths).not.toContain('/v1/openapi.json');
    expect(paths).not.toContain('/v1/docs');
    const document = app.openApi.buildOpenApiDocument(production.routes);
    expect(Object.keys(document['paths'] as object)).not.toContain('/v1/openapi.json');
    expect(Object.keys(document['paths'] as object)).not.toContain('/v1/docs');
  });

  test('fora de produção /v1/openapi.json devolve o documento gerado da tabela (sem token, no-store)', async () => {
    const development = createHandler(true);
    const response = await development.get('/v1/openapi.json');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const served = (await response.json()) as Record<string, unknown>;
    const expected = JSON.parse(
      JSON.stringify(app.openApi.buildOpenApiDocument(development.routes)),
    ) as Record<string, unknown>;
    expect(served).toStrictEqual(expected);
    const documentedPaths = Object.keys(served['paths'] as object);
    for (const path of ['/v1/docs', '/v1/openapi.json', '/v1/runs', '/v1/health']) {
      expect(documentedPaths).toContain(path);
    }
  });

  test('/v1/docs serve o Scalar de versão EXATA no CDN, com SRI e nonce, sem unsafe-inline', async () => {
    const development = createHandler(true);
    const response = await development.get('/v1/docs');
    const html = await response.text();
    const version = app.docsConstant.SCALAR_VERSION;
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(html).toContain(`${SCALAR_PACKAGE}${version}/`);
    expect(html).toContain('integrity="sha384-');
    expect(html).toContain('data-url="/v1/openapi.json"');
    const policy = response.headers.get('Content-Security-Policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(policy)?.[1] ?? '';
    expect(nonce.length).toBeGreaterThan(10);
    expect(html).toContain(`nonce="${nonce}"`);
    expect(html).toContain(`<meta property="csp-nonce" content="${nonce}"`);
    expect(policy).not.toContain('unsafe-inline');
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).toContain(`script-src 'nonce-${nonce}' ${SCALAR_PACKAGE}${version}/`);
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  test('o nonce muda a cada resposta', async () => {
    const development = createHandler(true);
    const first = (await development.get('/v1/docs')).headers.get('Content-Security-Policy');
    const second = (await development.get('/v1/docs')).headers.get('Content-Security-Policy');
    expect(first).not.toBe(second);
  });

  test('a CSP da página de documentação vale SÓ para ela: as outras rotas seguem com a CSP fechada', async () => {
    const development = createHandler(true);
    const health = await development.get('/v1/health');
    expect(health.headers.get('Content-Security-Policy')).toBe(DEFAULT_CSP);
    const notFound = await development.get('/v1/nao-existe');
    expect(notFound.headers.get('Content-Security-Policy')).toBe(DEFAULT_CSP);
    const openapi = await development.get('/v1/openapi.json');
    expect(openapi.headers.get('Content-Security-Policy')).toBe(DEFAULT_CSP);
    expect(DEFAULT_CSP).not.toContain('cdn.jsdelivr.net');
  });

  test('os demais cabeçalhos de segurança continuam na página de documentação', async () => {
    const development = createHandler(true);
    const response = await development.get('/v1/docs');
    for (const name of [
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Strict-Transport-Security',
    ]) {
      expect(response.headers.get(name)).toBe(app.securityConstant.SECURITY_HEADERS[name] ?? null);
    }
  });
});
