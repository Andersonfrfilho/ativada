// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DomainError } from '../shared/errors/domain.error.js';
import { USER_ASSET_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';

// Ativo alheio e ativo inexistente respondem IGUAL (ADR 0001 §e): mesmo status, código, mensagem e tamanho.
export class AssetNotFoundError extends DomainError {
  constructor() {
    super({
      code: USER_ASSET_ERROR_CODE.ASSET_NOT_FOUND,
      message: 'Ativo não encontrado.',
      status: HTTP_STATUS.NOT_FOUND,
    });
  }
}

export class AssetLimitReachedError extends DomainError {
  constructor() {
    super({
      code: USER_ASSET_ERROR_CODE.ASSET_LIMIT_REACHED,
      message: 'Você atingiu o limite de ativos. Apague um para cadastrar outro.',
      status: HTTP_STATUS.CONFLICT,
    });
  }
}

export class AssetInsufficientQuantityError extends DomainError {
  constructor() {
    super({
      code: USER_ASSET_ERROR_CODE.ASSET_INSUFFICIENT_QUANTITY,
      message: 'A venda é maior que a quantidade que você tem deste ativo.',
      status: HTTP_STATUS.CONFLICT,
    });
  }
}
