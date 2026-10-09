// Copyright (c) 2026 Ada Technology. All rights reserved.
import { timingSafeEqual } from 'node:crypto';

import { hashSecret } from '../shared/crypto/hash-secret.js';

export function isWebhookSecretValid(presented: string | null, expected: string): boolean {
  if (presented === null) return false;
  const presentedDigest = Buffer.from(hashSecret(presented), 'hex');
  const expectedDigest = Buffer.from(hashSecret(expected), 'hex');
  return timingSafeEqual(presentedDigest, expectedDigest);
}
