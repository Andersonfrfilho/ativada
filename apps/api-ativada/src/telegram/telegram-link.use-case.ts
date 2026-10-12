// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope, TelegramLinkRepository } from '@ativada/database';
import { MILLISECONDS_PER_SECOND } from '@ativada/environment';

import { generateLinkCode, hashLinkCode } from './link-code.js';
import { LINK_CODE_TIME_TO_LIVE_SECONDS } from './telegram.constant.js';

export type IssuedLinkCode = {
  readonly code: string;
  readonly expiresInSeconds: number;
};

export type IssueLinkCodeUseCase = (scope: OwnerScope) => Promise<IssuedLinkCode>;

export type UnlinkTelegramUseCase = (scope: OwnerScope) => Promise<void>;

export type IssueLinkCodeDependencies = {
  readonly repository: TelegramLinkRepository;
  readonly now: () => number;
};

export function createIssueLinkCodeUseCase(
  dependencies: IssueLinkCodeDependencies,
): IssueLinkCodeUseCase {
  return async (scope) => {
    const code = generateLinkCode();
    const expiresAt = new Date(
      dependencies.now() + LINK_CODE_TIME_TO_LIVE_SECONDS * MILLISECONDS_PER_SECOND,
    );
    await dependencies.repository.issueCode(scope, { codeHash: hashLinkCode(code), expiresAt });
    return { code, expiresInSeconds: LINK_CODE_TIME_TO_LIVE_SECONDS };
  };
}

export function createUnlinkTelegramUseCase(
  repository: TelegramLinkRepository,
): UnlinkTelegramUseCase {
  return (scope) => repository.unlink(scope);
}
