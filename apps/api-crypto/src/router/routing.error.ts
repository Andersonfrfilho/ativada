// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DomainError } from '../shared/errors/domain.error.js';
import { ROUTING_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_HEADER, HTTP_STATUS } from '../shared/http/http.constant.js';

export class RouteNotFoundError extends DomainError {
  constructor() {
    super({
      code: ROUTING_ERROR_CODE.ROUTE_NOT_FOUND,
      message: 'Rota não encontrada.',
      status: HTTP_STATUS.NOT_FOUND,
    });
  }
}

export class MethodNotAllowedError extends DomainError {
  constructor(allowedMethods: readonly string[]) {
    super({
      code: ROUTING_ERROR_CODE.METHOD_NOT_ALLOWED,
      message: 'Método não permitido.',
      status: HTTP_STATUS.METHOD_NOT_ALLOWED,
      headers: { [HTTP_HEADER.ALLOW]: allowedMethods.join(', ') },
    });
  }
}
