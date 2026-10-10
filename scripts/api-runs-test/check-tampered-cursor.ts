// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MISSING_ID, SUBJECT_A } from './api-runs-test.constant.js';
import { assertCondition, reportLine, type ApiRunsContext } from './api-runs-test-context.js';

const LISTINGS = ['/v1/strategies', '/v1/runs'] as const;
const WELL_FORMED_WITH_INVALID_INSTANT = Buffer.from(
  JSON.stringify({ c: 'abc', i: MISSING_ID }),
).toString('base64url');

// Cursor bem formado cujo instante o Postgres recusa (22007) seria 500; tem de ser 400 como qualquer cursor adulterado.
export async function checkTamperedCursor(context: ApiRunsContext): Promise<void> {
  for (const listing of LISTINGS) {
    const response = await context.call({
      subject: SUBJECT_A,
      path: `${listing}?limit=2&cursor=${WELL_FORMED_WITH_INVALID_INSTANT}`,
    });
    assertCondition(
      response.status === 400,
      `${listing} com instante inválido: ${response.status}`,
    );
  }
  reportLine('cursor adulterado com instante inválido: 400 nas duas listagens, nenhum 500');
}
