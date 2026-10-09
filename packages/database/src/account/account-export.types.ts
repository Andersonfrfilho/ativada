// Copyright (c) 2026 Ada Technology. All rights reserved.
export type ExportRow = Readonly<Record<string, unknown>>;

export type AccountExportAuditEvents = {
  readonly asActor: readonly ExportRow[];
  readonly asTarget: readonly ExportRow[];
};

export type AccountExport = {
  readonly account: ExportRow;
  readonly tables: Readonly<Record<string, readonly ExportRow[]>>;
  readonly auditEvents: AccountExportAuditEvents;
};
