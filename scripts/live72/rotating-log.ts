// Copyright (c) 2026 Ada Technology. All rights reserved.
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

export type RotatingLogOptions = {
  readonly path: string;
  readonly maximumBytes: number;
  readonly keptFiles: number;
};

export type RotatingLog = { readonly write: (chunk: Uint8Array) => void };

export function shouldRotate(params: {
  readonly currentBytes: number;
  readonly incomingBytes: number;
  readonly maximumBytes: number;
}): boolean {
  return (
    params.currentBytes > 0 && params.currentBytes + params.incomingBytes > params.maximumBytes
  );
}

// log.2 -> log.3, log.1 -> log.2, log -> log.1: o mais antigo além de `keptFiles` é apagado.
export function rotateFiles(path: string, keptFiles: number): void {
  rmSync(`${path}.${keptFiles}`, { force: true });
  for (let index = keptFiles - 1; index >= 1; index -= 1) {
    if (existsSync(`${path}.${index}`)) renameSync(`${path}.${index}`, `${path}.${index + 1}`);
  }
  renameSync(path, `${path}.1`);
}

export function createRotatingLog(options: RotatingLogOptions): RotatingLog {
  mkdirSync(dirname(options.path), { recursive: true });
  let currentBytes = existsSync(options.path) ? statSync(options.path).size : 0;
  return {
    write: (chunk): void => {
      const rotation = {
        currentBytes,
        incomingBytes: chunk.byteLength,
        maximumBytes: options.maximumBytes,
      };
      if (shouldRotate(rotation)) {
        rotateFiles(options.path, options.keptFiles);
        currentBytes = 0;
      }
      appendFileSync(options.path, chunk);
      currentBytes += chunk.byteLength;
    },
  };
}
