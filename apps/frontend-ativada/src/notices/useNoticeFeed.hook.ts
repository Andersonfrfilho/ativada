// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useMemo } from 'react';

import type { Notice } from './notice.validation.js';
import { mergeNotices } from './notice-events.js';
import { usePriceNoticesQuery, useRunNoticesQuery } from './notices.query.js';

export type NoticeFeed = {
  readonly items: readonly Notice[];
  readonly runFirstPage: readonly Notice[] | undefined;
  readonly priceItems: readonly Notice[] | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly hasOlder: boolean;
  readonly isLoadingOlder: boolean;
  readonly loadOlder: () => void;
};

// As duas listas (simulações e alertas de preço) numa só, sem repetir aviso; só a primeira página de cada uma diz o que é novo.
export function useNoticeFeed(): NoticeFeed {
  const runs = useRunNoticesQuery();
  const prices = usePriceNoticesQuery();
  const runPages = runs.data?.pages;
  const items = useMemo(
    () => mergeNotices([...(runPages ?? []).map((page) => page.items), prices.data?.items ?? []]),
    [runPages, prices.data],
  );
  return {
    items,
    runFirstPage: runPages?.[0]?.items,
    priceItems: prices.data?.items,
    isLoading: runs.isPending,
    isError: runs.isError,
    hasOlder: runs.hasNextPage,
    isLoadingOlder: runs.isFetchingNextPage,
    loadOlder: () => void runs.fetchNextPage(),
  };
}
