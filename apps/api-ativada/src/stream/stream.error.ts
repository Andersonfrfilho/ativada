// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DomainError } from '../shared/errors/domain.error.js';
import { STREAM_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_HEADER, HTTP_STATUS } from '../shared/http/http.constant.js';

export class StreamUpgradeRequiredError extends DomainError {
  constructor() {
    super({
      code: STREAM_ERROR_CODE.STREAM_UPGRADE_REQUIRED,
      message: 'Esta rota só fala WebSocket.',
      status: HTTP_STATUS.UPGRADE_REQUIRED,
    });
  }
}

// Ticket ausente, malformado, desconhecido, vencido ou já usado: a mesma resposta para todos, sem dizer qual.
export class StreamTicketInvalidError extends DomainError {
  constructor() {
    super({
      code: STREAM_ERROR_CODE.STREAM_TICKET_INVALID,
      message: 'Ticket inválido.',
      status: HTTP_STATUS.UNAUTHORIZED,
    });
  }
}

export class StreamUnavailableError extends DomainError {
  constructor() {
    super({
      code: STREAM_ERROR_CODE.STREAM_UNAVAILABLE,
      message: 'Tempo real indisponível no momento. Tente novamente em instantes.',
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
      headers: { [HTTP_HEADER.RETRY_AFTER]: '5' },
    });
  }
}

export class StreamLimitReachedError extends DomainError {
  constructor() {
    super({
      code: STREAM_ERROR_CODE.STREAM_LIMIT_REACHED,
      message: 'Limite de conexões em tempo real atingido.',
      status: HTTP_STATUS.TOO_MANY_REQUESTS,
    });
  }
}
