// Copyright (c) 2026 Ada Technology. All rights reserved.
import { cp } from 'node:fs/promises';

import type { RiskApi } from './risk-api.fixture.js';
import { MUTANT_ROOT } from '../signal/signal-mutation.fixture.js';

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url).pathname;
const SOURCE_DIRECTORY = `${REPOSITORY_ROOT}packages/strategy-engine/src`;
const API_MEMBERS: readonly string[] = ['computePositionSize', 'computeProtectivePrices'];

export type RiskSourceEdit = {
  readonly file: string;
  readonly find: string;
  readonly replace: string;
};

export type RiskSourceMutant = {
  readonly name: string;
  readonly edits: readonly RiskSourceEdit[];
};

function isRiskApi(candidate: unknown): candidate is RiskApi {
  if (typeof candidate !== 'object' || candidate === null) return false;
  return API_MEMBERS.every(
    (member) => typeof Object.getOwnPropertyDescriptor(candidate, member)?.value === 'function',
  );
}

async function applyEdit(directory: string, name: string, edit: RiskSourceEdit): Promise<void> {
  const path = `${directory}/${edit.file}`;
  const text = await Bun.file(path).text();
  const found = text.split(edit.find).length - 1;
  if (found !== 1)
    throw new Error(`Mutante ${name}: "${edit.find}" aparece ${found}x em ${edit.file}.`);
  await Bun.write(
    path,
    text.replace(edit.find, () => edit.replace),
  );
}

export async function loadRiskMutantApi(mutant: RiskSourceMutant): Promise<RiskApi> {
  const directory = `${MUTANT_ROOT}/risk-${mutant.name.toLowerCase()}`;
  await cp(SOURCE_DIRECTORY, directory, { recursive: true });
  for (const edit of mutant.edits) await applyEdit(directory, mutant.name, edit);
  const loaded: unknown = await import(`${directory}/index.ts`);
  if (!isRiskApi(loaded)) throw new Error(`Mutante ${mutant.name}: módulo sem a API de risco.`);
  return loaded;
}
