// Copyright (c) 2026 Ada Technology. All rights reserved.
import { LOG_LEVEL, type LogLevel } from './logging.constant.js';
import { redactFields } from './redact.js';

export type LogFields = Readonly<Record<string, unknown>>;

export type Logger = {
  readonly debug: (message: string, fields?: LogFields) => void;
  readonly info: (message: string, fields?: LogFields) => void;
  readonly warn: (message: string, fields?: LogFields) => void;
  readonly error: (message: string, fields?: LogFields) => void;
};

export type LoggerOptions = {
  readonly appName: string;
  readonly write: (line: string) => void;
  readonly now?: () => Date;
};

export function createLogger(options: LoggerOptions): Logger {
  const now = options.now ?? ((): Date => new Date());

  function log(level: LogLevel, message: string, fields: LogFields = {}): void {
    const baseFields = {
      level,
      timestamp: now().toISOString(),
      app: options.appName,
      message,
    };
    const entry = { ...baseFields, ...redactFields(fields), ...baseFields };
    options.write(`${JSON.stringify(entry)}\n`);
  }

  return {
    debug: (message, fields) => log(LOG_LEVEL.DEBUG, message, fields),
    info: (message, fields) => log(LOG_LEVEL.INFO, message, fields),
    warn: (message, fields) => log(LOG_LEVEL.WARN, message, fields),
    error: (message, fields) => log(LOG_LEVEL.ERROR, message, fields),
  };
}
