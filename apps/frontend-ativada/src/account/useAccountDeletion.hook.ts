// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { useSessionService } from '../app/useAppContext.hook.js';
import { useDeleteAccountMutation } from './account.query.js';

export type AccountDeletion = {
  readonly mutation: UseMutationResult<{ status: string }, Error, void>;
  readonly handleDelete: () => Promise<void>;
  readonly handleSignInAgain: () => Promise<void>;
};

export function useAccountDeletion(): AccountDeletion {
  const session = useSessionService();
  const queryClient = useQueryClient();
  const mutation = useDeleteAccountMutation();

  async function handleSignInAgain(): Promise<void> {
    await session.end();
    queryClient.clear();
  }

  async function handleDelete(): Promise<void> {
    try {
      await mutation.mutateAsync();
    } catch {
      return;
    }
    await handleSignInAgain();
  }

  return { mutation, handleDelete, handleSignInAgain };
}
