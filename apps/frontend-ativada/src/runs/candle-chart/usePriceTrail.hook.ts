// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

import type { StreamCandle } from '../../live/stream.validation.js';
import { EMPTY_TRAIL, extendTrail, type PriceTrail } from './price-trail.js';

// Guarda os pontos do preço real da vela de agora. Estado derivado do que chega por prop: ajusta durante a renderização,
// sem efeito, e `extendTrail` devolve o mesmo objeto quando nada mudou (o ajuste para na segunda passada).
export function usePriceTrail(forming: StreamCandle | undefined): PriceTrail {
  const [trail, setTrail] = useState<PriceTrail>(EMPTY_TRAIL);
  const next = forming === undefined ? trail : extendTrail(trail, forming);
  if (next !== trail) setTrail(next);
  return next;
}
