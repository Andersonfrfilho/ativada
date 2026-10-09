// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IdentityEnvironment } from '../identity-test/identity-environment.js';
import {
  isJsonRecord,
  parseJsonRecord,
  readText,
  sendRequest,
} from '../identity-test/http-client.js';
import { IdentityTestError } from '../identity-test/identity-test.error.js';
import { MAIL_POLL_MILLISECONDS, MAIL_TIMEOUT_MILLISECONDS } from './admin-test.constant.js';

const ACTION_LINK_PATTERN = /http[^\s"<]*action-token[^\s"<]*/;

export type ActionEmail = {
  readonly subject: string;
  readonly link: string;
  readonly lifespanSeconds: number;
  readonly actions: readonly string[];
};

type MailSummary = { readonly id: string; readonly createdAt: string };

function readSummaries(listing: unknown, address: string): readonly MailSummary[] {
  if (!isJsonRecord(listing) || !Array.isArray(listing['messages'])) return [];
  const summaries: MailSummary[] = [];
  for (const message of listing['messages'] as readonly unknown[]) {
    if (!isJsonRecord(message) || !Array.isArray(message['To'])) continue;
    const isAddressed = (message['To'] as readonly unknown[]).some(
      (entry) => isJsonRecord(entry) && entry['Address'] === address,
    );
    if (isAddressed) {
      summaries.push({ id: readText(message, 'ID'), createdAt: readText(message, 'Created') });
    }
  }
  return summaries.sort((first, second) => first.createdAt.localeCompare(second.createdAt));
}

function decodeActionToken(link: string): Record<string, unknown> {
  const key = new URL(link).searchParams.get('key') ?? '';
  const payload: unknown = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString());
  if (!isJsonRecord(payload)) throw new IdentityTestError('token de ação sem payload');
  return { ...payload };
}

async function readEmail(environment: IdentityEnvironment, id: string): Promise<ActionEmail> {
  const message = parseJsonRecord(
    await sendRequest({ url: `${environment.mailpitUrl}/api/v1/message/${id}` }),
  );
  const body = readText(message, 'HTML') || readText(message, 'Text');
  const link = ACTION_LINK_PATTERN.exec(body)?.[0]?.replaceAll('&amp;', '&');
  if (link === undefined) throw new IdentityTestError('e-mail sem link de ação');
  const token = decodeActionToken(link);
  const actions = Array.isArray(token['rqac'])
    ? (token['rqac'] as readonly unknown[]).map(String)
    : [];
  return {
    subject: readText(message, 'Subject'),
    link,
    lifespanSeconds: Number(token['exp']) - Number(token['iat']),
    actions,
  };
}

export async function waitForActionEmails(
  environment: IdentityEnvironment,
  params: { readonly address: string; readonly count: number },
): Promise<readonly ActionEmail[]> {
  const deadline = Date.now() + MAIL_TIMEOUT_MILLISECONDS;
  while (Date.now() < deadline) {
    const listing = parseJsonRecord(
      await sendRequest({ url: `${environment.mailpitUrl}/api/v1/messages` }),
    );
    const summaries = readSummaries(listing, params.address);
    if (summaries.length >= params.count) {
      return Promise.all(summaries.map((summary) => readEmail(environment, summary.id)));
    }
    await Bun.sleep(MAIL_POLL_MILLISECONDS);
  }
  throw new IdentityTestError(`menos de ${params.count} e-mails para o convidado no Mailpit`);
}
