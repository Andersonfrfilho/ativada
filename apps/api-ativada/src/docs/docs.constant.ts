// Copyright (c) 2026 Ada Technology. All rights reserved.
export const OPENAPI_PATH = '/v1/openapi.json';
export const DOCS_PATH = '/v1/docs';

// Scalar API Reference, versão EXATA (a última estável publicada há mais de duas semanas em 2026-10-10: 1.72.1,
// de 2026-09-25) e o arquivo exato dentro dela. A integridade (SRI SHA-384) é a do `dist/browser/standalone.js`
// do tarball do npm e do jsDelivr — o mesmo byte nos dois. Trocar a versão exige trocar o hash (ADR 0002, T3.4).
export const SCALAR_VERSION = '1.72.1';
export const SCALAR_PACKAGE_URL = `https://cdn.jsdelivr.net/npm/@scalar/api-reference@${SCALAR_VERSION}`;
export const SCALAR_SCRIPT_URL = `${SCALAR_PACKAGE_URL}/dist/browser/standalone.js`;
export const SCALAR_SCRIPT_INTEGRITY =
  'sha384-U11tb2XnKvmwt8RlTvnwUnYgrN+ur4Xyh9htLhjajWNR/Oyl5AX5DEz00qRmlrmK';
export const SCALAR_CONFIGURATION = { withDefaultFonts: false, hideClientButton: true } as const;

export const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
export const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
export const NONCE_BYTES = 16;
export const DOCS_TAG = 'Documentação';
