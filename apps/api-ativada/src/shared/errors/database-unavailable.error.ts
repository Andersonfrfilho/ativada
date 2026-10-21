// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_HEADER, HTTP_STATUS } from '../http/http.constant.js';
import { DomainError } from './domain.error.js';
import { DATABASE_ERROR_CODE } from './error-code.constant.js';

export const DATABASE_UNAVAILABLE_RETRY_AFTER_SECONDS = 5;

// Banco fora do ar é indisponibilidade esperada e passageira (ADR 0002, R9): o cliente sabe tentar de novo, e a mensagem
// é fixa para nada do driver (consulta, parâmetro, URL) chegar ao corpo.
export class DatabaseUnavailableApiError extends DomainError {
  constructor() {
    super({
      code: DATABASE_ERROR_CODE.DATABASE_UNAVAILABLE,
      message: 'Serviço indisponível no momento. Tente novamente em instantes.',
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
      headers: { [HTTP_HEADER.RETRY_AFTER]: String(DATABASE_UNAVAILABLE_RETRY_AFTER_SECONDS) },
    });
  }
}
