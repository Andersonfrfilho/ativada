// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OpenedCsvTable } from './csv-source.js';

export class CsvLimitExceededError extends Error {
  constructor(limit: 'rows' | 'duration') {
    super(`A exportação passou do teto de ${limit === 'rows' ? 'linhas' : 'tempo'}.`);
    this.name = 'CsvLimitExceededError';
  }
}

export type CsvStreamLimits = {
  readonly maxRows: number;
  readonly maxDurationMilliseconds: number;
  readonly now: () => number;
};

// Corpo em fluxo, uma página por vez: nunca a tabela inteira em memória. Passou do teto de linhas ou de tempo, o fluxo
// é ABORTADO (o cliente vê a falha) em vez de entregar um arquivo cortado que parece completo.
export function createCsvStream(
  table: OpenedCsvTable,
  limits: CsvStreamLimits,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const startedAt = limits.now();
  let rows = 0;
  return new ReadableStream<Uint8Array>({
    start(controller): void {
      controller.enqueue(encoder.encode(table.header));
    },
    async pull(controller): Promise<void> {
      try {
        if (limits.now() - startedAt > limits.maxDurationMilliseconds) {
          throw new CsvLimitExceededError('duration');
        }
        const page = await table.read();
        rows += page.lines.length;
        if (rows > limits.maxRows) throw new CsvLimitExceededError('rows');
        if (page.lines.length > 0) controller.enqueue(encoder.encode(page.lines.join('')));
        if (page.isLast) controller.close();
      } catch (error: unknown) {
        controller.error(error);
      }
    },
  });
}
