// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient } from '../app/useAppContext.hook.js';
import {
  HORIZON_PARAM,
  HORIZON_QUERY_ROOT,
  HORIZON_STALE_MILLISECONDS,
} from './horizon.constant.js';
import { horizonsSchema, type Horizons } from './horizon.validation.js';

export type HorizonsRequest = { readonly symbol: string; readonly strategyId: string | undefined };

function buildPath({ symbol, strategyId }: HorizonsRequest): string {
  const query = new URLSearchParams({ [HORIZON_PARAM.SYMBOL]: symbol });
  if (strategyId !== undefined) query.set(HORIZON_PARAM.STRATEGY, strategyId);
  return `${API_PATH.HORIZONS}?${query.toString()}`;
}

export function useHorizonsQuery(request: HorizonsRequest): UseQueryResult<Horizons> {
  const client = useApiClient();
  return useQuery({
    queryKey: [HORIZON_QUERY_ROOT, request.symbol, request.strategyId ?? null],
    staleTime: HORIZON_STALE_MILLISECONDS,
    enabled: request.symbol !== '',
    queryFn: () => client.request({ path: buildPath(request), schema: horizonsSchema }),
  });
}
