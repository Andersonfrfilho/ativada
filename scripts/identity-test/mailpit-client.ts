// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IdentityEnvironment } from './identity-environment.js';
import { isJsonRecord, parseJsonRecord, readText, sendRequest } from './http-client.js';
import { IdentityTestError } from './identity-test.error.js';

const MAIL_TIMEOUT_MILLISECONDS = 20_000;
const MAIL_POLL_MILLISECONDS = 500;

export type ReceivedMail = {
  readonly subject: string;
};

async function listMessages(environment: IdentityEnvironment): Promise<readonly unknown[]> {
  const result = await sendRequest({ url: `${environment.mailpitUrl}/api/v1/messages` });
  const messages = parseJsonRecord(result)['messages'];
  return Array.isArray(messages) ? (messages as readonly unknown[]) : [];
}

function mailIsAddressedTo(message: unknown, address: string): boolean {
  if (!isJsonRecord(message) || !Array.isArray(message['To'])) return false;
  return message['To'].some(
    (entry: unknown) => isJsonRecord(entry) && entry['Address'] === address,
  );
}

export async function waitForMailTo(
  environment: IdentityEnvironment,
  address: string,
): Promise<ReceivedMail> {
  const deadline = Date.now() + MAIL_TIMEOUT_MILLISECONDS;
  while (Date.now() < deadline) {
    const found = (await listMessages(environment)).find((message) =>
      mailIsAddressedTo(message, address),
    );
    if (isJsonRecord(found)) return { subject: readText(found, 'Subject') };
    await Bun.sleep(MAIL_POLL_MILLISECONDS);
  }
  throw new IdentityTestError(`nenhum e-mail para ${address} chegou ao Mailpit`);
}

export async function listSubjectsTo(
  environment: IdentityEnvironment,
  address: string,
): Promise<readonly string[]> {
  return (await listMessages(environment))
    .filter((message) => mailIsAddressedTo(message, address))
    .map((message) => (isJsonRecord(message) ? readText(message, 'Subject') : ''));
}
