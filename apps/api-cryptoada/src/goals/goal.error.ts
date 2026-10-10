// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DomainError } from '../shared/errors/domain.error.js';
import { GOAL_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';

// Meta alheia e meta inexistente respondem IGUAL (ADR 0001 §e): mesmo status, código, mensagem e tamanho.
export class GoalNotFoundError extends DomainError {
  constructor() {
    super({
      code: GOAL_ERROR_CODE.GOAL_NOT_FOUND,
      message: 'Meta não encontrada.',
      status: HTTP_STATUS.NOT_FOUND,
    });
  }
}

export class GoalLimitReachedError extends DomainError {
  constructor() {
    super({
      code: GOAL_ERROR_CODE.GOAL_LIMIT_REACHED,
      message: 'Você atingiu o limite de metas. Apague uma para criar outra.',
      status: HTTP_STATUS.CONFLICT,
    });
  }
}

export class GoalInUseError extends DomainError {
  constructor() {
    super({
      code: GOAL_ERROR_CODE.GOAL_IN_USE,
      message: 'Há simulações ligadas a esta meta: pare-as antes de apagá-la.',
      status: HTTP_STATUS.CONFLICT,
    });
  }
}
