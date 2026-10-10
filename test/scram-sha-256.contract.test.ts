// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadDatabaseListenerApi } from './fixtures/postgres-wire/database-source.fixture.js';

const { scram } = await loadDatabaseListenerApi();
const { createScramClient, ScramError, SCRAM_ERROR_CODE } = scram;

// Vetor do RFC 7677 §3 (SCRAM-SHA-256): senha "pencil", 4096 iterações.
const RFC_USER = 'user';
const RFC_PASSWORD = 'pencil';
const RFC_CLIENT_NONCE = 'rOprNGfwEbeRWgbNEkqO';
const RFC_SERVER_FIRST =
  'r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096';
const RFC_CLIENT_FINAL =
  'c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,p=dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=';
const RFC_SERVER_FINAL = 'v=6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=';

function rfcClient(): ReturnType<typeof scram.createScramClient> {
  return createScramClient({ username: RFC_USER, password: RFC_PASSWORD, nonce: RFC_CLIENT_NONCE });
}

async function codeOf(action: () => unknown): Promise<string | undefined> {
  try {
    await action();
    return undefined;
  } catch (error: unknown) {
    return error instanceof ScramError ? error.code : 'OTHER';
  }
}

describe('SCRAM-SHA-256 client', () => {
  test('first message is the GS2 header plus the bare message', () => {
    expect(rfcClient().clientFirstMessage).toBe(`n,,n=user,r=${RFC_CLIENT_NONCE}`);
  });

  test('reproduces the RFC 7677 client-final message and accepts the server signature', async () => {
    const client = rfcClient();
    expect(await client.respondToServerFirst(RFC_SERVER_FIRST)).toBe(RFC_CLIENT_FINAL);
    expect(() => client.verifyServerFinal(RFC_SERVER_FINAL)).not.toThrow();
  });

  test('rejects a server signature that does not match (mutual authentication)', async () => {
    const client = rfcClient();
    await client.respondToServerFirst(RFC_SERVER_FIRST);
    const forged = `v=${'A'.repeat(43)}=`;
    expect(await codeOf(() => client.verifyServerFinal(forged))).toBe(
      SCRAM_ERROR_CODE.SERVER_SIGNATURE_MISMATCH,
    );
  });

  test('rejects a server nonce that does not extend the client nonce', async () => {
    const forged = RFC_SERVER_FIRST.replace('r=rOprNGfwEbeRWgbNEkqO', 'r=outroNonceQualquer');
    expect(await codeOf(() => rfcClient().respondToServerFirst(forged))).toBe(
      SCRAM_ERROR_CODE.NONCE_MISMATCH,
    );
  });

  test('rejects an iteration count above the ceiling (a hostile server cannot burn the CPU)', async () => {
    // Um centésimo a mais que o teto: o mutante que o remove computa 1.000.001 iterações (≈ 0,3 s), não 2 bilhões.
    const hostile = RFC_SERVER_FIRST.replace('i=4096', 'i=1000001');
    expect(await codeOf(() => rfcClient().respondToServerFirst(hostile))).toBe(
      SCRAM_ERROR_CODE.ITERATIONS_OUT_OF_RANGE,
    );
  });

  test('rejects zero iterations and a malformed server-first message', async () => {
    const zero = RFC_SERVER_FIRST.replace('i=4096', 'i=0');
    expect(await codeOf(() => rfcClient().respondToServerFirst(zero))).toBe(
      SCRAM_ERROR_CODE.ITERATIONS_OUT_OF_RANGE,
    );
    expect(await codeOf(() => rfcClient().respondToServerFirst('lixo'))).toBe(
      SCRAM_ERROR_CODE.INVALID_SERVER_MESSAGE,
    );
  });

  test('rejects a server-final that is an error or lacks the verifier', async () => {
    const client = rfcClient();
    await client.respondToServerFirst(RFC_SERVER_FIRST);
    expect(await codeOf(() => client.verifyServerFinal('e=invalid-proof'))).toBe(
      SCRAM_ERROR_CODE.INVALID_SERVER_MESSAGE,
    );
  });

  test('refuses a non-ASCII password instead of skipping SASLprep silently', async () => {
    const client = createScramClient({ username: '', password: 'sénha', nonce: 'abc' });
    expect(await codeOf(() => client.respondToServerFirst(RFC_SERVER_FIRST))).toBe(
      SCRAM_ERROR_CODE.UNSUPPORTED_PASSWORD,
    );
  });

  test('escapes = and , in the user name', () => {
    const client = createScramClient({ username: 'a=b,c', password: 'x', nonce: 'n' });
    expect(client.clientFirstMessage).toBe('n,,n=a=3Db=2Cc,r=n');
  });
});
