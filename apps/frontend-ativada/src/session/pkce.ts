// Copyright (c) 2026 Ada Technology. All rights reserved.
const VERIFIER_BYTES = 48;
const STATE_BYTES = 24;
const SHA_256 = 'SHA-256';

function encodeBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function randomToken(byteCount: number): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(byteCount)));
}

export function createCodeVerifier(): string {
  return randomToken(VERIFIER_BYTES);
}

export function createState(): string {
  return randomToken(STATE_BYTES);
}

export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(SHA_256, new TextEncoder().encode(verifier));
  return encodeBase64Url(new Uint8Array(digest));
}
