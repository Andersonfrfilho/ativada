// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  REPORT_CONFIDENCE_MAX,
  REPORT_TEXT_MAX_LENGTH,
  RISK_LEVEL,
  TEAM_ACTION,
  TREND_STANCE,
} from '@ativada/model-agents';

export const SCHEMA_DIALECT = { STRICT: 'strict', GEMINI: 'gemini' } as const;
export type SchemaDialect = (typeof SCHEMA_DIALECT)[keyof typeof SCHEMA_DIALECT];

type SchemaNode = Readonly<Record<string, unknown>>;

const TEXT_DESCRIPTION = `uma linha de até ${REPORT_TEXT_MAX_LENGTH} caracteres`;

// O esquema estrito (OpenAI, Anthropic) exige tudo em `required`, `additionalProperties: false` e opcional como união com `null`,
// sem `minLength`/`maxLength`; o do Gemini usa o subconjunto OpenAPI em maiúsculas e `nullable`. Os limites valem no Zod da casa.
function typeOf(dialect: SchemaDialect, name: 'string' | 'object' | 'integer'): string {
  return dialect === SCHEMA_DIALECT.GEMINI ? name.toUpperCase() : name;
}

function textField(dialect: SchemaDialect): SchemaNode {
  return { type: typeOf(dialect, 'string'), description: TEXT_DESCRIPTION };
}

function enumField(dialect: SchemaDialect, values: readonly string[]): SchemaNode {
  return { type: typeOf(dialect, 'string'), enum: [...values] };
}

function priceField(dialect: SchemaDialect): SchemaNode {
  const description = 'preço em texto decimal; null fora de uma compra';
  if (dialect === SCHEMA_DIALECT.GEMINI) {
    return { type: 'STRING', nullable: true, description };
  }
  return { type: ['string', 'null'], description };
}

function objectOf(
  dialect: SchemaDialect,
  properties: Readonly<Record<string, SchemaNode>>,
): SchemaNode {
  return {
    type: typeOf(dialect, 'object'),
    properties,
    required: Object.keys(properties),
    ...(dialect === SCHEMA_DIALECT.STRICT ? { additionalProperties: false } : {}),
  };
}

export function buildTeamReportJsonSchema(dialect: SchemaDialect): SchemaNode {
  return objectOf(dialect, {
    trend: objectOf(dialect, {
      stance: enumField(dialect, Object.values(TREND_STANCE)),
      reason: textField(dialect),
    }),
    risk: objectOf(dialect, {
      level: enumField(dialect, Object.values(RISK_LEVEL)),
      reason: textField(dialect),
    }),
    decision: objectOf(dialect, {
      action: enumField(dialect, Object.values(TEAM_ACTION)),
      entryPrice: priceField(dialect),
      targetPrice: priceField(dialect),
      stopPrice: priceField(dialect),
      confidence: {
        type: typeOf(dialect, 'integer'),
        minimum: 0,
        maximum: REPORT_CONFIDENCE_MAX,
      },
      reason: textField(dialect),
    }),
  });
}
