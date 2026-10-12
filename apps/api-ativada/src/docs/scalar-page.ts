// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  NONCE_BYTES,
  OPENAPI_PATH,
  SCALAR_CONFIGURATION,
  SCALAR_PACKAGE_URL,
  SCALAR_SCRIPT_INTEGRITY,
  SCALAR_SCRIPT_URL,
} from './docs.constant.js';

export function createNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(NONCE_BYTES))).toString('base64');
}

// A CSP MÍNIMA desta página (e só dela): sem `unsafe-inline`, o script só do pacote fixado no CDN e o nonce desta
// resposta, conexões só para a própria API. Todas as outras rotas seguem com a CSP fechada de `SECURITY_HEADERS`.
export function buildDocsContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' ${SCALAR_PACKAGE_URL}/`,
    `style-src 'nonce-${nonce}'`,
    "connect-src 'self'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

// O Scalar lê o nonce de `<meta property="csp-nonce">` para os estilos que injeta.
export function buildScalarPage(nonce: string): string {
  const configuration = JSON.stringify(SCALAR_CONFIGURATION);
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta property="csp-nonce" content="${nonce}" />
    <title>AtivAdA API</title>
  </head>
  <body>
    <script id="api-reference" data-url="${OPENAPI_PATH}" data-configuration='${configuration}' nonce="${nonce}"></script>
    <script src="${SCALAR_SCRIPT_URL}" integrity="${SCALAR_SCRIPT_INTEGRITY}" crossorigin="anonymous" nonce="${nonce}"></script>
  </body>
</html>
`;
}
