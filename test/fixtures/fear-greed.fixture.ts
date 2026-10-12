// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { FetchImplementation } from '../../packages/market-data-crypto/src/index.js';

const FIXTURE_PATH = new URL('./alternative-me/fng-limit-5.json', import.meta.url);

export const FEAR_GREED_BASE_URL = 'https://fear-greed.test/fng/';

export type FearGreedReply =
  | { readonly status: number; readonly body: unknown }
  | { readonly status: number; readonly rawBody: string }
  | { readonly error: Error };

export type RecordedFearGreedCall = { readonly url: URL; readonly signal: AbortSignal };

export async function loadRealFearGreedResponse(): Promise<Record<string, unknown>> {
  return JSON.parse(await Bun.file(FIXTURE_PATH).text()) as Record<string, unknown>;
}

export function buildFearGreedBody(
  items: readonly Record<string, unknown>[],
  error: unknown = null,
): Record<string, unknown> {
  return { name: 'Fear and Greed Index', data: items, metadata: { error } };
}

export function buildFearGreedItem(params: {
  readonly value: string;
  readonly timestamp: string;
  readonly classification?: string;
}): Record<string, unknown> {
  return {
    value: params.value,
    value_classification: params.classification ?? 'Neutral',
    timestamp: params.timestamp,
  };
}

function toResponse(reply: Exclude<FearGreedReply, { error: Error }>): Response {
  const text = 'rawBody' in reply ? reply.rawBody : JSON.stringify(reply.body);
  return new Response(text, { status: reply.status });
}

export function createFearGreedFetch(script: readonly FearGreedReply[]): {
  readonly fetchImplementation: FetchImplementation;
  readonly calls: RecordedFearGreedCall[];
} {
  const calls: RecordedFearGreedCall[] = [];
  const fetchImplementation: FetchImplementation = (url, init) => {
    calls.push({ url: new URL(url), signal: init.signal });
    const reply = script[Math.min(calls.length, script.length) - 1];
    if (reply === undefined) return Promise.reject(new Error('empty script'));
    if ('error' in reply) return Promise.reject(reply.error);
    return Promise.resolve(toResponse(reply));
  };
  return { fetchImplementation, calls };
}
