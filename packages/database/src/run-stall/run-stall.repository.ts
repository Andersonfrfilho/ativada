// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { createStallSession } from './run-stall-session.js';
import type { RunStallRepository } from './run-stall.types.js';

// Sem `OwnerScope`: quem varre é a API, que enxerga as simulações de todos os donos; o aviso sempre vai ao dono da linha.
export function createRunStallRepository(handle: DatabaseHandle): RunStallRepository {
  const { database } = readOpenDatabase(handle);
  return {
    inTransaction: (work) =>
      database.transaction(async (transaction) => work(createStallSession(transaction))),
  };
}
