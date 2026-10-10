// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parentPort } from 'node:worker_threads';

// Pronta, mas morre ao receber o primeiro pedido: o processo da thread cai no meio da combinação.
parentPort?.on('message', () => process.exit(1));
parentPort?.postMessage({ type: 'started' });
