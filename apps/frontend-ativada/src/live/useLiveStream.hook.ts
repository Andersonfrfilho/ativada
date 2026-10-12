// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useStreamConnector } from '../app/useAppContext.hook.js';
import { STREAM_STATUS, type StreamStatus } from './stream.constant.js';
import type { MarketTick, StreamMessage } from './stream-client.js';

export const LIVE_QUERY_ROOT = {
  RUNS: 'runs',
  PRICE_ALERTS: 'price-alerts',
} as const;

// O aviso só diz O QUE mudou; o painel rebusca por REST (a fonte da verdade) as consultas daquele assunto.
function refetchFor(queryClient: QueryClient, message: StreamMessage): void {
  const root = message.type === 'event' ? LIVE_QUERY_ROOT.RUNS : LIVE_QUERY_ROOT.PRICE_ALERTS;
  void queryClient.invalidateQueries({ queryKey: [root] });
}

// Abre o socket enquanto o painel autenticado está montado e devolve o estado da conexão.
export function useLiveStream(onTick: (tick: MarketTick) => void): StreamStatus {
  const connect = useStreamConnector();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StreamStatus>(STREAM_STATUS.CONNECTING);

  useEffect(() => {
    const connection = connect({
      onStatus: setStatus,
      onMessage: (message) => refetchFor(queryClient, message),
      onTick,
      onResync: () => void queryClient.invalidateQueries(),
    });
    return (): void => connection.stop();
  }, [connect, queryClient, onTick]);

  return status;
}
