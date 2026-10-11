// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createNotificationListener,
  type ListeningEvent,
  type NotificationListener,
  type NotificationListenerSettings,
} from '../notifications/notification-listener.js';
import type { SessionEnd } from '../notifications/session-end.js';
import { RUN_EVENTS_CHANNEL } from './run-event.constant.js';
import {
  parsePriceAlertEventPayload,
  parseRunEventPayload,
  type PriceAlertEvent,
  type RunEvent,
} from './run-event.schema.js';

export type RunEventListenerSettings = Pick<
  NotificationListenerSettings,
  | 'databaseUrl'
  | 'onHandlerError'
  | 'openTransport'
  | 'reconnectBaseMilliseconds'
  | 'reconnectMaxMilliseconds'
  | 'keepAliveMilliseconds'
  | 'random'
  | 'sleep'
> & {
  readonly onEvent: (event: RunEvent) => void;
  // O disparo de um alerta de preço (T4b.7): sem ouvinte, o aviso é ignorado em silêncio.
  readonly onPriceAlert?: ((event: PriceAlertEvent) => void) | undefined;
  // Aviso que não casa com `{ runId, kind, eventId }`: descartado e contado, sem eco do texto.
  readonly onMalformed: () => void;
  readonly onListening: (event: ListeningEvent) => void;
  readonly onLost: (end: SessionEnd) => void;
};

// A API escuta o canal dos passos ao vivo; `ready` só resolve com o LISTEN confirmado pelo servidor.
export function createRunEventListener(settings: RunEventListenerSettings): NotificationListener {
  const { onEvent, onPriceAlert, onMalformed, ...passthrough } = settings;
  return createNotificationListener({
    ...passthrough,
    channel: RUN_EVENTS_CHANNEL,
    onNotification: (payload) => {
      const event = parseRunEventPayload(payload);
      if (event !== undefined) return onEvent(event);
      const priceAlert = parsePriceAlertEventPayload(payload);
      if (priceAlert === undefined) onMalformed();
      else onPriceAlert?.(priceAlert);
    },
  });
}
