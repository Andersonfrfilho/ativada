// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';

const STRATEGY_NOT_FOUND = 'STRATEGY_NOT_FOUND';
const NOT_FOUND_MESSAGE = 'Estratégia não encontrada.';

type ErrorBody = {
  readonly code: string;
  readonly message: string;
};

function buildErrorResponse(status: number, error: ErrorBody): Response {
  return Response.json({ error }, { status });
}

function buildNotFound(): Response {
  return buildErrorResponse(404, { code: STRATEGY_NOT_FOUND, message: NOT_FOUND_MESSAGE });
}

async function captureFailure(pendingCheck: Promise<void>): Promise<unknown> {
  try {
    await pendingCheck;
    return undefined;
  } catch (error) {
    return error;
  }
}

describe('not found response comparison harness', () => {
  test('accepts identical responses for a foreign and a missing resource', async () => {
    await expectIndistinguishableNotFound({
      expectedCode: STRATEGY_NOT_FOUND,
      foreignResourceResponse: buildNotFound(),
      missingResourceResponse: buildNotFound(),
    });
  });

  test.each([
    [
      'foreign answers 403',
      buildErrorResponse(403, { code: STRATEGY_NOT_FOUND, message: NOT_FOUND_MESSAGE }),
    ],
    [
      'foreign uses another code',
      buildErrorResponse(404, { code: 'RESOURCE_NOT_FOUND', message: NOT_FOUND_MESSAGE }),
    ],
    [
      'foreign uses another message',
      buildErrorResponse(404, { code: STRATEGY_NOT_FOUND, message: 'Estratégia de outro dono.' }),
    ],
    [
      'foreign body has another length',
      buildErrorResponse(404, { code: STRATEGY_NOT_FOUND, message: `${NOT_FOUND_MESSAGE} ` }),
    ],
    [
      'foreign body carries an extra field',
      Response.json(
        { error: { code: STRATEGY_NOT_FOUND, message: NOT_FOUND_MESSAGE }, ownerHint: true },
        { status: 404 },
      ),
    ],
  ])('fails when %s', async (_caseName, foreignResourceResponse) => {
    const failure = await captureFailure(
      expectIndistinguishableNotFound({
        expectedCode: STRATEGY_NOT_FOUND,
        foreignResourceResponse,
        missingResourceResponse: buildNotFound(),
      }),
    );
    expect(failure).toBeInstanceOf(Error);
  });

  test('fails when the expected code does not follow <RESOURCE>_NOT_FOUND', async () => {
    const failure = await captureFailure(
      expectIndistinguishableNotFound({
        expectedCode: 'NOT_ALLOWED',
        foreignResourceResponse: buildNotFound(),
        missingResourceResponse: buildNotFound(),
      }),
    );
    expect(failure).toBeInstanceOf(Error);
  });
});
