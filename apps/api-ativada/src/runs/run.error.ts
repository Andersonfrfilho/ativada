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

export class RunNotFinishedError extends DomainError {
  constructor() {
    super({
      code: RUN_ERROR_CODE.RUN_NOT_FINISHED,
      message: 'A execução ainda não terminou: pare-a antes de apagá-la.',
      status: HTTP_STATUS.CONFLICT,
    });
  }
}

// O acompanhamento (live-status e decisions) só existe para a simulação ao vivo; backtest e walk-forward têm o resumo da spec 005.
export class RunNotLiveError extends DomainError {
  constructor() {
    super({
      code: RUN_ERROR_CODE.RUN_NOT_LIVE,
      message: 'O acompanhamento só existe para simulações ao vivo.',
      status: HTTP_STATUS.CONFLICT,
    });
  }
}

export class RunStorageQuotaReachedError extends DomainError {
  constructor() {
    super({
      code: RUN_ERROR_CODE.RUN_STORAGE_QUOTA_REACHED,
      message: 'Você atingiu o limite de execuções guardadas. Apague uma antiga para criar outra.',
      status: HTTP_STATUS.CONFLICT,
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

// A fila de execuções do usuário está cheia (`RUN_QUEUE_PER_USER_LIMIT`): nada é criado.
export class RunQueueFullError extends DomainError {
  constructor() {
    super({
      code: RUN_ERROR_CODE.RUN_QUEUE_FULL,
      message: 'A fila de execuções está cheia; aguarde alguma terminar ou cancele uma.',
      status: HTTP_STATUS.TOO_MANY_REQUESTS,
    });
  }
}

// Simulações ao vivo ativas no teto do usuário (`users.limits`, RF00b).
export class LiveRunLimitReachedError extends DomainError {
  constructor() {
    super({
      code: RUN_ERROR_CODE.LIVE_RUN_LIMIT_REACHED,
      message:
        'O limite de simulações ao vivo ativas foi atingido; encerre alguma antes de criar outra.',
      status: HTTP_STATUS.CONFLICT,
    });
  }
}
