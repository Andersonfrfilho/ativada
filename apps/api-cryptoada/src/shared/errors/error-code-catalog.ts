// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ACCOUNT_ERROR_CODE,
  ADMIN_ERROR_CODE,
  AUTHENTICATION_ERROR_CODE,
  FEATURE_ERROR_CODE,
  GOAL_ERROR_CODE,
  INTERNAL_ERROR_CODE,
  PRICE_ALERT_ERROR_CODE,
  PROFILE_ERROR_CODE,
  RATE_LIMIT_ERROR_CODE,
  ROUTING_ERROR_CODE,
  RUN_ERROR_CODE,
  SESSION_ERROR_CODE,
  STRATEGY_ERROR_CODE,
  TELEGRAM_ERROR_CODE,
  USER_ASSET_ERROR_CODE,
  VALIDATION_ERROR_CODE,
} from './error-code.constant.js';

// Todo código de erro que a API pode responder. O OpenAPI só documenta código deste conjunto: documentar um código
// que nenhuma rota devolve é o defeito que o contrato do documento procura.
export const ERROR_CODE_CATALOG: ReadonlySet<string> = new Set([
  ...Object.values(ACCOUNT_ERROR_CODE),
  ...Object.values(ADMIN_ERROR_CODE),
  ...Object.values(AUTHENTICATION_ERROR_CODE),
  ...Object.values(FEATURE_ERROR_CODE),
  ...Object.values(GOAL_ERROR_CODE),
  ...Object.values(PRICE_ALERT_ERROR_CODE),
  ...Object.values(PROFILE_ERROR_CODE),
  ...Object.values(RATE_LIMIT_ERROR_CODE),
  ...Object.values(ROUTING_ERROR_CODE),
  ...Object.values(RUN_ERROR_CODE),
  ...Object.values(SESSION_ERROR_CODE),
  ...Object.values(STRATEGY_ERROR_CODE),
  ...Object.values(TELEGRAM_ERROR_CODE),
  ...Object.values(USER_ASSET_ERROR_CODE),
  ...Object.values(VALIDATION_ERROR_CODE),
  INTERNAL_ERROR_CODE,
]);
