// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IdentityEnvironment } from '../identity-test/identity-environment.js';
import { listSubjectsTo } from '../identity-test/mailpit-client.js';
import { assertCondition } from '../identity-test/identity-test.error.js';
import { MAIL_POLL_MILLISECONDS, MAIL_TIMEOUT_MILLISECONDS } from './admin-test.constant.js';
import { reportAdminStep, reportMeasurement } from './admin-test-context.js';

export async function waitForPasswordChangedNotice(
  environment: IdentityEnvironment,
  params: { readonly address: string; readonly subjectsBefore: readonly string[] },
): Promise<void> {
  const deadline = Date.now() + MAIL_TIMEOUT_MILLISECONDS;
  let subjects = await listSubjectsTo(environment, params.address);
  while (subjects.length <= params.subjectsBefore.length && Date.now() < deadline) {
    await Bun.sleep(MAIL_POLL_MILLISECONDS);
    subjects = await listSubjectsTo(environment, params.address);
  }
  const notices = subjects.slice(0, subjects.length - params.subjectsBefore.length);
  reportMeasurement(
    'e-mail ao titular depois de definir a senha pelo link',
    `assuntos novos no Mailpit: ${JSON.stringify(notices)}`,
  );
  assertCondition(
    notices.length === 1 && /senha/i.test(notices[0] ?? ''),
    `esperava 1 aviso de senha alterada, vieram ${notices.length}`,
  );
  reportAdminStep('aviso ao titular', 'trocar a senha pelo link gera o e-mail de senha alterada');
}
