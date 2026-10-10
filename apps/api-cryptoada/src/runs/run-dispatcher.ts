// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RunKind } from '@cryptoada/database';

export type RunDispatchRequest = {
  readonly runId: string;
  readonly kind: RunKind;
};

// PORTA entre a rota que cria a execução e quem a executa. `dispatch` resolve quando a execução foi ENTREGUE ao
// executor (não quando terminou) e rejeita se não foi possível entregar: quem chama marca `failed` com
// `DISPATCH_FAILED`, para a execução nunca ficar `queued` para sempre.
//
// PONTO DE TROCA da T3.6: hoje a implementação é `createDirectRunDispatcher` (inicia a thread na hora, sem teto por
// usuário). A T3.6 a substitui por uma que enfileira, com os tetos por usuário (RF00b) e a recuperação no boot;
// nada além da fábrica em `create-application.ts` muda.
export type RunDispatcher = {
  readonly dispatch: (request: RunDispatchRequest) => Promise<void>;
};
