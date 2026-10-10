// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DomainError } from '../shared/errors/domain.error.js';
import { STRATEGY_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';

export class StrategyNotFoundError extends DomainError {
  constructor() {
    super({
      code: STRATEGY_ERROR_CODE.STRATEGY_NOT_FOUND,
      message: 'Estratégia não encontrada.',
      status: HTTP_STATUS.NOT_FOUND,
    });
  }
}

export class StrategyVersionNotFoundError extends DomainError {
  constructor() {
    super({
      code: STRATEGY_ERROR_CODE.STRATEGY_VERSION_NOT_FOUND,
      message: 'Versão da estratégia não encontrada.',
      status: HTTP_STATUS.NOT_FOUND,
    });
  }
}
