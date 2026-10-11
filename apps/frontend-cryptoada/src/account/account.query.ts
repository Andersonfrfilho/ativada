// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { HTTP_METHOD } from '@cryptoada/environment';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient } from '../app/useAppContext.hook.js';
import type { DownloadedFile } from '../http/api-client.js';
import { PROFILE_QUERY_KEY } from './account.constant.js';
import {
  deletionResultSchema,
  profileSchema,
  telegramLinkCodeSchema,
  type Profile,
  type ProfilePatch,
  type TelegramLinkCode,
} from './account.validation.js';
import { saveDownloadedFile } from './download-blob.js';

export function useProfileQuery(): UseQueryResult<Profile> {
  const client = useApiClient();
  return useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: () => client.request({ path: API_PATH.PROFILE, schema: profileSchema }),
  });
}

export function useUpdateProfileMutation(): UseMutationResult<Profile, Error, ProfilePatch> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) =>
      client.request({
        method: HTTP_METHOD.PATCH,
        path: API_PATH.PROFILE,
        body: patch,
        schema: profileSchema,
      }),
    onSuccess: (profile) => queryClient.setQueryData(PROFILE_QUERY_KEY, profile),
  });
}

export function useIssueTelegramCodeMutation(): UseMutationResult<TelegramLinkCode, Error, void> {
  const client = useApiClient();
  return useMutation({
    mutationFn: () =>
      client.request({
        method: HTTP_METHOD.POST,
        path: API_PATH.TELEGRAM_LINK,
        schema: telegramLinkCodeSchema,
      }),
  });
}

export function useUnlinkTelegramMutation(): UseMutationResult<void, Error, void> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      client.requestEmpty({ method: HTTP_METHOD.DELETE, path: API_PATH.TELEGRAM_LINK }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY }),
  });
}

export function useExportMutation(): UseMutationResult<DownloadedFile, Error, void> {
  const client = useApiClient();
  return useMutation({
    mutationFn: () => client.download(API_PATH.PROFILE_EXPORT),
    onSuccess: saveDownloadedFile,
  });
}

export function useDeleteAccountMutation(): UseMutationResult<{ status: string }, Error, void> {
  const client = useApiClient();
  return useMutation({
    mutationFn: () =>
      client.request({
        method: HTTP_METHOD.DELETE,
        path: API_PATH.PROFILE,
        schema: deletionResultSchema,
      }),
  });
}
