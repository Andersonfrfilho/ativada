// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_METHOD } from '@ativada/environment';
import {
  MODEL_CALL_STATUS,
  type ModelCallMeasure,
  type ModelCallResult,
} from '@ativada/model-agents';

const HTTP_SUCCESS_FLOOR = 200;
const HTTP_SUCCESS_CEILING = 300;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_FLOOR = 500;
const HTTP_REQUEST_TIMEOUT = 408;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const MAXIMUM_BODY_LENGTH = 1_000_000;
const DEFAULT_RETRY_AFTER_MILLISECONDS = 60_000;
const MILLISECONDS_PER_SECOND = 1_000;
const TRAILING_SLASHES = /\/+$/u;
const TIMEOUT_ERROR_NAME = 'TimeoutError';

// O resultado só carrega CÓDIGOS e o corpo já lido: nunca a URL, os cabeçalhos nem o texto do erro do `fetch` (que cita os dois).
export type HttpOutcome =
  | {
      readonly kind: 'response';
      readonly status: number;
      readonly body: unknown;
      readonly retryAfterMilliseconds: number | undefined;
    }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'network' };

export type PostJsonParams = {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly timeoutMilliseconds: number;
  readonly signal: AbortSignal;
};

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(TRAILING_SLASHES, '')}${path}`;
}

function parseRetryAfter(header: string | null): number | undefined {
  if (header === null) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * MILLISECONDS_PER_SECOND;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

async function readBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (text.length > MAXIMUM_BODY_LENGTH) return undefined;
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return undefined;
  }
}

// `fetch` direto, sem SDK. `redirect: 'error'` impede que a chave siga para outro host; o erro do `fetch` é ENGOLIDO aqui.
export async function postJson(params: PostJsonParams): Promise<HttpOutcome> {
  try {
    const response = await fetch(params.url, {
      method: HTTP_METHOD.POST,
      headers: { 'Content-Type': 'application/json', ...params.headers },
      body: JSON.stringify(params.body),
      redirect: 'error',
      signal: AbortSignal.any([params.signal, AbortSignal.timeout(params.timeoutMilliseconds)]),
    });
    return {
      kind: 'response',
      status: response.status,
      body: await readBody(response),
      retryAfterMilliseconds: parseRetryAfter(response.headers.get('retry-after')),
    };
  } catch (error: unknown) {
    const isTimeout = error instanceof Error && error.name === TIMEOUT_ERROR_NAME;
    return isTimeout ? { kind: 'timeout' } : { kind: 'network' };
  }
}

export function isSuccessStatus(status: number): boolean {
  return status >= HTTP_SUCCESS_FLOOR && status < HTTP_SUCCESS_CEILING;
}

// RF01: 429 → rate_limited; 401/403 → key_rejected; 404 → model_not_found; 5xx e 408 → unavailable; o resto dos 4xx → bad_request.
export function classifyFailure(
  outcome: HttpOutcome,
  measure: ModelCallMeasure,
): ModelCallResult | undefined {
  if (outcome.kind === 'timeout') return { status: MODEL_CALL_STATUS.TIMEOUT, measure };
  if (outcome.kind === 'network') return { status: MODEL_CALL_STATUS.UNAVAILABLE, measure };
  const { status } = outcome;
  if (isSuccessStatus(status)) return undefined;
  if (status === HTTP_TOO_MANY_REQUESTS) {
    return {
      status: MODEL_CALL_STATUS.RATE_LIMITED,
      retryAfterMilliseconds: outcome.retryAfterMilliseconds ?? DEFAULT_RETRY_AFTER_MILLISECONDS,
    };
  }
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) {
    return { status: MODEL_CALL_STATUS.KEY_REJECTED, measure };
  }
  if (status === HTTP_NOT_FOUND) return { status: MODEL_CALL_STATUS.MODEL_NOT_FOUND, measure };
  if (status >= HTTP_SERVER_ERROR_FLOOR || status === HTTP_REQUEST_TIMEOUT) {
    return { status: MODEL_CALL_STATUS.UNAVAILABLE, measure };
  }
  return { status: MODEL_CALL_STATUS.BAD_REQUEST, measure };
}
