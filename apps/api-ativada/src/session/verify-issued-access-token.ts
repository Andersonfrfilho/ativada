// Copyright (c) 2026 Ada Technology. All rights reserved.
import { TOKEN_VERIFICATION_STATUS } from '../authentication/authentication.constant.js';
import type { AccessTokenVerifier } from '../authentication/access-token-verifier.js';

export const ISSUED_TOKEN_CHECK = {
  VALID: 'valid',
  REJECTED: 'rejected',
  UNAVAILABLE: 'unavailable',
} as const;

export type IssuedTokenCheck = (typeof ISSUED_TOKEN_CHECK)[keyof typeof ISSUED_TOKEN_CHECK];

export async function checkIssuedAccessToken(
  verifyAccessToken: AccessTokenVerifier,
  accessToken: string,
): Promise<IssuedTokenCheck> {
  const verification = await verifyAccessToken(accessToken);
  if (verification.status === TOKEN_VERIFICATION_STATUS.UNAVAILABLE) {
    return ISSUED_TOKEN_CHECK.UNAVAILABLE;
  }
  const isUsable =
    verification.status === TOKEN_VERIFICATION_STATUS.AUTHENTICATED &&
    verification.token.isEmailVerified;
  return isUsable ? ISSUED_TOKEN_CHECK.VALID : ISSUED_TOKEN_CHECK.REJECTED;
}
