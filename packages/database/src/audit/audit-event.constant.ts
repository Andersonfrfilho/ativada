// Copyright (c) 2026 Ada Technology. All rights reserved.
export const AUDIT_ACTOR_KIND = {
  USER: 'user',
  ADMIN: 'admin',
  SYSTEM: 'system',
  TELEGRAM: 'telegram',
} as const;

export type AuditActorKind = (typeof AUDIT_ACTOR_KIND)[keyof typeof AUDIT_ACTOR_KIND];
