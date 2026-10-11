// Copyright (c) 2026 Ada Technology. All rights reserved.
export const CONTENT_SECURITY_POLICY_HEADER = 'Content-Security-Policy';

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Content-Security-Policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()',
};

export const CORS_HEADER = {
  ALLOW_ORIGIN: 'Access-Control-Allow-Origin',
  ALLOW_CREDENTIALS: 'Access-Control-Allow-Credentials',
  ALLOW_METHODS: 'Access-Control-Allow-Methods',
  ALLOW_HEADERS: 'Access-Control-Allow-Headers',
  EXPOSE_HEADERS: 'Access-Control-Expose-Headers',
  MAX_AGE: 'Access-Control-Max-Age',
  REQUEST_METHOD: 'Access-Control-Request-Method',
} as const;

export const CORS_ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
export const CORS_ALLOWED_HEADERS = 'Authorization, Content-Type, X-Requested-With';
export const CORS_EXPOSED_HEADERS = 'Retry-After, X-Trace-Id';
export const CORS_PREFLIGHT_MAX_AGE_SECONDS = '600';
