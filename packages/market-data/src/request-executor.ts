// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MILLISECONDS_PER_SECOND } from '@cryptoada/environment';

import {
  BINANCE_SOURCE_NAME,
  HTTP_STATUS_IP_BANNED,
  HTTP_STATUS_SERVER_ERROR_MINIMUM,
  HTTP_STATUS_TOO_MANY_REQUESTS,
  MAXIMUM_RETRY_AFTER_SECONDS,
  RETRY_AFTER_HEADER,
  TIMEOUT_ERROR_NAME,
} from './market-data.constant.js';
import {
  MarketDataAbortedError,
  MarketDataBannedError,
  MarketDataError,
  MarketDataHttpError,
  MarketDataNetworkError,
  MarketDataRateLimitError,
  MarketDataResponseError,
  MarketDataTimeoutError,
} from './market-data.error.js';
import type { ResolvedMarketDataSettings } from './market-data.types.js';
import type { WeightGate } from './weight-gate.js';

type AttemptOutcome =
  | { readonly kind: 'success'; readonly body: unknown }
  | { readonly kind: 'retry'; readonly error: MarketDataError; readonly delayMilliseconds: number };

export type RequestExecutor = { readonly fetchJson: (url: string) => Promise<unknown> };

function readRetryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get(RETRY_AFTER_HEADER);
  if (header === null) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function toTransportError(error: unknown, sourceName: string): MarketDataError {
  if (error instanceof Error && error.name === TIMEOUT_ERROR_NAME) {
    return new MarketDataTimeoutError(`A requisição a ${sourceName} excedeu o tempo limite.`);
  }
  return new MarketDataNetworkError(`Falha de rede ao consultar ${sourceName}.`);
}

type ExecutorContext = {
  readonly settings: ResolvedMarketDataSettings;
  readonly gate: WeightGate;
  readonly sourceName: string;
};

function backoffMilliseconds(settings: ResolvedMarketDataSettings, attemptNumber: number): number {
  return Math.min(
    settings.backoffBaseMilliseconds * 2 ** (attemptNumber - 1),
    settings.backoffMaxMilliseconds,
  );
}

function throwIfAborted(settings: ResolvedMarketDataSettings): void {
  if (settings.signal?.aborted === true) throw new MarketDataAbortedError();
}

function buildRequestSignal(settings: ResolvedMarketDataSettings): AbortSignal {
  const timeout = AbortSignal.timeout(settings.requestTimeoutMilliseconds);
  return settings.signal === undefined ? timeout : AbortSignal.any([timeout, settings.signal]);
}

function buildTransportRetry(
  context: ExecutorContext,
  error: unknown,
  attemptNumber: number,
): AttemptOutcome {
  return {
    kind: 'retry',
    error: toTransportError(error, context.sourceName),
    delayMilliseconds: backoffMilliseconds(context.settings, attemptNumber),
  };
}

// Corpo cortado no meio (timeout, conexão caída) é falha de transporte e tenta de novo; só JSON ruim é erro de resposta.
async function readBody(
  context: ExecutorContext,
  response: Response,
  attemptNumber: number,
): Promise<AttemptOutcome> {
  try {
    return { kind: 'success', body: await response.json() };
  } catch (error) {
    throwIfAborted(context.settings);
    if (error instanceof SyntaxError)
      throw new MarketDataResponseError(`Resposta de ${context.sourceName} não é JSON válido.`);
    return buildTransportRetry(context, error, attemptNumber);
  }
}

function classifyRateLimit(
  context: ExecutorContext,
  retryAfterSeconds: number | undefined,
  attemptNumber: number,
): AttemptOutcome {
  const delayMilliseconds =
    retryAfterSeconds === undefined
      ? backoffMilliseconds(context.settings, attemptNumber)
      : Math.min(retryAfterSeconds, MAXIMUM_RETRY_AFTER_SECONDS) * MILLISECONDS_PER_SECOND;
  return {
    kind: 'retry',
    error: new MarketDataRateLimitError(retryAfterSeconds, context.sourceName),
    delayMilliseconds,
  };
}

function classifyFailure(
  context: ExecutorContext,
  response: Response,
  attemptNumber: number,
): AttemptOutcome {
  const retryAfterSeconds = readRetryAfterSeconds(response);
  if (response.status === HTTP_STATUS_IP_BANNED)
    throw new MarketDataBannedError(retryAfterSeconds, context.sourceName);
  if (response.status === HTTP_STATUS_TOO_MANY_REQUESTS)
    return classifyRateLimit(context, retryAfterSeconds, attemptNumber);
  const error = new MarketDataHttpError({
    status: response.status,
    attempts: attemptNumber,
    sourceName: context.sourceName,
  });
  if (response.status < HTTP_STATUS_SERVER_ERROR_MINIMUM) throw error;
  return {
    kind: 'retry',
    error,
    delayMilliseconds: backoffMilliseconds(context.settings, attemptNumber),
  };
}

async function attemptRequest(
  context: ExecutorContext,
  url: string,
  attemptNumber: number,
): Promise<AttemptOutcome> {
  const { settings, gate } = context;
  let response: Response;
  try {
    response = await settings.fetchImplementation(url, { signal: buildRequestSignal(settings) });
  } catch (error) {
    throwIfAborted(settings);
    return buildTransportRetry(context, error, attemptNumber);
  }
  gate.record(response);
  if (response.ok) return readBody(context, response, attemptNumber);
  return classifyFailure(context, response, attemptNumber);
}

async function fetchJsonWithRetries(context: ExecutorContext, url: string): Promise<unknown> {
  const { settings, gate } = context;
  // Cada tentativa depende do resultado da anterior: o laço é sequencial por natureza.
  for (let attemptNumber = 1; ; attemptNumber += 1) {
    await gate.waitIfNeeded();
    throwIfAborted(settings);
    const outcome = await attemptRequest(context, url, attemptNumber);
    if (outcome.kind === 'success') return outcome.body;
    if (attemptNumber >= settings.maxAttempts) throw outcome.error;
    await settings.sleep(outcome.delayMilliseconds);
    throwIfAborted(settings);
  }
}

export function createRequestExecutor(
  settings: ResolvedMarketDataSettings,
  gate: WeightGate,
  sourceName: string = BINANCE_SOURCE_NAME,
): RequestExecutor {
  const context: ExecutorContext = { settings, gate, sourceName };
  return { fetchJson: (url) => fetchJsonWithRetries(context, url) };
}
