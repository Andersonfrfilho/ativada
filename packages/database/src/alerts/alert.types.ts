// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer, JsonValue } from '../json-value.types.js';
import type { AlertSide } from './alert.constant.js';

// O que o passo do candle enfileira: o conteúdo é montado pelo worker, que é quem conhece o texto do alerta.
export type AlertInput = {
  readonly candleTime: number;
  readonly side: AlertSide;
  readonly payload: JsonContainer;
};

export type ClaimAlertsParams = {
  readonly now: Date;
  readonly limit: number;
  readonly leaseMilliseconds: number;
};

// `chatId` vem de `users` NO MOMENTO do envio e só existe com conta ativa, vínculo e alertas ligados; nunca é copiado
// para `alerts`. `attempts` já conta esta tentativa.
export type ClaimedAlert = {
  readonly id: string;
  readonly runId: string;
  readonly candleTime: number;
  readonly side: AlertSide;
  readonly payload: JsonValue;
  readonly attempts: number;
  readonly chatId: string | undefined;
};

export type MarkAlertParams = { readonly alertId: string; readonly now: Date };

export type RescheduleAlertParams = {
  readonly alertId: string;
  readonly nextAttemptAt: Date;
  readonly errorCode: string;
};

export type CloseAlertParams = { readonly alertId: string; readonly errorCode: string };

// Sem `OwnerScope`: quem entrega é o processo do worker, que lê o chat do dono da PRÓPRIA linha do alerta.
export type AlertRepository = {
  // Reivindica os alertas vencidos (`FOR UPDATE SKIP LOCKED` + arrendamento): dois despachantes nunca pegam o mesmo.
  readonly claimDue: (params: ClaimAlertsParams) => Promise<readonly ClaimedAlert[]>;
  readonly markSent: (params: MarkAlertParams) => Promise<void>;
  readonly reschedule: (params: RescheduleAlertParams) => Promise<void>;
  readonly markFailed: (params: CloseAlertParams) => Promise<void>;
  readonly markSkipped: (params: CloseAlertParams) => Promise<void>;
};
