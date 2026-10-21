// Copyright (c) 2026 Ada Technology. All rights reserved.

// Proxy TCP de teste entre os processos e o Postgres. `docker restart` e `docker pause` NÃO reproduzem a meia conexão que o
// encaminhador de porta do Docker Desktop deixa quando o computador dorme (ADR 0002, "Ajuste ao plan D7"): aqui as conexões
// podem ser derrubadas, recusadas ou EMUDECIDAS sem fechar.

export const OUTAGE_PROXY_MODE = {
  // Encaminha as conexões novas e deixa as existentes como estão.
  FORWARD: 'forward',
  // Banco fora: derruba todas as conexões e fecha cada nova na hora (como um servidor que não atende).
  REFUSE: 'refuse',
  // Meia conexão: as conexões abertas param de passar dados sem fechar, PARA SEMPRE; as novas são aceitas e ficam mudas
  // enquanto o modo durar. Depois de `FORWARD`, só as conexões novas voltam a funcionar.
  MUTE: 'mute',
} as const;
export type OutageProxyMode = (typeof OUTAGE_PROXY_MODE)[keyof typeof OUTAGE_PROXY_MODE];

const LOOPBACK_HOST = '127.0.0.1';

export type OutageProxyParams = {
  readonly targetHost: string;
  readonly targetPort: number;
};

export type OutageProxy = {
  readonly host: string;
  readonly port: number;
  readonly setMode: (mode: OutageProxyMode) => void;
  readonly mode: () => OutageProxyMode;
  // Conexões do cliente que seguem abertas (mudas ou não).
  readonly openConnectionCount: () => number;
  readonly stop: () => void;
};

type Connection = {
  isMuted: boolean;
  client: Bun.Socket<Connection | undefined> | undefined;
  upstream: Bun.Socket<undefined> | undefined;
  pending: Uint8Array[];
};

export function startOutageProxy(params: OutageProxyParams): OutageProxy {
  let mode: OutageProxyMode = OUTAGE_PROXY_MODE.FORWARD;
  const connections = new Set<Connection>();

  function destroy(connection: Connection): void {
    connections.delete(connection);
    connection.client?.end();
    connection.upstream?.end();
  }

  function connectUpstream(connection: Connection): void {
    Bun.connect({
      hostname: params.targetHost,
      port: params.targetPort,
      socket: {
        open(upstream) {
          connection.upstream = upstream;
          for (const chunk of connection.pending) upstream.write(chunk);
          connection.pending = [];
        },
        data(_upstream, chunk) {
          if (!connection.isMuted) connection.client?.write(chunk);
        },
        close() {
          if (!connection.isMuted) destroy(connection);
        },
        error() {
          if (!connection.isMuted) destroy(connection);
        },
      },
    }).catch(() => destroy(connection));
  }

  function forwardFromClient(connection: Connection, chunk: Uint8Array): void {
    if (connection.isMuted) return;
    if (connection.upstream === undefined) connection.pending.push(new Uint8Array(chunk));
    else connection.upstream.write(chunk);
  }

  const listener = Bun.listen<Connection | undefined>({
    hostname: LOOPBACK_HOST,
    port: 0,
    socket: {
      open(socket) {
        if (mode === OUTAGE_PROXY_MODE.REFUSE) {
          socket.end();
          return;
        }
        const connection: Connection = {
          isMuted: mode === OUTAGE_PROXY_MODE.MUTE,
          client: socket,
          upstream: undefined,
          pending: [],
        };
        socket.data = connection;
        connections.add(connection);
        if (!connection.isMuted) connectUpstream(connection);
      },
      data(socket, chunk) {
        if (socket.data !== undefined) forwardFromClient(socket.data, chunk);
      },
      close(socket) {
        const connection = socket.data;
        if (connection === undefined || connection.isMuted) return;
        destroy(connection);
      },
    },
  });

  return {
    host: LOOPBACK_HOST,
    port: listener.port,
    mode: () => mode,
    openConnectionCount: () => connections.size,
    setMode: (next): void => {
      mode = next;
      if (next === OUTAGE_PROXY_MODE.MUTE) {
        for (const connection of connections) connection.isMuted = true;
      }
      if (next === OUTAGE_PROXY_MODE.REFUSE) {
        for (const connection of [...connections]) destroy(connection);
      }
    },
    stop: (): void => {
      for (const connection of [...connections]) destroy(connection);
      void listener.stop(true);
    },
  };
}
