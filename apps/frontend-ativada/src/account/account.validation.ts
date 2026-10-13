// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

export const profileSchema = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  displayCurrency: z.enum(['BRL', 'USD']),
  timezone: z.string(),
  alertTelegramEnabled: z.boolean(),
  telegramLinked: z.boolean(),
  // Ausente numa API mais antiga: o painel cai no padrão do servidor.
  limits: z.object({ maxActiveLivePaperRuns: z.number().int().min(1) }).optional(),
  createdAt: z.string(),
});

export const telegramLinkCodeSchema = z.object({
  code: z.string().min(1),
  expiresInSeconds: z.number().positive(),
});

export const deletionResultSchema = z.object({ status: z.string() });

export type Profile = z.infer<typeof profileSchema>;
export type TelegramLinkCode = z.infer<typeof telegramLinkCodeSchema>;
export type ProfilePatch = { readonly alertTelegramEnabled: boolean };

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isSameEmail(typed: string, expected: string | undefined): boolean {
  return expected !== undefined && normalizeEmail(typed) === normalizeEmail(expected);
}
