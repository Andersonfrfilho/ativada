// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { z } from '@ativada/environment';

export type DocumentedError = {
  readonly status: number;
  readonly code: string;
};

// Resposta de sucesso (uma rota pode ter mais de uma, como 201 e 200). `schema` descreve o `data` do envelope; `isList` acrescenta o bloco `pagination`. Com
// `contentType` (CSV, HTML) a resposta não leva envelope e `schema` descreve o corpo cru.
export type DocumentedSuccess = {
  readonly status: number;
  readonly description: string;
  readonly schema?: z.ZodType;
  readonly isList?: boolean;
  readonly contentType?: string;
};

// O que cada rota declara para o OpenAPI gerado (T3.4): resumo, esquemas Zod dos parâmetros, da consulta, do corpo e
// da resposta, e os códigos de erro próprios dela. Os erros comuns (401, 403, 429, 500) o gerador acrescenta pelo
// `access`. Os mesmos esquemas validam a requisição, então a documentação não tem como divergir da validação.
export type RouteDocumentation = {
  readonly summary: string;
  readonly tag: string;
  readonly params?: z.ZodType;
  readonly query?: z.ZodType;
  readonly body?: z.ZodType;
  readonly successes: readonly DocumentedSuccess[];
  readonly errors: readonly DocumentedError[];
};
