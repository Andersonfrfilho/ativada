// Copyright (c) 2026 Ada Technology. All rights reserved.
export const EXAMPLE_SEED_OUTCOME = {
  SEEDED: 'seeded',
  SKIPPED: 'skipped',
} as const;
export type ExampleSeedOutcome = (typeof EXAMPLE_SEED_OUTCOME)[keyof typeof EXAMPLE_SEED_OUTCOME];
