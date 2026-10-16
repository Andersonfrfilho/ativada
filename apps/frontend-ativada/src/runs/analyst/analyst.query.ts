// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { HTTP_STATUS } from '@ativada/environment';

import { API_PATH } from '../../app/app.constant.js';
import { useApiClient } from '../../app/useAppContext.hook.js';
import { ApiError } from '../../http/api.error.js';
import type { Page } from '../../http/api-client.js';
import { RUN_QUERY_ROOT } from '../runs.query.js';
import {
  analystDecisionSchema,
  analystSchema,
  type Analyst,
  type AnalystDecision,
} from './analyst.validation.js';

export const ANALYST_NOT_ENABLED_CODE = 'ANALYST_NOT_ENABLED';
export const ANALYST_DECISIONS_PAGE_SIZE = 24;
const FIRST_PAGE: string | null = null;

// `disabled`: a simulação foi criada sem o analista (409 `ANALYST_NOT_ENABLED`): nenhum cartão, nenhum erro.
export type AnalystSnapshot =
  { readonly isEnabled: false } | { readonly isEnabled: true; readonly analyst: Analyst };

// Sem analista (409 `ANALYST_NOT_ENABLED`) ou sem a rota (404): o cartão simplesmente não aparece.
function isNotEnabled(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === HTTP_STATUS.NOT_FOUND) return true;
  return error.status === HTTP_STATUS.CONFLICT && error.code === ANALYST_NOT_ENABLED_CODE;
}

// Sob a raiz `runs`: o aviso `analyst` do stream ao vivo refaz a consulta junto com o acompanhamento, sem cache próprio.
export function useAnalystQuery(runId: string): UseQueryResult<AnalystSnapshot> {
  const client = useApiClient();
  return useQuery({
    queryKey: [RUN_QUERY_ROOT, runId, 'analyst'],
    queryFn: async (): Promise<AnalystSnapshot> => {
      try {
        const analyst = await client.request({
          path: `${API_PATH.RUNS}/${runId}/analyst`,
          schema: analystSchema,
        });
        return { isEnabled: true, analyst };
      } catch (error: unknown) {
        if (isNotEnabled(error)) return { isEnabled: false };
        throw error;
      }
    },
  });
}

// "Ver decisões anteriores": da mais nova à mais velha, por cursor; a primeira página também alimenta a sala da equipe.
export function useAnalystDecisionsQuery(
  runId: string,
  isEnabled: boolean,
): UseInfiniteQueryResult<InfiniteData<Page<AnalystDecision>, string | null>> {
  const client = useApiClient();
  return useInfiniteQuery({
    queryKey: [RUN_QUERY_ROOT, runId, 'analyst-decisions'],
    enabled: isEnabled,
    initialPageParam: FIRST_PAGE,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: String(ANALYST_DECISIONS_PAGE_SIZE) });
      if (pageParam !== null) query.set('cursor', pageParam);
      return client.requestPage({
        path: `${API_PATH.RUNS}/${runId}/analyst/decisions?${query.toString()}`,
        schema: analystDecisionSchema,
      });
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
