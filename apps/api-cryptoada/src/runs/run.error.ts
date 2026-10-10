// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ErrorDetail } from '../shared/errors/app.error.js';
import { DomainError } from '../shared/errors/domain.error.js';
import { RUN_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';

export class RunNotFoundError extends DomainError {
  constructor() {
    super({
      code: RUN_ERROR_CODE.RUN_NOT_FOUND,
      message: 'Execução não encontrada.',
      status: HTTP_STATUS.NOT_FOUND,
    });
  }
}

export class RunAlreadyFinishedError extends DomainError {
  constructor() {
    super({
      code: RUN_ERROR_CODE.RUN_ALREADY_FINISHED,
      message: 'A execução já terminou e não pode mais ser parada.',
      status: HTTP_STATUS.CONFLICT,
    });
  }
}

// A simulação ao vivo chega na Fase 4 (spec 001); até lá a rota existe e responde 501, sem criar execução.
export class LiveRunsNotAvailableError extends DomainError {
  constructor() {
    super({
      code: RUN_ERROR_CODE.LIVE_RUNS_NOT_AVAILABLE,
      message: 'A simulação ao vivo ainda não está disponível.',
      status: HTTP_STATUS.NOT_IMPLEMENTED,
    });
  }
}

// Pedido de walk-forward recusado ANTES de aceitar (grade grande, período curto, grade inválida): o código vem do
// motor e a mensagem só carrega contagens, nunca texto enviado pelo cliente.
export class WalkForwardRequestRejectedError extends DomainError {
  constructor(params: {
    readonly code: string;
    readonly message: string;
    readonly details: readonly ErrorDetail[];
  }) {
    super({ ...params, status: HTTP_STATUS.BAD_REQUEST });
  }
}
