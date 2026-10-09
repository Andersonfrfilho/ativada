// Copyright (c) 2026 Ada Technology. All rights reserved.

export type CleanupStack = {
  readonly register: (description: string, action: () => Promise<void>) => void;
  readonly runAll: () => Promise<readonly string[]>;
};

export function createCleanupStack(): CleanupStack {
  const entries: { readonly description: string; readonly action: () => Promise<void> }[] = [];
  return {
    register: (description, action): void => {
      entries.push({ description, action });
    },
    runAll: async (): Promise<readonly string[]> => {
      const failures: string[] = [];
      for (const entry of entries.reverse()) {
        try {
          await entry.action();
        } catch (error: unknown) {
          failures.push(
            `${entry.description}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      return failures;
    },
  };
}
