// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DomainError } from '../shared/errors/domain.error.js';
import { ADMIN_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';

export class AccountNotFoundError extends DomainError {
  constructor() {
    super({
      code: ADMIN_ERROR_CODE.ACCOUNT_NOT_FOUND,
      message: 'Conta não encontrada.',
      status: HTTP_STATUS.NOT_FOUND,
    });
  }
}

export class CannotBlockSelfError extends DomainError {
  constructor() {
    super({
      code: ADMIN_ERROR_CODE.CANNOT_BLOCK_SELF,
      message: 'O administrador não pode bloquear a própria conta.',
      status: HTTP_STATUS.CONFLICT,
    });
  }
}

export class CannotBlockAdminError extends DomainError {
  constructor() {
    super({
      code: ADMIN_ERROR_CODE.CANNOT_BLOCK_ADMIN,
      message: 'Contas de administrador não podem ser bloqueadas.',
      status: HTTP_STATUS.CONFLICT,
    });
  }
}

export class AccountAlreadyActiveError extends DomainError {
  constructor() {
    super({
      code: ADMIN_ERROR_CODE.ACCOUNT_ALREADY_ACTIVE,
      message: 'Esta pessoa já tem conta ativa.',
      status: HTTP_STATUS.CONFLICT,
    });
  }
}
