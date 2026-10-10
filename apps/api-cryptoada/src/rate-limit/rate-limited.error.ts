// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DomainError } from '../shared/errors/domain.error.js';
import { RATE_LIMIT_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_HEADER, HTTP_STATUS } from '../shared/http/http.constant.js';

export class RateLimitedError extends DomainError {
  constructor(retryAfterSeconds: number) {
    super({
      code: RATE_LIMIT_ERROR_CODE.RATE_LIMITED,
      message: 'Muitas requisições. Tente novamente em instantes.',
      status: HTTP_STATUS.TOO_MANY_REQUESTS,
      headers: { [HTTP_HEADER.RETRY_AFTER]: String(retryAfterSeconds) },
    });
  }
}
