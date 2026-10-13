// Copyright (c) 2026 Ada Technology. All rights reserved.

// A consulta do Bun é preguiçosa: só corre quando alguém a espera, e `.values()` pede as linhas em lista.
export type SqlQuery = PromiseLike<unknown> & {
  readonly values: () => PromiseLike<unknown>;
};

export type SqlTransaction = {
  readonly unsafe: (query: string, parameters?: unknown[]) => SqlQuery;
};

export type SqlCloseOptions = { readonly timeout?: number };

// O mínimo que o Drizzle pede ao `Bun.SQL` (`unsafe` e `begin`) mais o `close`: o porteiro e o dublê de teste
// falam este formato, e o `Bun.SQL` real o satisfaz.
export type SqlClient = {
  readonly unsafe: (query: string, parameters?: unknown[]) => SqlQuery;
  readonly begin: <TResult>(
    callback: (transaction: SqlTransaction) => Promise<TResult>,
  ) => Promise<TResult>;
  readonly close: (options?: SqlCloseOptions) => Promise<void>;
};
