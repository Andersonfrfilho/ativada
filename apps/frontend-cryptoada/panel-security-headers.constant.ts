// Copyright (c) 2026 Ada Technology. All rights reserved.

// A política do painel sem `frame-ancestors`: dentro de `<meta>` o navegador a ignora e avisa no console.
export const PANEL_CONTENT_SECURITY_POLICY_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
] as const;

// Só um cabeçalho HTTP impõe `frame-ancestors`; a borda (CDN/proxy) DEVE servir exatamente este conjunto (ADR 0001 §m).
export const PANEL_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': [
    ...PANEL_CONTENT_SECURITY_POLICY_DIRECTIVES,
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()',
};
