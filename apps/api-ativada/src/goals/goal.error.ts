// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DomainError } from '../shared/errors/domain.error.js';
import { GOAL_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_HEADER, HTTP_STATUS } from '../shared/http/http.constant.js';
import { GOAL_EVALUATION_BUSY_RETRY_AFTER_SECONDS } from './goal.constant.js';

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

export class GoalInactiveError extends DomainError {
  constructor() {
    super({
      code: GOAL_ERROR_CODE.GOAL_INACTIVE,
      message: 'A meta está desligada: ligue-a para iniciar uma simulação.',
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

// Sem candles suficientes para o aquecimento da estratégia (ou configuração que o motor já não aceita): não há plano.
export class GoalPlanUnavailableError extends DomainError {
  constructor() {
    super({
      code: GOAL_ERROR_CODE.GOAL_PLAN_UNAVAILABLE,
      message: 'Ainda não há candles suficientes para montar o plano desta estratégia neste par.',
      status: HTTP_STATUS.CONFLICT,
    });
  }
}

// O teto global de avaliações a frio simultâneas: a API recusa em vez de enfileirar CPU sem fim.
export class GoalEvaluationBusyError extends DomainError {
  constructor() {
    super({
      code: GOAL_ERROR_CODE.GOAL_EVALUATION_BUSY,
      message: 'Há muitas avaliações de metas em andamento. Tente novamente em instantes.',
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
      headers: { [HTTP_HEADER.RETRY_AFTER]: String(GOAL_EVALUATION_BUSY_RETRY_AFTER_SECONDS) },
    });
  }
}

export class GoalEvaluationTimeoutError extends DomainError {
  constructor() {
    super({
      code: GOAL_ERROR_CODE.GOAL_EVALUATION_TIMEOUT,
      message: 'A avaliação da meta demorou mais que o permitido. Tente novamente em instantes.',
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
      headers: { [HTTP_HEADER.RETRY_AFTER]: String(GOAL_EVALUATION_BUSY_RETRY_AFTER_SECONDS) },
    });
  }
}
