// Copyright (c) 2026 Ada Technology. All rights reserved.

// Os gestos de mãos e corpo que um agente faz enquanto espera: digitar, levar papéis, apontar e balançar de lado.
export const GESTURES = ['type', 'paper', 'point', 'sway'] as const;
export type Gesture = (typeof GESTURES)[number];
