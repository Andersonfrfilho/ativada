// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQuery } from '@tanstack/react-query';

import { RUN_STATUS } from '../overview/overview.constant.js';
import { useLiveRunsPageOptions } from '../overview/overview.query.js';

// A mesma página compartilhada da Visão geral (uma chave só): o menu não cria um pedido a mais.
export function useRunningLiveCount(): number {
  const query = useQuery({
    ...useLiveRunsPageOptions(),
    select: (runs) => runs.filter((run) => run.status === RUN_STATUS.RUNNING).length,
  });
  return query.data ?? 0;
}
