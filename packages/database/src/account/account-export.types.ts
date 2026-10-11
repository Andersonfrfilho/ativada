// Copyright (c) 2026 Ada Technology. All rights reserved.
export type ExportRow = Readonly<Record<string, unknown>>;

export type AccountExportAuditEvents = {
  readonly asActor: readonly ExportRow[];
  readonly asTarget: readonly ExportRow[];
};

export const EXPORT_AUDIT_AUDIENCE = { ACTOR: 'asActor', TARGET: 'asTarget' } as const;
export type ExportAuditAudience =
  (typeof EXPORT_AUDIT_AUDIENCE)[keyof typeof EXPORT_AUDIT_AUDIENCE];

// Uma página da exportação: linhas de UMA tabela do dono, ou de um dos dois grupos da auditoria. Nunca o conjunto inteiro.
export type AccountExportChunk =
  | { readonly kind: 'rows'; readonly table: string; readonly rows: readonly ExportRow[] }
  | {
      readonly kind: 'audit';
      readonly audience: ExportAuditAudience;
      readonly rows: readonly ExportRow[];
    };

export type StreamExportOptions = { readonly pageSize?: number | undefined };

export type AccountExport = {
  readonly account: ExportRow;
  readonly tables: Readonly<Record<string, readonly ExportRow[]>>;
  readonly auditEvents: AccountExportAuditEvents;
};
