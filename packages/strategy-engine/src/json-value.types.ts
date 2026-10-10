// Copyright (c) 2026 Ada Technology. All rights reserved.

export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };
