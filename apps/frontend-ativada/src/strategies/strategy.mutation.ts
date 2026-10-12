// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { HTTP_METHOD } from '@ativada/environment';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient } from '../app/useAppContext.hook.js';
import { STRATEGY_QUERY_ROOT } from './strategy.query.js';
import {
  addedVersionSchema,
  createdStrategySchema,
  strategyDetailSchema,
  type Strategy,
  type StrategyVersion,
} from './strategy.validation.js';

export type CreateStrategyInput = { readonly name: string; readonly config: unknown };
export type AddVersionInput = { readonly strategyId: string; readonly config: unknown };

export function useCreateStrategyMutation(): UseMutationResult<
  { strategy: Strategy; version: StrategyVersion },
  Error,
  CreateStrategyInput
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStrategyInput) =>
      client.request({
        method: HTTP_METHOD.POST,
        path: API_PATH.STRATEGIES,
        body: input,
        schema: createdStrategySchema,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [STRATEGY_QUERY_ROOT] }),
  });
}

export function useAddVersionMutation(): UseMutationResult<
  { version: StrategyVersion },
  Error,
  AddVersionInput
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddVersionInput) =>
      client.request({
        method: HTTP_METHOD.POST,
        path: `${API_PATH.STRATEGIES}/${input.strategyId}/versions`,
        body: { config: input.config },
        schema: addedVersionSchema,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [STRATEGY_QUERY_ROOT] }),
  });
}

export function useDeleteStrategyMutation(): UseMutationResult<void, Error, string> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (strategyId: string) =>
      client.requestEmpty({
        method: HTTP_METHOD.DELETE,
        path: `${API_PATH.STRATEGIES}/${strategyId}`,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [STRATEGY_QUERY_ROOT] }),
  });
}

const COPY_SUFFIX = ' (cópia)';
const NAME_ROOM = 70;

// Toda estratégia nasce de uma cópia (a API pede uma configuração completa): copia a versão mais nova da origem.
export function useDuplicateStrategyMutation(): UseMutationResult<
  { strategy: Strategy; version: StrategyVersion },
  Error,
  Strategy
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (source: Strategy) => {
      const detail = await client.request({
        path: `${API_PATH.STRATEGIES}/${source.id}`,
        schema: strategyDetailSchema,
      });
      if (detail.latestVersion === null)
        throw new Error('A estratégia não tem versão para copiar.');
      return client.request({
        method: HTTP_METHOD.POST,
        path: API_PATH.STRATEGIES,
        body: {
          name: `${source.name.slice(0, NAME_ROOM)}${COPY_SUFFIX}`,
          config: detail.latestVersion.config,
        },
        schema: createdStrategySchema,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [STRATEGY_QUERY_ROOT] }),
  });
}
