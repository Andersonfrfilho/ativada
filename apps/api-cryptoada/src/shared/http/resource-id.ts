// Copyright (c) 2026 Ada Technology. All rights reserved.
const RESOURCE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// UUID em minúsculas (como no banco). Qualquer outra grafia é tratada como recurso inexistente: o chamador responde
// o mesmo 404 do recurso que não existe, sem mandar texto cru para a consulta.
export function parseResourceId(value: string | undefined): string | undefined {
  return value !== undefined && RESOURCE_ID_PATTERN.test(value) ? value : undefined;
}
