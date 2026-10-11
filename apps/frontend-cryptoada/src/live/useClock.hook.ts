// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useState } from 'react';

// Relógio local que avança sozinho: o "sem dados há N s" precisa contar mesmo quando nenhuma mensagem chega.
export function useClock(intervalMilliseconds: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMilliseconds);
    return (): void => window.clearInterval(timer);
  }, [intervalMilliseconds]);

  return now;
}
