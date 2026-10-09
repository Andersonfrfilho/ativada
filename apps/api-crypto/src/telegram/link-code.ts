// Copyright (c) 2026 Ada Technology. All rights reserved.
import { hashSecret } from '../shared/crypto/hash-secret.js';
import { LINK_CODE_ALPHABET, LINK_CODE_LENGTH } from './telegram.constant.js';

const ALPHABET_MASK = LINK_CODE_ALPHABET.length - 1;

export function generateLinkCode(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(LINK_CODE_LENGTH));
  return Array.from(randomBytes, (byte) => LINK_CODE_ALPHABET.charAt(byte & ALPHABET_MASK)).join(
    '',
  );
}

export function hashLinkCode(code: string): string {
  return hashSecret(code.trim().toUpperCase());
}
