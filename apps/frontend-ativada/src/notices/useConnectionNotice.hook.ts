// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useState } from 'react';

import { STREAM_STATUS, type StreamStatus } from '../live/stream.constant.js';
import { CONNECTION_NOTICE, type ConnectionNotice } from './notice-center.types.js';

type ConnectionParams = {
  readonly status: StreamStatus;
  // O socket voltou depois de a faixa aparecer: o que chegar agora vira um resumo.
  readonly onReturn: () => void;
  readonly stripMilliseconds: number;
};

// RF19: "reconectando" por mais de 5 s mostra a faixa "Avisos pausados"; parado ou bloqueado diz para entrar de novo.
export function useConnectionNotice(params: ConnectionParams): ConnectionNotice {
  const { status, onReturn, stripMilliseconds } = params;
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (status === STREAM_STATUS.RECONNECTING) {
      const timer = setTimeout(() => setIsPaused(true), stripMilliseconds);
      return (): void => clearTimeout(timer);
    }
    if (status === STREAM_STATUS.LIVE && isPaused) {
      setIsPaused(false);
      onReturn();
    }
    return undefined;
  }, [status, isPaused, onReturn, stripMilliseconds]);

  if (status === STREAM_STATUS.STOPPED || status === STREAM_STATUS.BLOCKED) {
    return CONNECTION_NOTICE.ENDED;
  }
  return isPaused ? CONNECTION_NOTICE.PAUSED : CONNECTION_NOTICE.OK;
}
