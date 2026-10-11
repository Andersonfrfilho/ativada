// Copyright (c) 2026 Ada Technology. All rights reserved.
// O Vite exige `export default` neste arquivo; o lint tem uma exceção nomeada para ele.
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin, type UserConfig } from 'vite';

import {
  PANEL_CONTENT_SECURITY_POLICY_DIRECTIVES,
  PANEL_SECURITY_HEADERS,
} from './panel-security-headers.constant.js';

const API_PATH_PREFIX = '/v1';
const LOOPBACK_HOST = '127.0.0.1';
const DEFAULT_PANEL_PORT = 56100;
const CONTENT_SECURITY_POLICY = PANEL_CONTENT_SECURITY_POLICY_DIRECTIVES.join('; ');

// A política só vale no build: o servidor de desenvolvimento injeta um script embutido (React Refresh).
function createContentSecurityPolicyPlugin(): Plugin {
  return {
    name: 'cryptoada-content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) => ({
      html,
      tags: [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
          injectTo: 'head-prepend',
        },
      ],
    }),
  };
}

export default defineConfig(({ mode }): UserConfig => {
  const environment = loadEnv(mode, process.cwd(), '');
  const port = Number(environment['PANEL_PORT'] ?? DEFAULT_PANEL_PORT);
  const apiUrl = environment['VITE_API_URL'];
  if (apiUrl === undefined) throw new Error('VITE_API_URL ausente: carregue o env do ambiente.');
  const proxy = { [API_PATH_PREFIX]: { target: apiUrl, ws: true, changeOrigin: false } };
  return {
    plugins: [react(), createContentSecurityPolicyPlugin()],
    server: { host: LOOPBACK_HOST, port, strictPort: true, proxy },
    preview: {
      host: LOOPBACK_HOST,
      port,
      strictPort: true,
      proxy,
      headers: PANEL_SECURITY_HEADERS,
    },
    build: { target: 'es2023', sourcemap: false },
  };
});
