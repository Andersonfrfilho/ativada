// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_METHOD } from '@cryptoada/environment';

import { API_PATH } from '../app/app.constant.js';
import {
  HTTP_HEADER,
  JSON_CONTENT_TYPE,
  REQUESTED_WITH_VALUE,
  type FetchFunction,
} from '../http/http.constant.js';
import {
  MILLISECONDS_PER_SECOND,
  SERVER_ERROR_MIN_STATUS,
  SESSION_STATUS,
  TOKEN_EXPIRY_MARGIN_MILLISECONDS,
  TRANSIENT_FAILURE_STATUSES,
  type SessionStatus,
} from './session.constant.js';
import { readEmailClaim, tokenResponseSchema } from './session.validation.js';

export type ExchangeCodeParams = {
  readonly code: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
};

export type SessionService = {
  readonly getSnapshot: () => SessionStatus;
  readonly subscribe: (listener: () => void) => () => void;
  readonly getAccessToken: () => Promise<string | undefined>;
  readonly renew: () => Promise<string | undefined>;
  readonly exchangeCode: (params: ExchangeCodeParams) => Promise<void>;
  readonly end: () => Promise<void>;
  readonly expire: () => void;
  readonly readEmail: () => string | undefined;
};

export type SessionServiceOptions = {
  readonly fetchImplementation: FetchFunction;
  readonly now: () => number;
};

type Credentials = { readonly accessToken: string; readonly expiresAt: number };

export class SessionExchangeError extends Error {
  constructor() {
    super('A API recusou a troca do código de login.');
    this.name = 'SessionExchangeError';
  }
}

function readCredentials(body: unknown, now: number): Credentials | undefined {
  const parsed = tokenResponseSchema.safeParse(body);
  if (!parsed.success) return undefined;
  const { accessToken, expiresIn } = parsed.data.data;
  return {
    accessToken,
    expiresAt: now + expiresIn * MILLISECONDS_PER_SECOND - TOKEN_EXPIRY_MARGIN_MILLISECONDS,
  };
}

function failureStatus(response: Response): SessionStatus {
  const isTransient =
    TRANSIENT_FAILURE_STATUSES.includes(response.status) ||
    response.status >= SERVER_ERROR_MIN_STATUS;
  return isTransient ? SESSION_STATUS.UNAVAILABLE : SESSION_STATUS.ANONYMOUS;
}

// O token de acesso vive só aqui, em memória; o refresh fica no cookie HttpOnly que o JS nunca vê.
class MemorySessionService implements SessionService {
  private status: SessionStatus = SESSION_STATUS.LOADING;
  private credentials: Credentials | undefined;
  private refreshing: Promise<string | undefined> | undefined;
  private exchanging: { readonly code: string; readonly promise: Promise<void> } | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: SessionServiceOptions) {}

  readonly getSnapshot = (): SessionStatus => this.status;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  readonly getAccessToken = (): Promise<string | undefined> => {
    const { credentials } = this;
    if (credentials !== undefined && this.options.now() < credentials.expiresAt) {
      return Promise.resolve(credentials.accessToken);
    }
    return this.renew();
  };

  readonly renew = (): Promise<string | undefined> => {
    this.refreshing ??= this.runRefresh();
    return this.refreshing;
  };

  readonly exchangeCode = (params: ExchangeCodeParams): Promise<void> => {
    if (this.exchanging?.code !== params.code) {
      this.exchanging = { code: params.code, promise: this.runExchange(params) };
    }
    return this.exchanging.promise;
  };

  readonly end = async (): Promise<void> => {
    await this.callSession(HTTP_METHOD.DELETE, API_PATH.SESSION).catch(() => undefined);
    this.publish(SESSION_STATUS.ANONYMOUS, undefined);
  };

  readonly expire = (): void => this.publish(SESSION_STATUS.ANONYMOUS, undefined);

  readonly readEmail = (): string | undefined =>
    this.credentials === undefined ? undefined : readEmailClaim(this.credentials.accessToken);

  private publish(next: SessionStatus, credentials: Credentials | undefined): void {
    this.status = next;
    this.credentials = credentials;
    this.listeners.forEach((listener) => listener());
  }

  private callSession(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { [HTTP_HEADER.REQUESTED_WITH]: REQUESTED_WITH_VALUE };
    if (body !== undefined) headers[HTTP_HEADER.CONTENT_TYPE] = JSON_CONTENT_TYPE;
    return this.options.fetchImplementation(path, {
      method,
      headers,
      credentials: 'same-origin',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  private async requestCredentials(path: string, body?: unknown): Promise<Credentials | undefined> {
    try {
      const response = await this.callSession(HTTP_METHOD.POST, path, body);
      const fresh = response.ok
        ? readCredentials(await response.json(), this.options.now())
        : undefined;
      this.publish(
        fresh === undefined ? failureStatus(response) : SESSION_STATUS.AUTHENTICATED,
        fresh,
      );
      return fresh;
    } catch {
      this.publish(SESSION_STATUS.UNAVAILABLE, undefined);
      return undefined;
    }
  }

  private async runRefresh(): Promise<string | undefined> {
    const fresh = await this.requestCredentials(API_PATH.SESSION_REFRESH);
    this.refreshing = undefined;
    return fresh?.accessToken;
  }

  private async runExchange(params: ExchangeCodeParams): Promise<void> {
    if ((await this.requestCredentials(API_PATH.SESSION, params)) === undefined) {
      throw new SessionExchangeError();
    }
  }
}

export function createSessionService(options: SessionServiceOptions): SessionService {
  return new MemorySessionService(options);
}
