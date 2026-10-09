// Copyright (c) 2026 Ada Technology. All rights reserved.
export const MIGRATIONS_FOLDER: string = new URL('../drizzle', import.meta.url).pathname;
export const ROLLBACK_SUFFIX = '.rollback.sql';
export const LOWERCASE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
