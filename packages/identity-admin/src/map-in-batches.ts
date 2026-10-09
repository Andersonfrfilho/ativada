// Copyright (c) 2026 Ada Technology. All rights reserved.

// Lotes em série de tamanho fixo: limita as chamadas em voo ao Keycloak e isola a falha de cada item.
export async function mapInBatches<TItem, TResult>(
  items: readonly TItem[],
  batchSize: number,
  task: (item: TItem) => Promise<TResult>,
): Promise<PromiseSettledResult<TResult>[]> {
  const results: PromiseSettledResult<TResult>[] = [];
  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize);
    results.push(...(await Promise.allSettled(batch.map(task))));
  }
  return results;
}
