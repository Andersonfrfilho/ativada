// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFile } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { computeServerEndPointHash } from '../packages/database/src/notifications/tls-server-end-point.js';
import { OID_ED25519, syntheticCertificate } from './fixtures/tls/synthetic-certificate.fixture.js';
import {
  createTestPki,
  type ServerCertificate,
  type TestPki,
} from './fixtures/tls/test-pki.fixture.js';

setDefaultTimeout(20_000);

let pki: TestPki;

beforeAll(async () => {
  pki = await createTestPki();
});

afterAll(async () => {
  await pki.dispose();
});

// O oráculo é o `openssl dgst` sobre o mesmo DER: nenhuma linha do código de produção entra na conta esperada.
async function opensslDigest(algorithm: string, certificate: ServerCertificate): Promise<string> {
  const output = await pki.openssl(['dgst', `-${algorithm}`, '-hex', certificate.derPath]);
  return output.trim().split('= ').at(-1) ?? '';
}

async function derOf(certificate: ServerCertificate): Promise<Uint8Array> {
  return new Uint8Array(await readFile(certificate.derPath));
}

function toHex(bytes: Uint8Array | undefined): string {
  return bytes === undefined
    ? 'indefinido'
    : [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('tls-server-end-point (RFC 5929 §4.1): o hash do certificado do servidor', () => {
  test('assinatura ECDSA-SHA256: SHA-256 do DER', async () => {
    const hash = await computeServerEndPointHash(await derOf(pki.forHost));
    expect(toHex(hash)).toBe(await opensslDigest('sha256', pki.forHost));
  });

  test('assinatura SHA-384: o hash acompanha o da assinatura, SHA-384', async () => {
    const hash = await computeServerEndPointHash(await derOf(pki.signedWith384));
    expect(toHex(hash)).toBe(await opensslDigest('sha384', pki.signedWith384));
  });

  test('assinatura SHA-512: SHA-512', async () => {
    const hash = await computeServerEndPointHash(await derOf(pki.signedWith512));
    expect(toHex(hash)).toBe(await opensslDigest('sha512', pki.signedWith512));
  });

  test.each([
    ['sha384WithRSAEncryption', '2a864886f70d01010c', 'SHA-384'],
    ['sha512WithRSAEncryption', '2a864886f70d01010d', 'SHA-512'],
  ])('%s: o hash acompanha o da assinatura', async (_name, oidHex, algorithm) => {
    const der = syntheticCertificate(oidHex);
    const expected = new Uint8Array(await crypto.subtle.digest(algorithm, new Uint8Array(der)));
    expect(toHex(await computeServerEndPointHash(der))).toBe(toHex(expected));
  });

  test.each([
    ['md5WithRSAEncryption', '2a864886f70d010104'],
    ['sha1WithRSAEncryption', '2a864886f70d010105'],
    ['ecdsa-with-SHA1', '2a8648ce3d0401'],
  ])('%s é fraco: usa SHA-256, como manda a RFC', async (_name, oidHex) => {
    const der = syntheticCertificate(oidHex);
    const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(der)));
    expect(toHex(await computeServerEndPointHash(der))).toBe(toHex(expected));
  });

  test('algoritmo de assinatura que não sabemos mapear (Ed25519) não inventa hash: não há ligação de canal', async () => {
    expect(await computeServerEndPointHash(syntheticCertificate(OID_ED25519))).toBeUndefined();
  });

  test.each([
    ['vazio', new Uint8Array(0)],
    ['lixo', Uint8Array.of(1, 2, 3, 4, 5)],
    ['SEQUENCE que promete mais do que há', Uint8Array.of(0x30, 0x82, 0xff, 0xff, 0x30)],
    ['sem o algoritmo de assinatura', Uint8Array.of(0x30, 0x03, 0x30, 0x01, 0x00)],
  ])('entrada malformada (%s) devolve indefinido, sem lançar', async (_name, bytes) => {
    expect(await computeServerEndPointHash(bytes)).toBeUndefined();
  });
});
