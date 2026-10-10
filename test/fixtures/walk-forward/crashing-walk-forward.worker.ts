// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parentPort } from 'node:worker_threads';

// Pronta, mas morre ao receber o pedido.
parentPort?.on('message', () => process.exit(1));
parentPort?.postMessage({ type: 'ready' });
