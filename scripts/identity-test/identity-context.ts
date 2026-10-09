// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CleanupStack } from './cleanup-stack.js';
import type { IdentityEnvironment } from './identity-environment.js';

export type IdentityContext = {
  readonly environment: IdentityEnvironment;
  readonly cleanup: CleanupStack;
};

export function reportStep(step: string, detail: string): void {
  console.log(`identity-test: ${step} ok - ${detail}`);
}
