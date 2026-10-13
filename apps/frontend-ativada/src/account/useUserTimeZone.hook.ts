// Copyright (c) 2026 Ada Technology. All rights reserved.
import { resolveTimeZone, UTC_TIME_ZONE } from '../format/zoned-time.js';
import { useProfileQuery } from './account.query.js';

// Enquanto o perfil carrega a tela mostra UTC (e diz "GMT"); depois, o fuso do usuário ou o padrão se ele for inválido.
export function useUserTimeZone(): string {
  const profile = useProfileQuery();
  if (profile.isPending) return UTC_TIME_ZONE;
  return resolveTimeZone(profile.data?.timezone);
}
