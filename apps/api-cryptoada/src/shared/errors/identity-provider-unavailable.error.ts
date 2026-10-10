// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_STATUS } from '../http/http.constant.js';
import { DomainError } from './domain.error.js';
import { ADMIN_ERROR_CODE } from './error-code.constant.js';

export class IdentityProviderUnavailableError extends DomainError {
  constructor() {
    super({
      code: ADMIN_ERROR_CODE.IDENTITY_PROVIDER_UNAVAILABLE,
      message: 'Provedor de identidade indisponível no momento. Tente novamente.',
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
    });
  }
}
