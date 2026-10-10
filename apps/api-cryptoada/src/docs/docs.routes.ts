// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import { buildOpenApiDocument, type OpenApiDocument } from '../openapi/build-openapi-document.js';
import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { CONTENT_SECURITY_POLICY_HEADER } from '../http/http-security.constant.js';
import { HTTP_HEADER, HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import {
  DOCS_PATH,
  DOCS_TAG,
  HTML_CONTENT_TYPE,
  JSON_CONTENT_TYPE,
  OPENAPI_PATH,
} from './docs.constant.js';
import { buildDocsContentSecurityPolicy, buildScalarPage, createNonce } from './scalar-page.js';

const OPENAPI_DOCUMENTATION: RouteDocumentation = {
  summary: 'Documento OpenAPI 3.1, gerado da tabela de rotas (só fora de produção).',
  tag: DOCS_TAG,
  successes: [
    {
      status: HTTP_STATUS.OK,
      description: 'O documento OpenAPI.',
      contentType: 'application/json',
      schema: z.record(z.string(), z.unknown()),
    },
  ],
  errors: [],
};

const DOCS_DOCUMENTATION: RouteDocumentation = {
  summary: 'Página de referência da API (Scalar), só fora de produção.',
  tag: DOCS_TAG,
  successes: [
    {
      status: HTTP_STATUS.OK,
      description: 'HTML da referência.',
      contentType: 'text/html',
      schema: z.string(),
    },
  ],
  errors: [],
};

// As duas rotas existem SÓ fora de produção: em produção nem entram na tabela (404) nem no documento. O documento é
// gerado sob demanda, da tabela final (que inclui estas duas), e guardado.
export function createDocsRoutes(getRoutes: () => readonly Route[]): readonly Route[] {
  let document: OpenApiDocument | undefined;
  return [
    {
      method: HTTP_METHOD.GET,
      path: OPENAPI_PATH,
      access: ROUTE_ACCESS.PUBLIC,
      documentation: OPENAPI_DOCUMENTATION,
      handler: (): Promise<RouteResult> => {
        document ??= buildOpenApiDocument(getRoutes());
        return Promise.resolve({
          status: HTTP_STATUS.OK,
          rawBody: JSON.stringify(document),
          headers: { [HTTP_HEADER.CONTENT_TYPE]: JSON_CONTENT_TYPE },
        });
      },
    },
    {
      method: HTTP_METHOD.GET,
      path: DOCS_PATH,
      access: ROUTE_ACCESS.PUBLIC,
      documentation: DOCS_DOCUMENTATION,
      handler: (): Promise<RouteResult> => {
        const nonce = createNonce();
        return Promise.resolve({
          status: HTTP_STATUS.OK,
          rawBody: buildScalarPage(nonce),
          headers: {
            [HTTP_HEADER.CONTENT_TYPE]: HTML_CONTENT_TYPE,
            [CONTENT_SECURITY_POLICY_HEADER]: buildDocsContentSecurityPolicy(nonce),
          },
        });
      },
    },
  ];
}
