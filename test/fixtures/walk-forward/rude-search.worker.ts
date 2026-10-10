// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parentPort } from 'node:worker_threads';

// Responde com um evento que o esquema não conhece.
parentPort?.on('message', () => parentPort?.postMessage({ type: 'result', surprise: true }));
parentPort?.postMessage({ type: 'started' });
