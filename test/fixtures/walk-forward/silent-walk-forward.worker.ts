// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parentPort } from 'node:worker_threads';

// Pronta, recebe o pedido e nunca responde (o ouvinte mantém a thread viva): só o tempo limite a tira dali.
parentPort?.on('message', () => undefined);
parentPort?.postMessage({ type: 'ready' });
