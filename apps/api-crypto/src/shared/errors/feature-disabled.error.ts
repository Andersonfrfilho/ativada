// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_STATUS } from '../http/http.constant.js';
import { DomainError } from './domain.error.js';
import { FEATURE_ERROR_CODE } from './error-code.constant.js';

export class FeatureDisabledError extends DomainError {
  constructor() {
    super({
      code: FEATURE_ERROR_CODE.FEATURE_DISABLED,
      message: 'Recurso indisponível neste ambiente.',
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
    });
  }
}
