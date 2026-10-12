// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { createAlertDispatcher } from '../../../apps/worker-ativada/src/alerts/alert-dispatcher.js';
import type { createAlertScheduler } from '../../../apps/worker-ativada/src/alerts/alert-scheduler.js';
import type { formatAlertMessage } from '../../../apps/worker-ativada/src/alerts/format-alert-message.js';
import type { formatGoalAlertMessage } from '../../../apps/worker-ativada/src/alerts/format-goal-alert-message.js';
import type { formatPriceAlertMessage } from '../../../apps/worker-ativada/src/alerts/format-price-alert-message.js';
import type { createTelegramClient } from '../../../apps/worker-ativada/src/alerts/telegram-client.js';

const PRODUCTION_SOURCE = new URL('../../../apps/worker-ativada/src/alerts', import.meta.url)
  .pathname;

// Os testes do despachante rodam contra a produção; o teste de mutantes os relança num processo à parte apontando esta
// variável para uma cópia mutada do módulo.
export const ALERTS_MUTANT_VARIABLE = 'ALERTS_MUTANT_SOURCE';

export type AlertsApi = {
  readonly createAlertDispatcher: typeof createAlertDispatcher;
  readonly createAlertScheduler: typeof createAlertScheduler;
  readonly createTelegramClient: typeof createTelegramClient;
  readonly formatAlertMessage: typeof formatAlertMessage;
  readonly formatGoalAlertMessage: typeof formatGoalAlertMessage;
  readonly formatPriceAlertMessage: typeof formatPriceAlertMessage;
};

export function resolveAlertsSource(): string {
  return Bun.env[ALERTS_MUTANT_VARIABLE] ?? PRODUCTION_SOURCE;
}

function readMember(module: unknown, name: string): unknown {
  if (typeof module !== 'object' || module === null) return undefined;
  return Object.getOwnPropertyDescriptor(module, name)?.value;
}

async function loadMember(file: string, name: string): Promise<unknown> {
  const member = readMember(await import(`${resolveAlertsSource()}/${file}`), name);
  if (typeof member !== 'function') throw new Error(`Módulo de alertas sem ${name}.`);
  return member;
}

export async function loadAlertsApi(): Promise<AlertsApi> {
  return {
    createAlertDispatcher: (await loadMember(
      'alert-dispatcher.ts',
      'createAlertDispatcher',
    )) as AlertsApi['createAlertDispatcher'],
    createAlertScheduler: (await loadMember(
      'alert-scheduler.ts',
      'createAlertScheduler',
    )) as AlertsApi['createAlertScheduler'],
    createTelegramClient: (await loadMember(
      'telegram-client.ts',
      'createTelegramClient',
    )) as AlertsApi['createTelegramClient'],
    formatAlertMessage: (await loadMember(
      'format-alert-message.ts',
      'formatAlertMessage',
    )) as AlertsApi['formatAlertMessage'],
    formatGoalAlertMessage: (await loadMember(
      'format-goal-alert-message.ts',
      'formatGoalAlertMessage',
    )) as AlertsApi['formatGoalAlertMessage'],
    formatPriceAlertMessage: (await loadMember(
      'format-price-alert-message.ts',
      'formatPriceAlertMessage',
    )) as AlertsApi['formatPriceAlertMessage'],
  };
}

export type AlertConstants = {
  readonly ALERT_BATCH_SIZE: number;
  readonly ALERT_LEASE_MILLISECONDS: number;
  readonly ALERT_MAX_ATTEMPTS: number;
  readonly ALERT_REQUEST_TIMEOUT_MILLISECONDS: number;
};

// As constantes do despacho vivem na cópia mutável: o teste que as relaciona (arrendamento × lote × prazo) as lê de lá.
export async function loadAlertConstants(): Promise<AlertConstants> {
  const module: unknown = await import(`${resolveAlertsSource()}/alerts.constant.ts`);
  const read = (name: keyof AlertConstants): number => {
    const value = readMember(module, name);
    if (typeof value !== 'number') throw new Error(`Constante ${name} ausente.`);
    return value;
  };
  return {
    ALERT_BATCH_SIZE: read('ALERT_BATCH_SIZE'),
    ALERT_LEASE_MILLISECONDS: read('ALERT_LEASE_MILLISECONDS'),
    ALERT_MAX_ATTEMPTS: read('ALERT_MAX_ATTEMPTS'),
    ALERT_REQUEST_TIMEOUT_MILLISECONDS: read('ALERT_REQUEST_TIMEOUT_MILLISECONDS'),
  };
}
