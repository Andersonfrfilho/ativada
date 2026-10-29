// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DomainError } from '../shared/errors/domain.error.js';
import { MODEL_TEAM_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';

// Chave fora do catálogo: o mesmo 404 de qualquer coisa que não existe para o usuário.
export class ModelTeamNotFoundError extends DomainError {
  constructor() {
    super({
      code: MODEL_TEAM_ERROR_CODE.MODEL_TEAM_NOT_FOUND,
      message: 'Equipe de modelo não encontrada.',
      status: HTTP_STATUS.NOT_FOUND,
    });
  }
}

export class DuelNotFoundError extends DomainError {
  constructor() {
    super({
      code: MODEL_TEAM_ERROR_CODE.DUEL_NOT_FOUND,
      message: 'Duelo não encontrado.',
      status: HTTP_STATUS.NOT_FOUND,
    });
  }
}

// A equipe existe, mas o usuário não a ligou nas preferências (custo é opt-in).
export class ModelTeamDisabledError extends DomainError {
  constructor() {
    super({
      code: MODEL_TEAM_ERROR_CODE.MODEL_TEAM_DISABLED,
      message: 'Esta equipe está desligada. Ligue-a nas preferências para usá-la.',
      status: HTTP_STATUS.CONFLICT,
    });
  }
}

// O provedor não pode responder agora (sem chave, teto de custo, circuito aberto, chave recusada, modelo indisponível).
export class ModelTeamUnavailableError extends DomainError {
  constructor() {
    super({
      code: MODEL_TEAM_ERROR_CODE.MODEL_TEAM_UNAVAILABLE,
      message: 'Esta equipe não pode responder agora; veja o estado dela e tente mais tarde.',
      status: HTTP_STATUS.CONFLICT,
    });
  }
}

export class ModelOpinionLimitReachedError extends DomainError {
  constructor() {
    super({
      code: MODEL_TEAM_ERROR_CODE.MODEL_OPINION_LIMIT_REACHED,
      message: 'Você usou todos os pedidos de opinião avulsa de hoje. Tente amanhã.',
      status: HTTP_STATUS.TOO_MANY_REQUESTS,
    });
  }
}

export class ModelQuestionLimitReachedError extends DomainError {
  constructor() {
    super({
      code: MODEL_TEAM_ERROR_CODE.MODEL_QUESTION_LIMIT_REACHED,
      message: 'Você usou todas as perguntas livres de hoje. Tente amanhã.',
      status: HTTP_STATUS.TOO_MANY_REQUESTS,
    });
  }
}
