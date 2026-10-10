// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parentPort } from 'node:worker_threads';

// Responde com um evento fora do esquema.
parentPort?.on('message', () => parentPort?.postMessage({ type: 'completed', surprise: true }));
parentPort?.postMessage({ type: 'ready' });
