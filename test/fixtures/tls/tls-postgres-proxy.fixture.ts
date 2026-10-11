// Copyright (c) 2026 Ada Technology. All rights reserved.
import net from 'node:net';
import tls from 'node:tls';

import type { ServerCertificate } from './test-pki.fixture.js';

const SSL_REQUEST_CODE = 80_877_103;
const SSL_REQUEST_BYTES = 8;
const ACCEPT_TLS = 'S';

export type TlsPostgresProxy = {
  readonly port: number;
  // O que o servidor viu, em ordem: `sslrequest`, `secure` (handshake concluído) e `startup` (primeira mensagem já cifrada).
  readonly events: string[];
  readonly stop: () => Promise<void>;
};

function listen(server: net.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(typeof address === 'object' && address !== null ? address.port : 0);
    });
  });
}

// Um Postgres de mentira que só negocia TLS: aceita o SSLRequest em texto puro e entrega o resto da conexão a um servidor
// TLS de verdade (o handshake do cliente acontece de fato, com o certificado que o teste escolheu). Depois do primeiro
// pacote cifrado, a conexão é encerrada: o que importa é se o cliente CONFIOU no certificado.
export async function startTlsPostgresProxy(
  certificate: ServerCertificate,
): Promise<TlsPostgresProxy> {
  const events: string[] = [];
  const secureServer = tls.createServer(
    { key: certificate.keyPem, cert: certificate.certificatePem },
    (socket) => {
      events.push('secure');
      socket.on('error', () => undefined);
      socket.on('data', () => {
        events.push('startup');
        socket.destroy();
      });
    },
  );
  secureServer.on('tlsClientError', () => undefined);
  const securePort = await listen(secureServer);
  const front = net.createServer((client) => {
    client.on('error', () => undefined);
    client.once('data', (first: Buffer) => {
      const isSslRequest =
        first.length === SSL_REQUEST_BYTES && first.readUInt32BE(4) === SSL_REQUEST_CODE;
      if (!isSslRequest) return void client.destroy();
      events.push('sslrequest');
      client.write(ACCEPT_TLS);
      const upstream = net.connect(securePort, '127.0.0.1');
      upstream.on('error', () => undefined);
      client.pipe(upstream);
      upstream.pipe(client);
    });
  });
  const port = await listen(front);
  return {
    port,
    events,
    stop: (): Promise<void> => {
      front.close();
      secureServer.close();
      return Promise.resolve();
    },
  };
}
