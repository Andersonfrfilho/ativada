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

// A limpeza roda em finally: imprime o que falhou (sem trocar o erro original) e devolve a lista.
export async function runCleanupReporting(cleanup: CleanupStack): Promise<readonly string[]> {
  const failures = await cleanup.runAll();
  for (const failure of failures) console.error(`limpeza falhou: ${failure}`);
  return failures;
}
