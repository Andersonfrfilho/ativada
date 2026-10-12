// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DomainError } from '../shared/errors/domain.error.js';
import { ROUTING_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';

export class OriginNotAllowedError extends DomainError {
  constructor() {
    super({
      code: ROUTING_ERROR_CODE.ORIGIN_NOT_ALLOWED,
      message: 'Origem não permitida.',
      status: HTTP_STATUS.FORBIDDEN,
    });
  }
}
