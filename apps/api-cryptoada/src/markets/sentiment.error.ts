// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DomainError } from '../shared/errors/domain.error.js';
import { SENTIMENT_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';

export class SentimentUnavailableError extends DomainError {
  constructor() {
    super({
      code: SENTIMENT_ERROR_CODE.SENTIMENT_UNAVAILABLE,
      message: 'O índice Fear & Greed ainda não foi coletado.',
      status: HTTP_STATUS.NOT_FOUND,
    });
  }
}
