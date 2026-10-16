// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_METHOD, HTTP_STATUS, z } from '@ativada/environment';

import type { SessionService } from '../session/session-service.js';
import { ApiError, ResponseShapeError } from './api.error.js';
import {
  dataEnvelopeSchema,
  errorEnvelopeSchema,
  pageEnvelopeSchema,
} from './envelope.validation.js';
import {
  BEARER_PREFIX,
  DEFAULT_DOWNLOAD_NAME,
  FILE_NAME_PATTERN,
  HTTP_HEADER,
  JSON_CONTENT_TYPE,
  REQUESTED_WITH_VALUE,
  UNKNOWN_ERROR_CODE,
  type FetchFunction,
} from './http.constant.js';

export type RequestOptions<TData> = {
  readonly path: string;
  readonly schema: z.ZodType<TData>;
  readonly method?: string;
  readonly body?: unknown;
};

export type EmptyRequestOptions = {
  readonly path: string;
  readonly method: string;
  readonly body?: unknown;
};

export type Page<TItem> = { readonly items: TItem[]; readonly nextCursor: string | null };

export type DownloadedFile = { readonly blob: Blob; readonly fileName: string };

export type ApiClient = {
  readonly request: <TData>(options: RequestOptions<TData>) => Promise<TData>;
  readonly requestPage: <TItem>(options: RequestOptions<TItem>) => Promise<Page<TItem>>;
  readonly requestEmpty: (options: EmptyRequestOptions) => Promise<void>;
  readonly download: (path: string) => Promise<DownloadedFile>;
};

export type ApiClientOptions = {
  readonly fetchImplementation: FetchFunction;
  readonly session: SessionService;
};

type Attempt = { readonly path: string; readonly method: string; readonly body?: unknown };

function buildInit(attempt: Attempt, accessToken: string): RequestInit {
  const headers: Record<string, string> = {
    [HTTP_HEADER.ACCEPT]: JSON_CONTENT_TYPE,
    [HTTP_HEADER.AUTHORIZATION]: `${BEARER_PREFIX} ${accessToken}`,
    [HTTP_HEADER.REQUESTED_WITH]: REQUESTED_WITH_VALUE,
  };
  if (attempt.body !== undefined) headers[HTTP_HEADER.CONTENT_TYPE] = JSON_CONTENT_TYPE;
  return {
    method: attempt.method,
    headers,
    credentials: 'same-origin',
    ...(attempt.body === undefined ? {} : { body: JSON.stringify(attempt.body) }),
  };
}

function readRetryAfterSeconds(response: Response): number | undefined {
  const seconds = Number(response.headers.get(HTTP_HEADER.RETRY_AFTER));
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

async function readApiError(response: Response): Promise<ApiError> {
  const parsed = errorEnvelopeSchema.safeParse(await response.json().catch(() => undefined));
  return new ApiError({
    status: response.status,
    code: parsed.success ? parsed.data.error.code : UNKNOWN_ERROR_CODE,
    message: parsed.success ? parsed.data.error.message : response.statusText,
    retryAfterSeconds: readRetryAfterSeconds(response),
    ...(parsed.success && parsed.data.error.details !== undefined
      ? { details: parsed.data.error.details }
      : {}),
  });
}

function readFileName(response: Response): string {
  const header = response.headers.get(HTTP_HEADER.CONTENT_DISPOSITION) ?? '';
  return FILE_NAME_PATTERN.exec(header)?.[1] ?? DEFAULT_DOWNLOAD_NAME;
}

class AuthenticatedApiClient implements ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  readonly request = async <TData>(options: RequestOptions<TData>): Promise<TData> => {
    const response = await this.send({
      path: options.path,
      method: options.method ?? HTTP_METHOD.GET,
      ...(options.body === undefined ? {} : { body: options.body }),
    });
    const parsed = dataEnvelopeSchema(options.schema).safeParse(
      await response.json().catch(() => undefined),
    );
    if (!parsed.success) throw new ResponseShapeError(options.path);
    return parsed.data.data;
  };

  readonly requestPage = async <TItem>(options: RequestOptions<TItem>): Promise<Page<TItem>> => {
    const response = await this.send({ path: options.path, method: HTTP_METHOD.GET });
    const parsed = pageEnvelopeSchema(options.schema).safeParse(
      await response.json().catch(() => undefined),
    );
    if (!parsed.success) throw new ResponseShapeError(options.path);
    return { items: parsed.data.data, nextCursor: parsed.data.pagination.nextCursor };
  };

  readonly requestEmpty = async (options: EmptyRequestOptions): Promise<void> => {
    await this.send(options);
  };

  readonly download = async (path: string): Promise<DownloadedFile> => {
    const response = await this.send({ path, method: HTTP_METHOD.GET });
    return { blob: await response.blob(), fileName: readFileName(response) };
  };

  // Um 401 renova o token UMA vez e repete; o segundo 401 encerra a sessão local (leva ao login).
  private async send(attempt: Attempt): Promise<Response> {
    const { session } = this.options;
    const firstToken = await session.getAccessToken();
    if (firstToken === undefined) throw this.unauthenticated();
    let response = await this.options.fetchImplementation(
      attempt.path,
      buildInit(attempt, firstToken),
    );
    if (response.status === HTTP_STATUS.UNAUTHORIZED) {
      const renewedToken = await session.renew();
      if (renewedToken === undefined) throw this.unauthenticated();
      response = await this.options.fetchImplementation(
        attempt.path,
        buildInit(attempt, renewedToken),
      );
    }
    if (response.status === HTTP_STATUS.UNAUTHORIZED) {
      this.options.session.expire();
      throw await readApiError(response);
    }
    if (!response.ok) throw await readApiError(response);
    return response;
  }

  private unauthenticated(): ApiError {
    return new ApiError({
      status: HTTP_STATUS.UNAUTHORIZED,
      code: 'SESSION_REQUIRED',
      message: 'Entre para continuar.',
    });
  }
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  return new AuthenticatedApiClient(options);
}
