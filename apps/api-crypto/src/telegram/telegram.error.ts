// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DomainError } from '../shared/errors/domain.error.js';
import { TELEGRAM_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';

export class TelegramWebhookRejectedError extends DomainError {
  constructor() {
    super({
      code: TELEGRAM_ERROR_CODE.TELEGRAM_WEBHOOK_REJECTED,
      message: 'Requisição recusada.',
      status: HTTP_STATUS.UNAUTHORIZED,
    });
  }
}
