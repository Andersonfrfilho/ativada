// Copyright (c) 2026 Ada Technology. All rights reserved.

// Só texto, número e booleano: o tipo impede objeto de erro, mensagem de cliente ou segredo de entrar no log.
export type WorkerLogFields = Readonly<Record<string, string | number | boolean>>;

export type WorkerLogger = {
  readonly info: (message: string, fields?: WorkerLogFields) => void;
  readonly warn: (message: string, fields?: WorkerLogFields) => void;
  readonly error: (message: string, fields?: WorkerLogFields) => void;
};

export type WorkerLoggerOptions = {
  readonly appName: string;
  readonly write: (line: string) => void;
  readonly now?: () => Date;
};

export function createWorkerLogger(options: WorkerLoggerOptions): WorkerLogger {
  const now = options.now ?? ((): Date => new Date());

  function log(level: string, message: string, fields: WorkerLogFields = {}): void {
    const entry = {
      ...fields,
      level,
      timestamp: now().toISOString(),
      app: options.appName,
      message,
    };
    options.write(`${JSON.stringify(entry)}\n`);
  }

  return {
    info: (message, fields) => log('info', message, fields),
    warn: (message, fields) => log('warn', message, fields),
    error: (message, fields) => log('error', message, fields),
  };
}
