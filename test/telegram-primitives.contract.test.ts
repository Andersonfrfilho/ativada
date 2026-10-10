// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { generateLinkCode, hashLinkCode } from '../apps/api-cryptoada/src/telegram/link-code.js';
import { LINK_CODE_ALPHABET } from '../apps/api-cryptoada/src/telegram/telegram.constant.js';
import { isWebhookSecretValid } from '../apps/api-cryptoada/src/telegram/webhook-secret.js';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
const SAMPLE_SIZE = 2_000;
const MINIMUM_CODE_LENGTH = 8;

describe('link code generation', () => {
  test('uses only the base32 alphabet and has at least 8 characters', () => {
    for (let sample = 0; sample < SAMPLE_SIZE; sample += 1) {
      const code = generateLinkCode();
      expect(code.length).toBeGreaterThanOrEqual(MINIMUM_CODE_LENGTH);
      for (const character of code) expect(LINK_CODE_ALPHABET).toContain(character);
    }
  });

  test('does not repeat and covers the whole alphabet', () => {
    const seen = new Set<string>();
    const characters = new Set<string>();
    for (let sample = 0; sample < SAMPLE_SIZE; sample += 1) {
      const code = generateLinkCode();
      seen.add(code);
      for (const character of code) characters.add(character);
    }
    expect(seen.size).toBe(SAMPLE_SIZE);
    expect(characters.size).toBe(LINK_CODE_ALPHABET.length);
  });

  test('does not use a non cryptographic generator', async () => {
    const source = await Bun.file(
      `${REPOSITORY_ROOT}apps/api-cryptoada/src/telegram/link-code.ts`,
    ).text();
    expect(source).not.toMatch(/Math\.random/);
    expect(source).toMatch(/getRandomValues|randomBytes|randomInt/);
  });

  test('hashes case-insensitively and never returns the code itself', () => {
    expect(hashLinkCode('abcdefghij')).toBe(hashLinkCode(' ABCDEFGHIJ '));
    expect(hashLinkCode('ABCDEFGHIJ')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('webhook secret comparison', () => {
  const secret = 'fake_contract_webhook_secret_0001';

  test('accepts only the exact secret, whatever the length of the attempt', () => {
    expect(isWebhookSecretValid(secret, secret)).toBe(true);
    expect(isWebhookSecretValid(null, secret)).toBe(false);
    expect(isWebhookSecretValid('', secret)).toBe(false);
    expect(isWebhookSecretValid(`${secret}x`, secret)).toBe(false);
    expect(isWebhookSecretValid(secret.slice(0, -1), secret)).toBe(false);
    expect(isWebhookSecretValid(secret.toUpperCase(), secret)).toBe(false);
  });

  test('compares fixed-size digests with timingSafeEqual', async () => {
    const source = await Bun.file(
      `${REPOSITORY_ROOT}apps/api-cryptoada/src/telegram/webhook-secret.ts`,
    ).text();
    expect(source).toMatch(/timingSafeEqual\(/);
    expect(source).not.toMatch(/(presented|expected)\w*\s*[!=]==?\s*(presented|expected)/);
  });
});
