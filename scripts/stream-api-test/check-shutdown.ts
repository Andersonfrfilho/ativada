// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../live-test/live-test-context.js';
import { reportLine, type StreamApiContext } from './stream-api-context.js';
import { SUBJECT } from './stream-api-test.constant.js';

const SHUTDOWN_BUDGET_MILLISECONDS = 5_000;

// Encerramento gracioso: com a API parando, o socket aberto é fechado pelo servidor (1001 no servidor; o cliente do Bun mostra 1000).
export async function checkShutdown(context: StreamApiContext): Promise<void> {
  const socket = context.connect({
    ticket: await context.issueTicket({ subject: SUBJECT.SHUTDOWN }),
  });
  await socket.opened;
  const stoppedAt = Date.now();
  await context.stopApi();
  const closed = await socket.closed;
  assertCondition(
    closed.closedAt - stoppedAt < SHUTDOWN_BUDGET_MILLISECONDS,
    'o socket sobreviveu ao encerramento da API',
  );
  assertCondition([1000, 1001].includes(closed.code), `encerramento fechou com ${closed.code}`);
  reportLine(
    `encerramento: o socket aberto é fechado em ${closed.closedAt - stoppedAt} ms quando a API para (SIGTERM no processo real; o código 1001 está provado no contrato)`,
  );
}
