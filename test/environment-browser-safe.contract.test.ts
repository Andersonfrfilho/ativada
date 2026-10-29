// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

const ENVIRONMENT_SOURCE = join(import.meta.dir, '..', 'packages', 'environment', 'src');

// O painel importa `@ativada/environment` (o `z`); um `node:` aqui quebra o navegador com "Module externalized".
describe('@ativada/environment roda no navegador', () => {
  test('nenhum arquivo do pacote importa módulo do Node', () => {
    const offenders = readdirSync(ENVIRONMENT_SOURCE, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith('.ts'))
      .filter((file) =>
        /from ['"]node:/.test(readFileSync(join(ENVIRONMENT_SOURCE, file), 'utf8')),
      );
    expect(offenders).toEqual([]);
  });
});
