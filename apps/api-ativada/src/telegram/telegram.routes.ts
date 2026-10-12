// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { FeatureDisabledError } from '../shared/errors/feature-disabled.error.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import { readJsonBody } from '../shared/http/read-validated-body.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { TELEGRAM_DOCUMENTATION } from './telegram.docs.js';
import type { HandleStartCommandUseCase } from './handle-start-command.use-case.js';
import { TelegramWebhookRejectedError } from './telegram.error.js';
import {
  TELEGRAM_LINK_PATH,
  TELEGRAM_WEBHOOK_PATH,
  WEBHOOK_SECRET_HEADER,
} from './telegram.constant.js';
import type { IssueLinkCodeUseCase, UnlinkTelegramUseCase } from './telegram-link.use-case.js';
import { readStartCommand, telegramUpdateSchema } from './telegram-update.schema.js';
import { isWebhookSecretValid } from './webhook-secret.js';

export type TelegramWebhookDependencies = {
  readonly secret: string;
  readonly handleStartCommand: HandleStartCommandUseCase;
};

export type TelegramRouteDependencies = {
  readonly unlinkTelegram: UnlinkTelegramUseCase;
  readonly issueLinkCode: IssueLinkCodeUseCase | undefined;
  readonly webhook: TelegramWebhookDependencies | undefined;
};

function createLinkRoutes(dependencies: TelegramRouteDependencies): readonly Route[] {
  return [
    {
      method: HTTP_METHOD.POST,
      path: TELEGRAM_LINK_PATH,
      access: ROUTE_ACCESS.USER,
      rateLimitPolicy: RATE_LIMIT_POLICY.TELEGRAM_LINK_CODE_ISSUE,
      documentation: TELEGRAM_DOCUMENTATION.issueLinkCode,
      handler: async ({ scope }): Promise<RouteResult> => {
        if (dependencies.issueLinkCode === undefined) throw new FeatureDisabledError();
        return { status: HTTP_STATUS.CREATED, data: await dependencies.issueLinkCode(scope) };
      },
    },
    {
      method: HTTP_METHOD.DELETE,
      path: TELEGRAM_LINK_PATH,
      access: ROUTE_ACCESS.USER,
      documentation: TELEGRAM_DOCUMENTATION.unlink,
      handler: async ({ scope }): Promise<RouteResult> => {
        await dependencies.unlinkTelegram(scope);
        return { status: HTTP_STATUS.NO_CONTENT };
      },
    },
  ];
}

function createWebhookRoute(webhook: TelegramWebhookDependencies): Route {
  return {
    method: HTTP_METHOD.POST,
    path: TELEGRAM_WEBHOOK_PATH,
    access: ROUTE_ACCESS.PUBLIC,
    rateLimitPolicy: RATE_LIMIT_POLICY.TELEGRAM_WEBHOOK_CLIENT_ADDRESS,
    documentation: TELEGRAM_DOCUMENTATION.webhook,
    handler: async ({ request }): Promise<RouteResult> => {
      if (!isWebhookSecretValid(request.headers.get(WEBHOOK_SECRET_HEADER), webhook.secret)) {
        throw new TelegramWebhookRejectedError();
      }
      // O Telegram reentrega respostas não-2xx: só JSON inválido é 400, o resto de update é ignorado.
      const update = telegramUpdateSchema.safeParse(await readJsonBody(request));
      const command = update.success ? readStartCommand(update.data) : undefined;
      if (command !== undefined) await webhook.handleStartCommand(command);
      return { status: HTTP_STATUS.OK, data: { received: true } };
    },
  };
}

export function createTelegramRoutes(dependencies: TelegramRouteDependencies): readonly Route[] {
  const webhookRoutes =
    dependencies.webhook === undefined ? [] : [createWebhookRoute(dependencies.webhook)];
  return [...createLinkRoutes(dependencies), ...webhookRoutes];
}
