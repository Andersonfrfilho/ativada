// Copyright (c) 2026 Ada Technology. All rights reserved.
export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

// O driver bun-sql só grava jsonb corretamente a partir de objeto ou lista; escalar no topo não é aceito.
export type JsonContainer = readonly JsonValue[] | { readonly [key: string]: JsonValue };
