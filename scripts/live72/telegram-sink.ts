// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseEnvironment, z } from '../../packages/environment/src/index.js';

const LOOPBACK_HOST = '127.0.0.1';

const sinkEnvironmentSchema = z.object({ TELEGRAM_API_BASE_URL: z.url() });

function log(message: string, fields: Readonly<Record<string, string | number>>): void {
  process.stdout.write(
    `${JSON.stringify({ level: 'info', timestamp: new Date().toISOString(), app: 'telegram-sink', message, ...fields })}\n`,
  );
}

// Substitui a Bot API: aceita qualquer envio, devolve `ok` e registra só o tamanho (a rota leva o token, o corpo leva o chat).
export function startTelegramSink(baseUrl: string): { readonly stop: () => Promise<void> } {
  let delivered = 0;
  const server = Bun.serve({
    hostname: LOOPBACK_HOST,
    port: Number(new URL(baseUrl).port),
    async fetch(request): Promise<Response> {
      const body = await request.text();
      delivered += 1;
      log('telegram_sink.delivered', { delivered, bytes: body.length });
      return Response.json({ ok: true, result: { message_id: delivered } });
    },
  });
  log('telegram_sink.listening', { port: server.port ?? 0 });
  return { stop: async (): Promise<void> => void (await server.stop(true)) };
}

if (import.meta.main) {
  const environment = parseEnvironment(sinkEnvironmentSchema, Bun.env);
  const sink = startTelegramSink(environment.TELEGRAM_API_BASE_URL);
  const shutdown = (): void => void sink.stop().then(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
