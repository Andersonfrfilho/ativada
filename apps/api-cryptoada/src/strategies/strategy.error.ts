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

export class StrategyIsExampleError extends DomainError {
  constructor() {
    super({
      code: STRATEGY_ERROR_CODE.STRATEGY_IS_EXAMPLE,
      message: 'A estratégia de exemplo não pode ser apagada. Duplique-a para ter uma cópia sua.',
      status: HTTP_STATUS.CONFLICT,
    });
  }
}

export class StrategyLimitReachedError extends DomainError {
  constructor() {
    super({
      code: STRATEGY_ERROR_CODE.STRATEGY_LIMIT_REACHED,
      message: 'Você atingiu o limite de estratégias. Apague uma para criar outra.',
      status: HTTP_STATUS.CONFLICT,
    });
  }
}

export class StrategyVersionLimitReachedError extends DomainError {
  constructor() {
    super({
      code: STRATEGY_ERROR_CODE.STRATEGY_VERSION_LIMIT_REACHED,
      message:
        'Esta estratégia atingiu o limite de versões. Crie uma nova estratégia a partir dela.',
      status: HTTP_STATUS.CONFLICT,
    });
  }
}
