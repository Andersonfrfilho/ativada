// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DomainError } from '../shared/errors/domain.error.js';
import { PROFILE_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';

export class ProfileNotFoundError extends DomainError {
  constructor() {
    super({
      code: PROFILE_ERROR_CODE.PROFILE_NOT_FOUND,
      message: 'Perfil não encontrado.',
      status: HTTP_STATUS.NOT_FOUND,
    });
  }
}
