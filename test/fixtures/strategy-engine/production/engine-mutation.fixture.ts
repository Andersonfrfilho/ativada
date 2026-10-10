// Copyright (c) 2026 Ada Technology. All rights reserved.
import { cp } from 'node:fs/promises';

import { MUTANT_ROOT } from '../signal/signal-mutation.fixture.js';
import { ENGINE_API_MEMBERS, type EngineApi } from './engine-api.fixture.js';

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url).pathname;
const SOURCE_DIRECTORY = `${REPOSITORY_ROOT}packages/strategy-engine/src`;

export type EngineSourceEdit = {
  readonly file: string;
  readonly find: string;
  readonly replace: string;
};

export type EngineSourceMutant = {
  readonly name: string;
  readonly edits: readonly EngineSourceEdit[];
};

function isEngineApi(candidate: unknown): candidate is EngineApi {
  if (typeof candidate !== 'object' || candidate === null) return false;
  return ENGINE_API_MEMBERS.every(
    (member) => typeof Object.getOwnPropertyDescriptor(candidate, member)?.value === 'function',
  );
}

async function applyEdit(directory: string, name: string, edit: EngineSourceEdit): Promise<void> {
  const path = `${directory}/${edit.file}`;
  const text = await Bun.file(path).text();
  const found = text.split(edit.find).length - 1;
  if (found !== 1) {
    throw new Error(`Mutante ${name}: "${edit.find}" aparece ${found}x em ${edit.file}.`);
  }
  await Bun.write(
    path,
    text.replace(edit.find, () => edit.replace),
  );
}

// Uma cópia do `src` com a(s) edição(ões) do mutante, carregada como módulo à parte.
export async function loadEngineMutantApi(mutant: EngineSourceMutant): Promise<EngineApi> {
  const directory = `${MUTANT_ROOT}/engine-${mutant.name.toLowerCase()}`;
  await cp(SOURCE_DIRECTORY, directory, { recursive: true });
  for (const edit of mutant.edits) await applyEdit(directory, mutant.name, edit);
  const loaded: unknown = await import(`${directory}/index.ts`);
  if (!isEngineApi(loaded)) throw new Error(`Mutante ${mutant.name}: módulo sem a API do motor.`);
  return loaded;
}
