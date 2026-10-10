// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition, reportLine, type ApiRunsContext } from './api-runs-test-context.js';

const EXPECTED_PATHS = [
  '/v1/markets/candles',
  '/v1/strategies',
  '/v1/strategies/{strategyId}',
  '/v1/strategies/{strategyId}/versions',
  '/v1/runs',
  '/v1/runs/{runId}',
  '/v1/runs/{runId}/stop',
  '/v1/runs/{runId}/equity',
  '/v1/runs/{runId}/export.csv',
  '/v1/runs/{runId}/log.csv',
  '/v1/openapi.json',
  '/v1/docs',
];

// Fora de produção a API serve o documento gerado da tabela de rotas e a página do Scalar.
export async function checkDocumentation(context: ApiRunsContext): Promise<void> {
  const document = await context.call({ path: '/v1/openapi.json' });
  assertCondition(document.status === 200, `openapi.json: ${document.status}`);
  const body = document.json as { openapi: string; paths: Record<string, unknown> };
  assertCondition(body.openapi === '3.1.0', 'OpenAPI 3.1');
  for (const path of EXPECTED_PATHS)
    assertCondition(path in body.paths, `faltou ${path} no documento`);
  const page = await context.call({ path: '/v1/docs' });
  const policy = page.headers.get('content-security-policy') ?? '';
  assertCondition(
    page.status === 200 && page.text.includes('@scalar/api-reference@'),
    'página do Scalar',
  );
  assertCondition(
    !policy.includes('unsafe-inline') && /'nonce-[^']+'/.test(policy),
    'CSP com nonce e sem unsafe-inline',
  );
  const health = await context.call({ path: '/v1/health' });
  assertCondition(
    (health.headers.get('content-security-policy') ?? '').includes("default-src 'none'") &&
      !(health.headers.get('content-security-policy') ?? '').includes('jsdelivr'),
    'a CSP da documentação não vaza para as outras rotas',
  );
  reportLine(
    `OpenAPI 3.1 servido pela API real (${Object.keys(body.paths).length} caminhos) e página do Scalar com CSP própria`,
  );
}
