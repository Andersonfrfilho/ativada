// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { HTTP_METHOD } from '@ativada/environment';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient, useAppConfig } from '../app/useAppContext.hook.js';
import { useLiveMarket } from '../live/useLiveMarket.hook.js';
import { FALLBACK_POLL_MILLISECONDS } from '../overview/overview.constant.js';
import { ASSET_OPERATION, ASSET_QUERY_ROOT, type AssetOperation } from './asset.constant.js';
import { assetSummarySchema, savedAssetSchema, type AssetSummary } from './asset.validation.js';

// Com o socket vivo o preço de cada ativo vem pelos ticks; fora dele (ou velho) o resumo é consultado de novo a cada 15 s.
export function useAssetSummaryQuery(
  strategyId: string,
  isEnabled: boolean,
): UseQueryResult<AssetSummary> {
  const client = useApiClient();
  const { fallbackPollMilliseconds = FALLBACK_POLL_MILLISECONDS } = useAppConfig();
  const market = useLiveMarket();
  return useQuery({
    queryKey: [ASSET_QUERY_ROOT, 'summary', strategyId],
    enabled: isEnabled,
    // O resumo é refeito por REST se o socket cai ou se QUALQUER ativo cujo par ficou mudo dependa do preço do servidor.
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const hasSilentAsset = items.some((item) => market.freshPrice(item.symbol) === undefined);
      return hasSilentAsset || market.state !== 'live' ? fallbackPollMilliseconds : false;
    },
    queryFn: () => {
      const query = strategyId === '' ? '' : `?${new URLSearchParams({ strategyId }).toString()}`;
      return client.request({
        path: `${API_PATH.ASSETS_SUMMARY}${query}`,
        schema: assetSummarySchema,
      });
    },
  });
}

export type AssetOperationInput = {
  readonly operation: AssetOperation;
  readonly symbol: string;
  readonly quantity: string;
  readonly price: string;
};

function buildOperationRequest(input: AssetOperationInput): {
  readonly method: string;
  readonly body: Record<string, string>;
} {
  if (input.operation === ASSET_OPERATION.REPLACE) {
    return {
      method: HTTP_METHOD.PUT,
      body: { quantity: input.quantity, averagePrice: input.price },
    };
  }
  if (input.operation === ASSET_OPERATION.SELL) {
    return { method: HTTP_METHOD.PATCH, body: { side: 'sell', quantity: input.quantity } };
  }
  return {
    method: HTTP_METHOD.PATCH,
    body: { side: 'buy', quantity: input.quantity, price: input.price },
  };
}

export function useAssetOperationMutation(): UseMutationResult<
  { symbol: string },
  Error,
  AssetOperationInput
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssetOperationInput) =>
      client.request({
        ...buildOperationRequest(input),
        path: `${API_PATH.ASSETS}/${input.symbol}`,
        schema: savedAssetSchema,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ASSET_QUERY_ROOT] }),
  });
}

export function useDeleteAssetMutation(): UseMutationResult<void, Error, string> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (symbol: string) =>
      client.requestEmpty({ method: HTTP_METHOD.DELETE, path: `${API_PATH.ASSETS}/${symbol}` }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ASSET_QUERY_ROOT] }),
  });
}
