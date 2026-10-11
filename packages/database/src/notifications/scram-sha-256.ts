// Copyright (c) 2026 Ada Technology. All rights reserved.
import { timingSafeEqual } from 'node:crypto';

// SCRAM-SHA-256 (RFC 5802 e 7677) do lado do cliente, só com Web Crypto: o Postgres 14+ usa este método por padrão.
const GS2_HEADER = 'n,,';
const CHANNEL_BINDING = 'c=biws';
const CLIENT_KEY_LABEL = 'Client Key';
const SERVER_KEY_LABEL = 'Server Key';
// Piso do RFC 7677 §4; o teto (2^18) protege a CPU de um servidor hostil e ainda cobre `scram_iterations` de 64x o padrão.
export const SCRAM_MINIMUM_ITERATIONS = 4_096;
export const SCRAM_MAXIMUM_ITERATIONS = 262_144;
const DIGEST_BITS = 256;
const ASCII_PATTERN = /^[ -~]*$/;
const TEXT_ENCODER = new TextEncoder();

export const SCRAM_ERROR_CODE = {
  INVALID_SERVER_MESSAGE: 'INVALID_SERVER_MESSAGE',
  NONCE_MISMATCH: 'NONCE_MISMATCH',
  ITERATIONS_OUT_OF_RANGE: 'ITERATIONS_OUT_OF_RANGE',
  UNSUPPORTED_PASSWORD: 'UNSUPPORTED_PASSWORD',
  SERVER_SIGNATURE_MISMATCH: 'SERVER_SIGNATURE_MISMATCH',
} as const;

export type ScramErrorCode = (typeof SCRAM_ERROR_CODE)[keyof typeof SCRAM_ERROR_CODE];

// Mensagem fixa por código: nada do que o servidor mandou volta no texto.
export class ScramError extends Error {
  constructor(readonly code: ScramErrorCode) {
    super(`Autenticação SCRAM recusada (${code}).`);
    this.name = 'ScramError';
  }
}

export type ScramClientParams = {
  readonly username: string;
  readonly password: string;
  readonly nonce: string;
};

export type ScramClient = {
  readonly clientFirstMessage: string;
  readonly respondToServerFirst: (serverFirst: string) => Promise<string>;
  readonly verifyServerFinal: (serverFinal: string) => void;
};

type ServerFirst = {
  readonly nonce: string;
  readonly salt: Uint8Array<ArrayBuffer>;
  readonly iterations: number;
};

function parseAttributes(message: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const part of message.split(',')) {
    if (part.length < 2 || part[1] !== '=') {
      throw new ScramError(SCRAM_ERROR_CODE.INVALID_SERVER_MESSAGE);
    }
    attributes.set(part.slice(0, 1), part.slice(2));
  }
  return attributes;
}

function parseServerFirst(message: string, clientNonce: string): ServerFirst {
  const attributes = parseAttributes(message);
  const nonce = attributes.get('r');
  const salt = attributes.get('s');
  const iterations = Number(attributes.get('i'));
  if (nonce === undefined || salt === undefined) {
    throw new ScramError(SCRAM_ERROR_CODE.INVALID_SERVER_MESSAGE);
  }
  if (!nonce.startsWith(clientNonce) || nonce.length === clientNonce.length) {
    throw new ScramError(SCRAM_ERROR_CODE.NONCE_MISMATCH);
  }
  const isInRange =
    Number.isInteger(iterations) &&
    iterations >= SCRAM_MINIMUM_ITERATIONS &&
    iterations <= SCRAM_MAXIMUM_ITERATIONS;
  if (!isInRange) {
    throw new ScramError(SCRAM_ERROR_CODE.ITERATIONS_OUT_OF_RANGE);
  }
  return { nonce, salt: Uint8Array.fromBase64(salt), iterations };
}

async function hmac(key: Uint8Array<ArrayBuffer>, data: string): Promise<Uint8Array<ArrayBuffer>> {
  const imported = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, TEXT_ENCODER.encode(data)));
}

async function deriveSaltedPassword(
  password: string,
  server: ServerFirst,
): Promise<Uint8Array<ArrayBuffer>> {
  const material = await crypto.subtle.importKey(
    'raw',
    TEXT_ENCODER.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: server.salt, iterations: server.iterations },
    material,
    DIGEST_BITS,
  );
  return new Uint8Array(bits);
}

function xor(left: Uint8Array, right: Uint8Array): Uint8Array {
  return left.map((byte, index) => byte ^ (right[index] ?? 0));
}

function escapeUsername(username: string): string {
  return username.replaceAll('=', '=3D').replaceAll(',', '=2C');
}

export function createScramClient(params: ScramClientParams): ScramClient {
  const clientFirstBare = `n=${escapeUsername(params.username)},r=${params.nonce}`;
  let expectedServerSignature: Uint8Array | undefined;

  async function respondToServerFirst(serverFirst: string): Promise<string> {
    if (!ASCII_PATTERN.test(params.password)) {
      throw new ScramError(SCRAM_ERROR_CODE.UNSUPPORTED_PASSWORD);
    }
    const server = parseServerFirst(serverFirst, params.nonce);
    const withoutProof = `${CHANNEL_BINDING},r=${server.nonce}`;
    const authMessage = `${clientFirstBare},${serverFirst},${withoutProof}`;
    const salted = await deriveSaltedPassword(params.password, server);
    const clientKey = await hmac(salted, CLIENT_KEY_LABEL);
    const storedKey = new Uint8Array(await crypto.subtle.digest('SHA-256', clientKey));
    const clientSignature = await hmac(storedKey, authMessage);
    const serverKey = await hmac(salted, SERVER_KEY_LABEL);
    expectedServerSignature = await hmac(serverKey, authMessage);
    return `${withoutProof},p=${xor(clientKey, clientSignature).toBase64()}`;
  }

  function verifyServerFinal(serverFinal: string): void {
    const attributes = parseAttributes(serverFinal);
    const verifier = attributes.get('v');
    if (verifier === undefined || expectedServerSignature === undefined) {
      throw new ScramError(SCRAM_ERROR_CODE.INVALID_SERVER_MESSAGE);
    }
    const received = Uint8Array.fromBase64(verifier);
    const isMatch =
      received.length === expectedServerSignature.length &&
      timingSafeEqual(received, expectedServerSignature);
    if (!isMatch) throw new ScramError(SCRAM_ERROR_CODE.SERVER_SIGNATURE_MISMATCH);
  }

  return {
    clientFirstMessage: `${GS2_HEADER}${clientFirstBare}`,
    respondToServerFirst,
    verifyServerFinal,
  };
}
