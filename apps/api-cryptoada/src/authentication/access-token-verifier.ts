// Copyright (c) 2026 Ada Technology. All rights reserved.
import { errors, jwtVerify, type JWTVerifyGetKey } from 'jose';

import {
  ACCEPTED_ALGORITHMS,
  CLOCK_TOLERANCE_SECONDS,
  JOSE_EXPIRED_CODE,
  JOSE_REJECTION_CODES,
  MAX_TOKEN_AGE,
  REJECTION_REASON,
  REQUIRED_CLAIMS,
  TOKEN_VERIFICATION_STATUS,
  type RejectionReason,
} from './authentication.constant.js';
import { createTokenClaimsSchema, type VerifiedAccessToken } from './token-claims.schema.js';

export type AccessTokenSettings = {
  readonly issuer: string;
  readonly audience: string;
  readonly authorizedParties: readonly string[];
};

export type TokenVerification =
  | {
      readonly status: typeof TOKEN_VERIFICATION_STATUS.AUTHENTICATED;
      readonly token: VerifiedAccessToken;
    }
  | { readonly status: typeof TOKEN_VERIFICATION_STATUS.REJECTED; readonly reason: RejectionReason }
  | { readonly status: typeof TOKEN_VERIFICATION_STATUS.UNAVAILABLE };

export type AccessTokenVerifier = (token: string) => Promise<TokenVerification>;

export type AccessTokenVerifierParams = {
  readonly settings: AccessTokenSettings;
  readonly getKey: JWTVerifyGetKey;
};

function reject(reason: RejectionReason): TokenVerification {
  return { status: TOKEN_VERIFICATION_STATUS.REJECTED, reason };
}

function classifyVerificationError(error: unknown): TokenVerification {
  if (!(error instanceof errors.JOSEError))
    return { status: TOKEN_VERIFICATION_STATUS.UNAVAILABLE };
  if (error.code === JOSE_EXPIRED_CODE) return reject(REJECTION_REASON.EXPIRED);
  if (JOSE_REJECTION_CODES.has(error.code)) return reject(REJECTION_REASON.INVALID);
  return { status: TOKEN_VERIFICATION_STATUS.UNAVAILABLE };
}

export function createAccessTokenVerifier(params: AccessTokenVerifierParams): AccessTokenVerifier {
  const claimsSchema = createTokenClaimsSchema(params.settings.authorizedParties);
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, params.getKey, {
        algorithms: [...ACCEPTED_ALGORITHMS],
        issuer: params.settings.issuer,
        audience: params.settings.audience,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        maxTokenAge: MAX_TOKEN_AGE,
        requiredClaims: [...REQUIRED_CLAIMS],
      });
      const claims = claimsSchema.safeParse(payload);
      if (!claims.success) return reject(REJECTION_REASON.INVALID);
      return { status: TOKEN_VERIFICATION_STATUS.AUTHENTICATED, token: claims.data };
    } catch (error: unknown) {
      return classifyVerificationError(error);
    }
  };
}
