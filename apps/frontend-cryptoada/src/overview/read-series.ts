// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { z } from '@cryptoada/environment';

import type { ApiClient } from '../http/api-client.js';
import { MAX_SERIES_PAGES, PAGE_SIZE } from './overview.constant.js';

export type ReadSeriesParams<TItem> = {
  readonly client: ApiClient;
  readonly path: string;
  readonly schema: z.ZodType<TItem>;
};

// A paginação por cursor é inerentemente sequencial: cada página só se conhece depois da anterior.
export async function readSeries<TItem>(params: ReadSeriesParams<TItem>): Promise<TItem[]> {
  const items: TItem[] = [];
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < MAX_SERIES_PAGES; pageNumber += 1) {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor !== null) query.set('cursor', cursor);
    const page = await params.client.requestPage({
      path: `${params.path}?${query.toString()}`,
      schema: params.schema,
    });
    items.push(...page.items);
    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  return items;
}
