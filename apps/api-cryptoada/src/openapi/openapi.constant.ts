// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ACCOUNT_ERROR_CODE,
  AUTHENTICATION_ERROR_CODE,
  INTERNAL_ERROR_CODE,
  RATE_LIMIT_ERROR_CODE,
} from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import type { DocumentedError } from './route-documentation.types.js';

export const OPENAPI_VERSION = '3.1.0';
export const API_TITLE = 'CryptoAdA API';
export const API_VERSION = '1.0.0';
export const API_DESCRIPTION =
  'Simulador e sinais de criptomoedas (spec 001). Simulação: sinais são saída de regras, não recomendação de investimento.';

export const BEARER_SECURITY_SCHEME = 'bearerAuth';
export const JSON_CONTENT_TYPE = 'application/json';
export const ERROR_ENVELOPE_SCHEMA = 'ErrorDetails';
export const PAGINATION_SCHEMA_KEY = 'pagination';

// Erros que todo caminho autenticado pode devolver, pelo `access` da rota (o roteador e a autenticação os produzem).
export const AUTHENTICATED_ERRORS: readonly DocumentedError[] = [
  { status: HTTP_STATUS.UNAUTHORIZED, code: AUTHENTICATION_ERROR_CODE.AUTHENTICATION_REQUIRED },
  { status: HTTP_STATUS.UNAUTHORIZED, code: AUTHENTICATION_ERROR_CODE.ACCESS_TOKEN_EXPIRED },
  { status: HTTP_STATUS.UNAUTHORIZED, code: AUTHENTICATION_ERROR_CODE.INVALID_ACCESS_TOKEN },
  { status: HTTP_STATUS.UNAUTHORIZED, code: ACCOUNT_ERROR_CODE.ACCOUNT_DELETED },
  { status: HTTP_STATUS.FORBIDDEN, code: AUTHENTICATION_ERROR_CODE.EMAIL_NOT_VERIFIED },
  { status: HTTP_STATUS.FORBIDDEN, code: ACCOUNT_ERROR_CODE.ACCOUNT_BLOCKED },
  { status: HTTP_STATUS.FORBIDDEN, code: AUTHENTICATION_ERROR_CODE.FORBIDDEN },
  {
    status: HTTP_STATUS.SERVICE_UNAVAILABLE,
    code: AUTHENTICATION_ERROR_CODE.AUTHENTICATION_UNAVAILABLE,
  },
];

export const ADMIN_ERRORS: readonly DocumentedError[] = [
  { status: HTTP_STATUS.FORBIDDEN, code: AUTHENTICATION_ERROR_CODE.MFA_REQUIRED },
];

export const COMMON_ERRORS: readonly DocumentedError[] = [
  { status: HTTP_STATUS.TOO_MANY_REQUESTS, code: RATE_LIMIT_ERROR_CODE.RATE_LIMITED },
  { status: HTTP_STATUS.INTERNAL_SERVER_ERROR, code: INTERNAL_ERROR_CODE },
];
