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
import { RENEWAL_RETRY_MILLISECONDS } from './session.constant.js';
import { readEmailClaim, tokenResponseSchema } from './session.validation.js';

export type ExchangeCodeParams = {
  readonly code: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
};

export type SessionService = {
  readonly getSnapshot: () => SessionStatus;
  // A renovação falhou por causa transitória, mas o token de acesso ainda vale: o painel segue de pé com um aviso.
  readonly hasRenewalProblem: () => boolean;
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

type Credentials = {
  readonly accessToken: string;
  // Quando começa a renovar (antes da margem) e quando o token deixa mesmo de valer.
  readonly expiresAt: number;
  readonly validUntil: number;
};

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
  const validUntil = now + expiresIn * MILLISECONDS_PER_SECOND;
  return { accessToken, validUntil, expiresAt: validUntil - TOKEN_EXPIRY_MARGIN_MILLISECONDS };
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
  private renewalProblem = false;
  private lastRenewalFailureAt = 0;
  private refreshing: Promise<string | undefined> | undefined;
  private exchanging: { readonly code: string; readonly promise: Promise<void> } | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: SessionServiceOptions) {}

  readonly getSnapshot = (): SessionStatus => this.status;

  readonly hasRenewalProblem = (): boolean => this.renewalProblem;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  readonly getAccessToken = (): Promise<string | undefined> => {
    const { credentials } = this;
    const now = this.options.now();
    if (credentials !== undefined && now < credentials.expiresAt) {
      return Promise.resolve(credentials.accessToken);
    }
    const isRetryTooSoon =
      this.renewalProblem && now - this.lastRenewalFailureAt < RENEWAL_RETRY_MILLISECONDS;
    if (credentials !== undefined && isRetryTooSoon && now < credentials.validUntil) {
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
    this.renewalProblem = false;
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
      if (fresh !== undefined) {
        this.publish(SESSION_STATUS.AUTHENTICATED, fresh);
        return fresh;
      }
      return this.failRenewal(failureStatus(response));
    } catch {
      return this.failRenewal(SESSION_STATUS.UNAVAILABLE);
    }
  }

  // Falha transitória com o token ainda válido não derruba o painel: guarda as credenciais e avisa.
  private failRenewal(next: SessionStatus): Credentials | undefined {
    const kept = this.credentials;
    const isStillValid = kept !== undefined && this.options.now() < kept.validUntil;
    if (next === SESSION_STATUS.UNAVAILABLE && isStillValid) {
      this.renewalProblem = true;
      this.lastRenewalFailureAt = this.options.now();
      this.listeners.forEach((listener) => listener());
      return kept;
    }
    this.publish(next, undefined);
    return undefined;
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
