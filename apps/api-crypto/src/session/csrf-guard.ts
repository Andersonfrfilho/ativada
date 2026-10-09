// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_HEADER } from '../shared/http/http.constant.js';
import { CsrfRejectedError } from './session.error.js';
import { REQUIRED_REQUESTED_WITH } from './session.constant.js';

export type CsrfGuardParams = {
  readonly request: Request;
  readonly allowedOrigins: ReadonlySet<string>;
};

export function assertCsrfProtection(params: CsrfGuardParams): void {
  const origin = params.request.headers.get(HTTP_HEADER.ORIGIN);
  const requestedWith = params.request.headers.get(HTTP_HEADER.REQUESTED_WITH);
  if (origin === null || !params.allowedOrigins.has(origin)) throw new CsrfRejectedError();
  if (requestedWith !== REQUIRED_REQUESTED_WITH) throw new CsrfRejectedError();
}
