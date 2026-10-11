// Copyright (c) 2026 Ada Technology. All rights reserved.

// A exportação LGPD é NDJSON, uma linha por registro: cabeçalho (`header`), cada linha de tabela (`row`), cada evento de
// auditoria (`audit`) e o fecho (`end`) com as contagens, que um arquivo cortado não tem.
export type ExportDocument = {
  readonly exportedAt: string;
  readonly account: Record<string, unknown>;
  readonly tables: Record<string, Record<string, unknown>[]>;
  readonly auditEvents: {
    readonly asActor: Record<string, unknown>[];
    readonly asTarget: Record<string, unknown>[];
  };
  readonly counts: Record<string, number> | undefined;
  readonly lineTypes: readonly string[];
};

type Line = {
  readonly type: string;
  readonly exportedAt?: string;
  readonly account?: Record<string, unknown>;
  readonly table?: string;
  readonly audience?: 'asActor' | 'asTarget';
  readonly row?: Record<string, unknown>;
  readonly counts?: Record<string, number>;
};

export function parseExportText(text: string): ExportDocument {
  const lines = text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Line);
  const tables: Record<string, Record<string, unknown>[]> = {};
  const auditEvents = {
    asActor: [] as Record<string, unknown>[],
    asTarget: [] as Record<string, unknown>[],
  };
  let header: Line | undefined;
  let end: Line | undefined;
  for (const line of lines) {
    if (line.type === 'header') header = line;
    else if (line.type === 'end') end = line;
    else if (line.type === 'row' && line.table !== undefined && line.row !== undefined) {
      (tables[line.table] ??= []).push(line.row);
    } else if (line.type === 'audit' && line.audience !== undefined && line.row !== undefined) {
      auditEvents[line.audience].push(line.row);
    }
  }
  return {
    exportedAt: header?.exportedAt ?? '',
    account: header?.account ?? {},
    tables,
    auditEvents,
    counts: end?.counts,
    lineTypes: lines.map((line) => line.type),
  };
}
