// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DomainError } from '../errors/domain.error.js';
import type { ErrorDetail } from '../errors/app.error.js';
import { VALIDATION_ERROR_CODE } from '../errors/error-code.constant.js';
import { HTTP_STATUS } from './http.constant.js';

export class RequestValidationError extends DomainError {
  constructor(details: readonly ErrorDetail[]) {
    super({
      code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED,
      message: 'Requisição inválida.',
      status: HTTP_STATUS.BAD_REQUEST,
      details,
    });
  }
}
