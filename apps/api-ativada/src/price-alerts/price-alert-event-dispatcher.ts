// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { PriceAlertEvent } from '@ativada/database';

import { SERVER_MESSAGE_TYPE } from '../stream/stream.constant.js';
import type { StreamHub } from '../stream/stream-hub.js';

export type PriceAlertEventDispatcherParams = {
  readonly hub: StreamHub;
  readonly now: () => number;
  readonly reportError: (error: unknown) => void;
  // O dono vem do banco (o alerta e a conta ativa), nunca do aviso: `undefined` = ninguém a quem entregar.
  readonly resolveOwner: (alertId: string) => Promise<string | undefined>;
};

export type PriceAlertEventDispatcher = {
  readonly dispatch: (event: PriceAlertEvent) => Promise<void>;
};

// O disparo de um alerta de preço chega ao painel do DONO (e a mais ninguém): o aviso do banco é só o ponteiro.
export function createPriceAlertEventDispatcher(
  params: PriceAlertEventDispatcherParams,
): PriceAlertEventDispatcher {
  return {
    dispatch: async (event): Promise<void> => {
      try {
        const ownerUserId = await params.resolveOwner(event.alertId);
        if (ownerUserId === undefined) return;
        params.hub.sendToUser(ownerUserId, {
          type: SERVER_MESSAGE_TYPE.PRICE_ALERT,
          alertId: event.alertId,
          at: params.now(),
        });
      } catch (error: unknown) {
        params.reportError(error);
      }
    },
  };
}
