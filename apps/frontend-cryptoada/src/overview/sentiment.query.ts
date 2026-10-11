// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { z } from '@cryptoada/environment';

import { useApiClient } from '../app/useAppContext.hook.js';

const SENTIMENT_PATH = '/v1/market/sentiment';
const DAY_MILLISECONDS = 86_400_000;

export const sentimentSchema = z.object({
  fearGreed: z.number(),
  classification: z.string().nullable(),
  date: z.string(),
  source: z.object({ name: z.string(), creditText: z.string(), url: z.string() }),
});

export type Sentiment = z.infer<typeof sentimentSchema>;

// O índice é diário: consultar de novo a cada hora é mais que suficiente.
export function useSentimentQuery(): UseQueryResult<Sentiment> {
  const client = useApiClient();
  return useQuery({
    queryKey: ['markets', 'sentiment'],
    staleTime: DAY_MILLISECONDS / 24,
    queryFn: () => client.request({ path: SENTIMENT_PATH, schema: sentimentSchema }),
  });
}
