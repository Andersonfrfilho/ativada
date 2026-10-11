// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DomainError } from '../shared/errors/domain.error.js';
import { PRICE_ALERT_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';

// Alerta alheio e alerta inexistente respondem IGUAL (ADR 0001 §e): mesmo status, código, mensagem e tamanho.
export class PriceAlertNotFoundError extends DomainError {
  constructor() {
    super({
      code: PRICE_ALERT_ERROR_CODE.PRICE_ALERT_NOT_FOUND,
      message: 'Alerta de preço não encontrado.',
      status: HTTP_STATUS.NOT_FOUND,
    });
  }
}

export class PriceAlertLimitReachedError extends DomainError {
  constructor() {
    super({
      code: PRICE_ALERT_ERROR_CODE.PRICE_ALERT_LIMIT_REACHED,
      message: 'Você atingiu o limite de alertas de preço ligados. Desligue ou apague um.',
      status: HTTP_STATUS.CONFLICT,
    });
  }
}
