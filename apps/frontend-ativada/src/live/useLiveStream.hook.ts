// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useStreamConnector } from '../app/useAppContext.hook.js';
import { STREAM_STATUS, type StreamStatus } from './stream.constant.js';
import { createRefetchScheduler } from './refetch-scheduler.js';
import type { MarketTick, StreamMessage } from './stream-client.js';
import type { StreamCandle } from './stream.validation.js';

export const LIVE_QUERY_ROOT = {
  RUNS: 'runs',
  PRICE_ALERTS: 'price-alerts',
} as const;

// O aviso só diz O QUE mudou; o painel rebusca por REST (a fonte da verdade) as consultas daquele assunto.
function rootOf(message: StreamMessage): string {
  return message.type === 'event' ? LIVE_QUERY_ROOT.RUNS : LIVE_QUERY_ROOT.PRICE_ALERTS;
}

// Abre o socket enquanto o painel autenticado está montado e devolve o estado da conexão.
export function useLiveStream(
  onTick: (tick: MarketTick) => void,
  onCandle: (candle: StreamCandle) => void,
): StreamStatus {
  const connect = useStreamConnector();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StreamStatus>(STREAM_STATUS.CONNECTING);

  useEffect(() => {
    const scheduler = createRefetchScheduler(queryClient);
    const connection = connect({
      onStatus: setStatus,
      onMessage: (message) => scheduler.schedule(rootOf(message)),
      onTick,
      onCandle,
      onResync: () => void queryClient.invalidateQueries(),
    });
    return (): void => {
      scheduler.cancel();
      connection.stop();
    };
  }, [connect, queryClient, onTick, onCandle]);

  return status;
}
