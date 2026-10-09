// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { DatabaseHandle } from './database-handle.js';
import { DISPLAY_CURRENCY } from './users/display-currency.constant.js';
import { createProfileRepository } from './users/profile.repository.js';
import { resolveUserBySubject } from './users/resolve-user-by-subject.js';
import { USER_RESOLUTION_STATUS } from './users/user-resolution.constant.js';
import type { OwnerScope } from './ownership/owner-scope.js';

const SUBJECT_OF_A = 'subject-profile-a';
const SUBJECT_OF_B = 'subject-profile-b';

export type ProfileCheckContext = {
  readonly handle: DatabaseHandle;
  readonly assertCondition: (condition: boolean, message: string) => void;
  readonly reportCheck: (message: string) => void;
};

async function resolveScope(handle: DatabaseHandle, subject: string): Promise<OwnerScope> {
  const resolution = await resolveUserBySubject(handle, subject);
  if (resolution.status !== USER_RESOLUTION_STATUS.ACTIVE) throw new Error('usuário não ativo');
  return resolution.scope;
}

export async function checkProfileRepository(context: ProfileCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const repository = createProfileRepository(handle);
  const scopeOfA = await resolveScope(handle, SUBJECT_OF_A);
  const scopeOfB = await resolveScope(handle, SUBJECT_OF_B);

  const initial = await repository.findProfile(scopeOfA);
  assertCondition(initial?.alertTelegramEnabled === true, 'padrão de alertTelegramEnabled');
  assertCondition(initial?.isTelegramLinked === false, 'chat não deveria estar vinculado');

  await repository.updateProfile(scopeOfA, {
    displayName: 'Ana',
    displayCurrency: DISPLAY_CURRENCY.USD,
    timezone: 'America/New_York',
    alertTelegramEnabled: false,
  });
  await repository.updateProfile(scopeOfB, { displayName: 'Beto' });
  const profileOfA = await repository.findProfile(scopeOfA);
  const profileOfB = await repository.findProfile(scopeOfB);
  assertCondition(profileOfA?.displayName === 'Ana', 'nome do usuário A');
  assertCondition(profileOfA?.displayCurrency === DISPLAY_CURRENCY.USD, 'moeda do usuário A');
  assertCondition(profileOfA?.alertTelegramEnabled === false, 'alerta do usuário A');
  assertCondition(profileOfB?.displayName === 'Beto', 'nome do usuário B');
  assertCondition(profileOfB?.displayCurrency === DISPLAY_CURRENCY.BRL, 'B não pode herdar de A');

  await repository.updateProfile(scopeOfA, { displayName: null });
  assertCondition((await repository.findProfile(scopeOfA))?.displayName === undefined, 'limpar');
  reportCheck('perfil: leitura e alteração presas ao dono; o outro usuário fica intacto');
}
