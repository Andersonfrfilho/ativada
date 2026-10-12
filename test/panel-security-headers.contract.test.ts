// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  PANEL_CONTENT_SECURITY_POLICY_DIRECTIVES,
  PANEL_SECURITY_HEADERS,
} from '../apps/frontend-ativada/panel-security-headers.constant.js';
import viteConfigFactory from '../apps/frontend-ativada/vite.config.js';

const CONFIG_API_URL = 'http://127.0.0.1:1';

function readConfig(mode: string): ReturnType<typeof viteConfigFactory> {
  Bun.env['VITE_API_URL'] = CONFIG_API_URL;
  return viteConfigFactory({ mode, command: 'build', isSsrBuild: false, isPreview: false });
}

describe('os cabeçalhos de segurança do painel', () => {
  test('o conjunto traz CSP com frame-ancestors none, X-Frame-Options, HSTS e Permissions-Policy', () => {
    const policy = PANEL_SECURITY_HEADERS['Content-Security-Policy'] ?? '';
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("default-src 'self'");
    expect(policy).not.toContain('unsafe-inline');
    expect(policy).not.toContain('unsafe-eval');
    expect(PANEL_SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
    expect(PANEL_SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
    expect(PANEL_SECURITY_HEADERS['Strict-Transport-Security']).toMatch(/max-age=\d+/);
    expect(PANEL_SECURITY_HEADERS['Permissions-Policy']).toContain('camera=()');
  });

  test('a diretiva da meta não leva frame-ancestors (o navegador a ignora e reclama)', () => {
    expect(PANEL_CONTENT_SECURITY_POLICY_DIRECTIVES.join('; ')).not.toContain('frame-ancestors');
  });

  test('o vite preview serve o conjunto inteiro, o mesmo que a borda deve servir', () => {
    const config = readConfig('production');
    expect(config.preview?.headers).toStrictEqual(PANEL_SECURITY_HEADERS);
  });
});
