// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IdentityEnvironment } from '../identity-test/identity-environment.js';
import { sendRequest, type HttpResult } from '../identity-test/http-client.js';
import { INVITEE_PASSWORD, PASSWORD_FIELD_MARKER } from './admin-test.constant.js';

const PROCEED_LINK_PATTERN = /href="([^"]*action-token[^"]*)"/;
const FORM_ACTION_PATTERN = /<form[^>]*action="([^"]+)"/;
const MAX_REDIRECTS = 8;

export type LinkSession = {
  readonly environment: IdentityEnvironment;
  readonly cookies: Map<string, string>;
};

export function startLinkSession(environment: IdentityEnvironment): LinkSession {
  return { environment, cookies: new Map() };
}

async function fetchWithCookies(
  session: LinkSession,
  url: string,
  form?: Readonly<Record<string, string>>,
): Promise<HttpResult> {
  const cookies = [...session.cookies.values()].join('; ');
  const result = await sendRequest({ url, cookies, ...(form === undefined ? {} : { form }) });
  for (const header of result.headers.getSetCookie()) {
    const pair = header.split(';')[0] ?? '';
    session.cookies.set(pair.slice(0, pair.indexOf('=')), pair);
  }
  return result;
}

async function followRedirects(session: LinkSession, first: HttpResult): Promise<HttpResult> {
  let current = first;
  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    const location = current.headers.get('location');
    if (location === null || !location.startsWith(session.environment.keycloakUrl)) break;
    current = await fetchWithCookies(session, location);
  }
  return current;
}

export async function openActionLink(session: LinkSession, link: string): Promise<HttpResult> {
  const landing = await fetchWithCookies(session, link);
  const proceed = PROCEED_LINK_PATTERN.exec(landing.text)?.[1]?.replaceAll('&amp;', '&');
  if (proceed === undefined) return landing;
  return followRedirects(session, await fetchWithCookies(session, proceed));
}

export async function opensPasswordForm(
  environment: IdentityEnvironment,
  link: string,
): Promise<boolean> {
  const page = await openActionLink(startLinkSession(environment), link);
  return page.text.includes(PASSWORD_FIELD_MARKER);
}

export async function setPasswordThroughLink(
  environment: IdentityEnvironment,
  link: string,
): Promise<boolean> {
  const session = startLinkSession(environment);
  const page = await openActionLink(session, link);
  const action = FORM_ACTION_PATTERN.exec(page.text)?.[1]?.replaceAll('&amp;', '&');
  if (action === undefined || !page.text.includes(PASSWORD_FIELD_MARKER)) return false;
  const submitted = await fetchWithCookies(session, action, {
    'password-new': INVITEE_PASSWORD,
    'password-confirm': INVITEE_PASSWORD,
  });
  return submitted.status === 200 || submitted.status === 302;
}
