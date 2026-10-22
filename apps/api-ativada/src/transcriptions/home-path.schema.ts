// Copyright (c) 2026 Ada Technology. All rights reserved.
import { homedir } from 'node:os';
import { join } from 'node:path';

import { z } from '@ativada/environment';

const HOME_PREFIX = '~/';
const PATH_EXPECTATION = 'caminho absoluto ou começando por ~/';

function expandHomePath(path: string): string {
  return path.startsWith(HOME_PREFIX) ? join(homedir(), path.slice(HOME_PREFIX.length)) : path;
}

// Caminho de arquivo da máquina (binário, modelo): `~/` vira a pasta do usuário aqui, para nenhum consumidor precisar saber disso.
export const homePathSchema = z
  .string({ error: PATH_EXPECTATION })
  .refine((path) => path.startsWith('/') || path.startsWith(HOME_PREFIX), {
    error: PATH_EXPECTATION,
  })
  .transform(expandHomePath);
