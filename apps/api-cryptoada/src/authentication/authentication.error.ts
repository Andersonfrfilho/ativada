// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DomainError } from '../shared/errors/domain.error.js';
import {
  ACCOUNT_ERROR_CODE,
  AUTHENTICATION_ERROR_CODE,
} from '../shared/errors/error-code.constant.js';
import { HTTP_HEADER, HTTP_STATUS } from '../shared/http/http.constant.js';
import {
  WWW_AUTHENTICATE_BEARER,
  WWW_AUTHENTICATE_INVALID_TOKEN,
} from './authentication.constant.js';

export class AuthenticationRequiredError extends DomainError {
  constructor() {
    super({
      code: AUTHENTICATION_ERROR_CODE.AUTHENTICATION_REQUIRED,
      message: 'Autenticação necessária.',
      status: HTTP_STATUS.UNAUTHORIZED,
      headers: { [HTTP_HEADER.WWW_AUTHENTICATE]: WWW_AUTHENTICATE_BEARER },
    });
  }
}

export class AccessTokenExpiredError extends DomainError {
  constructor() {
    super({
      code: AUTHENTICATION_ERROR_CODE.ACCESS_TOKEN_EXPIRED,
      message: 'Sessão expirada.',
      status: HTTP_STATUS.UNAUTHORIZED,
      headers: { [HTTP_HEADER.WWW_AUTHENTICATE]: WWW_AUTHENTICATE_INVALID_TOKEN },
    });
  }
}

export class InvalidAccessTokenError extends DomainError {
  constructor() {
    super({
      code: AUTHENTICATION_ERROR_CODE.INVALID_ACCESS_TOKEN,
      message: 'Credenciais inválidas.',
      status: HTTP_STATUS.UNAUTHORIZED,
      headers: { [HTTP_HEADER.WWW_AUTHENTICATE]: WWW_AUTHENTICATE_INVALID_TOKEN },
    });
  }
}

export class EmailNotVerifiedError extends DomainError {
  constructor() {
    super({
      code: AUTHENTICATION_ERROR_CODE.EMAIL_NOT_VERIFIED,
      message: 'E-mail não verificado.',
      status: HTTP_STATUS.FORBIDDEN,
    });
  }
}

export class ForbiddenError extends DomainError {
  constructor() {
    super({
      code: AUTHENTICATION_ERROR_CODE.FORBIDDEN,
      message: 'Acesso negado.',
      status: HTTP_STATUS.FORBIDDEN,
    });
  }
}

export class MfaRequiredError extends DomainError {
  constructor() {
    super({
      code: AUTHENTICATION_ERROR_CODE.MFA_REQUIRED,
      message: 'Segundo fator de autenticação necessário.',
      status: HTTP_STATUS.FORBIDDEN,
    });
  }
}

export class ReauthenticationRequiredError extends DomainError {
  constructor() {
    super({
      code: AUTHENTICATION_ERROR_CODE.REAUTH_REQUIRED,
      message: 'Confirme sua identidade entrando novamente.',
      status: HTTP_STATUS.FORBIDDEN,
    });
  }
}

export class AuthenticationUnavailableError extends DomainError {
  constructor() {
    super({
      code: AUTHENTICATION_ERROR_CODE.AUTHENTICATION_UNAVAILABLE,
      message: 'Autenticação indisponível no momento.',
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
    });
  }
}

export class AccountDeletedError extends DomainError {
  constructor() {
    super({
      code: ACCOUNT_ERROR_CODE.ACCOUNT_DELETED,
      message: 'Conta apagada.',
      status: HTTP_STATUS.UNAUTHORIZED,
    });
  }
}

export class AccountBlockedError extends DomainError {
  constructor() {
    super({
      code: ACCOUNT_ERROR_CODE.ACCOUNT_BLOCKED,
      message: 'Conta bloqueada.',
      status: HTTP_STATUS.FORBIDDEN,
    });
  }
}
