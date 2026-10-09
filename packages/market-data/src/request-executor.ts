// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  HTTP_STATUS_IP_BANNED,
  HTTP_STATUS_SERVER_ERROR_MINIMUM,
  HTTP_STATUS_TOO_MANY_REQUESTS,
  MILLISECONDS_PER_SECOND,
  RETRY_AFTER_HEADER,
  TIMEOUT_ERROR_NAME,
} from './market-data.constant.js';
import {
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

function toTransportError(error: unknown): MarketDataError {
  if (error instanceof Error && error.name === TIMEOUT_ERROR_NAME) {
    return new MarketDataTimeoutError('A requisição à Binance excedeu o tempo limite.');
  }
  return new MarketDataNetworkError('Falha de rede ao consultar a Binance.');
}

export function createRequestExecutor(
  settings: ResolvedMarketDataSettings,
  gate: WeightGate,
): RequestExecutor {
  function backoffMilliseconds(attemptNumber: number): number {
    return Math.min(
      settings.backoffBaseMilliseconds * 2 ** (attemptNumber - 1),
      settings.backoffMaxMilliseconds,
    );
  }

  async function readBody(response: Response): Promise<AttemptOutcome> {
    gate.record(response);
    try {
      return { kind: 'success', body: await response.json() };
    } catch {
      throw new MarketDataResponseError('Resposta da Binance não é JSON válido.');
    }
  }

  function classifyFailure(response: Response, attemptNumber: number): AttemptOutcome {
    const retryAfterSeconds = readRetryAfterSeconds(response);
    if (response.status === HTTP_STATUS_IP_BANNED)
      throw new MarketDataBannedError(retryAfterSeconds);
    if (response.status === HTTP_STATUS_TOO_MANY_REQUESTS) {
      const delayMilliseconds =
        retryAfterSeconds === undefined
          ? backoffMilliseconds(attemptNumber)
          : retryAfterSeconds * MILLISECONDS_PER_SECOND;
      return {
        kind: 'retry',
        error: new MarketDataRateLimitError(retryAfterSeconds),
        delayMilliseconds,
      };
    }
    const error = new MarketDataHttpError(response.status, attemptNumber);
    if (response.status < HTTP_STATUS_SERVER_ERROR_MINIMUM) throw error;
    return { kind: 'retry', error, delayMilliseconds: backoffMilliseconds(attemptNumber) };
  }

  async function attemptRequest(url: string, attemptNumber: number): Promise<AttemptOutcome> {
    let response: Response;
    try {
      response = await settings.fetchImplementation(url, {
        signal: AbortSignal.timeout(settings.requestTimeoutMilliseconds),
      });
    } catch (error) {
      return {
        kind: 'retry',
        error: toTransportError(error),
        delayMilliseconds: backoffMilliseconds(attemptNumber),
      };
    }
    if (response.ok) return readBody(response);
    return classifyFailure(response, attemptNumber);
  }

  async function fetchJson(url: string): Promise<unknown> {
    // Cada tentativa depende do resultado da anterior: o laço é sequencial por natureza.
    for (let attemptNumber = 1; ; attemptNumber += 1) {
      await gate.waitIfNeeded();
      const outcome = await attemptRequest(url, attemptNumber);
      if (outcome.kind === 'success') return outcome.body;
      if (attemptNumber >= settings.maxAttempts) throw outcome.error;
      await settings.sleep(outcome.delayMilliseconds);
    }
  }

  return { fetchJson };
}
