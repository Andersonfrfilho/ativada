// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect } from 'bun:test';

const NOT_FOUND_STATUS = 404;
const NOT_FOUND_CODE_PATTERN = /^[A-Z][A-Z0-9_]*_NOT_FOUND$/;

export type NotFoundComparisonParams = {
  readonly expectedCode: string;
  readonly foreignResourceResponse: Response;
  readonly missingResourceResponse: Response;
};

type NotFoundFingerprint = {
  readonly status: number;
  readonly contentType: string | null;
  readonly code: unknown;
  readonly message: unknown;
  readonly bodyByteLength: number;
  readonly bodyKeys: readonly string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readFingerprint(response: Response): Promise<NotFoundFingerprint> {
  const bodyBytes = new Uint8Array(await response.clone().arrayBuffer());
  const body: unknown = JSON.parse(new TextDecoder().decode(bodyBytes));
  const error = isRecord(body) && isRecord(body['error']) ? body['error'] : {};
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    code: error['code'],
    message: error['message'],
    bodyByteLength: bodyBytes.byteLength,
    bodyKeys: isRecord(body) ? Object.keys(body).sort() : [],
  };
}

// Recurso de outro dono e UUID inexistente precisam ser indistinguíveis para quem chama (ADR 0001 §e).
export async function expectIndistinguishableNotFound(
  params: NotFoundComparisonParams,
): Promise<void> {
  expect(params.expectedCode).toMatch(NOT_FOUND_CODE_PATTERN);
  const foreign = await readFingerprint(params.foreignResourceResponse);
  const missing = await readFingerprint(params.missingResourceResponse);
  expect({ status: foreign.status, code: foreign.code, bodyKeys: foreign.bodyKeys }).toStrictEqual({
    status: NOT_FOUND_STATUS,
    code: params.expectedCode,
    bodyKeys: ['error'],
  });
  expect(foreign).toStrictEqual(missing);
}
