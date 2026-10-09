// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AdminHarness, TokenOptions } from './admin-harness.fixture.js';
import { ADMIN_SUBJECT } from './admin-harness.fixture.js';

export type AdminCall = {
  readonly path: string;
  readonly method?: string;
  readonly subject?: string;
  readonly body?: unknown;
  readonly token?: TokenOptions;
  readonly socketAddress?: string;
};

export async function callAdmin(harness: AdminHarness, call: AdminCall): Promise<Response> {
  const token = await harness.tokenFor(call.subject ?? ADMIN_SUBJECT, call.token);
  return harness.api.sendThroughHandler({
    path: call.path,
    method: call.method ?? 'GET',
    token,
    headers: { 'Content-Type': 'application/json' },
    ...(call.socketAddress === undefined ? {} : { socketAddress: call.socketAddress }),
    ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
  });
}

export async function readError(response: Response): Promise<{ status: number; code: string }> {
  const body = (await response.json()) as { error: { code: string } };
  return { status: response.status, code: body.error.code };
}

export function collectKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, nested] of Object.entries(value)) {
      keys.add(key);
      collectKeys(nested, keys);
    }
  }
  return keys;
}
