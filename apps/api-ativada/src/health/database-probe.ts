// Copyright (c) 2026 Ada Technology. All rights reserved.
export type DatabaseProbeParams = {
  readonly check: () => Promise<boolean>;
  readonly timeoutMilliseconds: number;
};

// O teto é só desta resposta: a consulta segue no porteiro, que tem o teto dele (ADR 0002, H1), e estourar este
// aqui NUNCA conta como falha de conexão. Banco lento é `false`, não banco caído.
export async function probeDatabaseWithin(params: DatabaseProbeParams): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), params.timeoutMilliseconds);
  });
  try {
    return await Promise.race([params.check(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
