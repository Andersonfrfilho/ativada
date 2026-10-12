// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RunEvent } from '@ativada/database';

import { SERVER_MESSAGE_TYPE } from './stream.constant.js';
import type { StreamHub } from './stream-hub.js';

export type RunEventDispatcherParams = {
  readonly hub: StreamHub;
  readonly now: () => number;
  readonly reportError: (error: unknown) => void;
  // O dono vem do banco (a execução e a conta ativa), nunca do aviso: `undefined` = ninguém a quem entregar.
  readonly resolveOwner: (runId: string) => Promise<string | undefined>;
};

export type RunEventDispatcher = {
  readonly dispatch: (event: RunEvent) => Promise<void>;
};

export function createRunEventDispatcher(params: RunEventDispatcherParams): RunEventDispatcher {
  const lookups = new Map<string, Promise<string | undefined>>();

  // Vários avisos da mesma execução no mesmo instante (sinal, operação, saldo) dividem uma só consulta.
  function lookUpOwner(runId: string): Promise<string | undefined> {
    const pending = lookups.get(runId);
    if (pending !== undefined) return pending;
    const lookup = params.resolveOwner(runId).finally(() => lookups.delete(runId));
    lookups.set(runId, lookup);
    return lookup;
  }

  return {
    dispatch: async (event): Promise<void> => {
      try {
        const ownerUserId = await lookUpOwner(event.runId);
        if (ownerUserId === undefined) return;
        params.hub.sendToUser(ownerUserId, {
          type: SERVER_MESSAGE_TYPE.EVENT,
          runId: event.runId,
          kind: event.kind,
          eventId: event.eventId,
          at: params.now(),
        });
      } catch (error: unknown) {
        params.reportError(error);
      }
    },
  };
}
