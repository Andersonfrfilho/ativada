// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DomainError } from '../shared/errors/domain.error.js';
import { SESSION_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_HEADER, HTTP_STATUS } from '../shared/http/http.constant.js';
import { buildClearedRefreshCookie } from './session-cookie.js';

export class CsrfRejectedError extends DomainError {
  constructor() {
    super({
      code: SESSION_ERROR_CODE.CSRF_REJECTED,
      message: 'Requisição recusada.',
      status: HTTP_STATUS.FORBIDDEN,
    });
  }
}

export class InvalidSessionRequestError extends DomainError {
  constructor() {
    super({
      code: SESSION_ERROR_CODE.INVALID_SESSION_REQUEST,
      message: 'Corpo da requisição inválido.',
      status: HTTP_STATUS.BAD_REQUEST,
    });
  }
}

export class RedirectUriNotAllowedError extends DomainError {
  constructor() {
    super({
      code: SESSION_ERROR_CODE.REDIRECT_URI_NOT_ALLOWED,
      message: 'redirectUri não permitido.',
      status: HTTP_STATUS.BAD_REQUEST,
    });
  }
}

export class AuthorizationCodeRejectedError extends DomainError {
  constructor() {
    super({
      code: SESSION_ERROR_CODE.AUTHORIZATION_CODE_REJECTED,
      message: 'Código de autorização recusado.',
      status: HTTP_STATUS.BAD_REQUEST,
    });
  }
}

export class SessionEndedError extends DomainError {
  constructor() {
    super({
      code: SESSION_ERROR_CODE.SESSION_ENDED,
      message: 'Sessão encerrada. Entre novamente.',
      status: HTTP_STATUS.UNAUTHORIZED,
      headers: { [HTTP_HEADER.SET_COOKIE]: buildClearedRefreshCookie() },
    });
  }
}

export class SessionUnavailableError extends DomainError {
  constructor(headers?: Readonly<Record<string, string>>) {
    super({
      code: SESSION_ERROR_CODE.SESSION_UNAVAILABLE,
      message: 'Serviço de sessão indisponível. Tente novamente em instantes.',
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
      ...(headers === undefined ? {} : { headers }),
    });
  }
}
