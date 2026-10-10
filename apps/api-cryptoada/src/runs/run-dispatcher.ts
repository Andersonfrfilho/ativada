// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RunKind } from '@cryptoada/database';

export type RunDispatchRequest = {
  readonly runId: string;
  readonly kind: RunKind;
};

// PORTA entre a rota que cria a execução e quem a executa. `dispatch` resolve quando a execução foi ENTREGUE à fila (não
// quando terminou) e rejeita se não foi possível entregar: quem chama marca `failed` com `DISPATCH_FAILED`, para a execução
// nunca ficar `queued` para sempre. A implementação é o despachante da fila (`queue/run-queue-dispatcher.ts`, T3.6): a
// execução já está `queued` no banco e ele a reivindica quando o usuário e a instância tiverem vaga.
export type RunDispatcher = {
  readonly dispatch: (request: RunDispatchRequest) => Promise<void>;
};
