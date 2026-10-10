// Copyright (c) 2026 Ada Technology. All rights reserved.
import { PERSISTENCE_EXPECTED_ROWS } from '../../packages/database/test-support/persistence-lgpd-checks.js';

type PersistenceTable = keyof typeof PERSISTENCE_EXPECTED_ROWS;

// O primeiro acesso de cada dono pela API semeia a estratégia de exemplo (T3.5): uma estratégia e a versão 1 a mais
// do que o que o teste semeia direto pelos repositórios. A exportação e a purga as levam como qualquer outra.
const EXAMPLE_STRATEGY_ROWS: Readonly<Partial<Record<PersistenceTable, number>>> = {
  strategies: 1,
  strategy_versions: 1,
};

export function expectedRowsOf(table: PersistenceTable): number {
  return PERSISTENCE_EXPECTED_ROWS[table] + (EXAMPLE_STRATEGY_ROWS[table] ?? 0);
}
