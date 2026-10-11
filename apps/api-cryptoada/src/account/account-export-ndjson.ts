// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AccountExportChunk } from '@cryptoada/database';

export type AccountExportBodyParams = {
  readonly exportedAt: string;
  readonly account: Readonly<Record<string, unknown>>;
  readonly chunks: AsyncIterable<AccountExportChunk>;
};

const AUDIT_COUNT_KEY = {
  asActor: 'audit_events_as_actor',
  asTarget: 'audit_events_as_target',
} as const;

function line(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function linesOf(chunk: AccountExportChunk): string {
  if (chunk.kind === 'rows') {
    return chunk.rows.map((row) => line({ type: 'row', table: chunk.table, row })).join('');
  }
  return chunk.rows.map((row) => line({ type: 'audit', audience: chunk.audience, row })).join('');
}

function countKeyOf(chunk: AccountExportChunk): string {
  return chunk.kind === 'rows' ? chunk.table : AUDIT_COUNT_KEY[chunk.audience];
}

// NDJSON em fluxo, UMA página por `pull`: cabeçalho, uma linha por registro e, no fim, a linha `end` com as contagens (o
// arquivo cortado não a tem, então quem importa sabe que está incompleto). Falha no meio ABORTA o fluxo em vez de fechar
// um arquivo que parece completo; o cliente que desiste cancela a leitura do banco.
export function createAccountExportBody(
  params: AccountExportBodyParams,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = params.chunks[Symbol.asyncIterator]();
  const counts: Record<string, number> = {};
  return new ReadableStream<Uint8Array>({
    start(controller): void {
      controller.enqueue(
        encoder.encode(
          line({ type: 'header', exportedAt: params.exportedAt, account: params.account }),
        ),
      );
    },
    async pull(controller): Promise<void> {
      try {
        const next = await iterator.next();
        if (next.done === true) {
          controller.enqueue(encoder.encode(line({ type: 'end', counts })));
          controller.close();
          return;
        }
        const key = countKeyOf(next.value);
        counts[key] = (counts[key] ?? 0) + next.value.rows.length;
        controller.enqueue(encoder.encode(linesOf(next.value)));
      } catch (error: unknown) {
        controller.error(error);
      }
    },
    async cancel(): Promise<void> {
      await iterator.return?.();
    },
  });
}
