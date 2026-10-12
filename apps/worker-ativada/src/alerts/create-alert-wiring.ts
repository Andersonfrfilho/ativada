// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createAlertRepository, type DatabaseHandle } from '@ativada/database';
import { MILLISECONDS_PER_SECOND } from '@ativada/environment';

import { LIVE_ALERT_MAX_AGE_CANDLES } from '../live/live.constant.js';
import type { LiveAlertingSettings } from '../live/live-run.types.js';
import type { WorkerLogger } from '../logging/worker-logger.js';
import { createAlertDispatcher } from './alert-dispatcher.js';
import { createAlertScheduler, type AlertScheduler } from './alert-scheduler.js';
import { createTelegramClient } from './telegram-client.js';

export type AlertEnvironment = {
  readonly TELEGRAM_BOT_TOKEN?: string | undefined;
  readonly TELEGRAM_API_BASE_URL: string;
  readonly ALERT_POLL_SECONDS: number;
  readonly ALERT_TELEGRAM_DAILY_LIMIT_PER_USER: number;
};

export type AlertWiring = {
  // Entrega ao avaliador ao vivo: ausente = o passo não enfileira alerta nenhum.
  readonly alerting: LiveAlertingSettings | undefined;
  readonly scheduler: AlertScheduler | undefined;
};

export type CreateAlertWiringParams = {
  readonly environment: AlertEnvironment;
  readonly database: DatabaseHandle;
  readonly logger: WorkerLogger;
};

// Sem token do bot o recurso inteiro fica desligado: nenhum alerta é enfileirado e nenhum despachante sobe.
export function createAlertWiring(params: CreateAlertWiringParams): AlertWiring {
  const { environment, database, logger } = params;
  const botToken = environment.TELEGRAM_BOT_TOKEN;
  if (botToken === undefined) return { alerting: undefined, scheduler: undefined };
  return {
    alerting: { now: Date.now, maxAgeCandles: LIVE_ALERT_MAX_AGE_CANDLES },
    scheduler: createAlertScheduler({
      logger,
      pollMilliseconds: environment.ALERT_POLL_SECONDS * MILLISECONDS_PER_SECOND,
      dispatcher: createAlertDispatcher({
        alerts: createAlertRepository(database),
        client: createTelegramClient({ apiBaseUrl: environment.TELEGRAM_API_BASE_URL, botToken }),
        logger,
        now: Date.now,
        dailyLimitPerUser: environment.ALERT_TELEGRAM_DAILY_LIMIT_PER_USER,
      }),
    }),
  };
}
