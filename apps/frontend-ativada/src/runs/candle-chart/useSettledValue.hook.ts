// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useState } from 'react';

// O valor só muda depois de parado por `delayMilliseconds`; sem atraso (0), é o próprio valor.
export function useSettledValue<TValue>(value: TValue, delayMilliseconds: number): TValue {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (delayMilliseconds <= 0) return undefined;
    const timer = setTimeout(() => setSettled(value), delayMilliseconds);
    return (): void => clearTimeout(timer);
  }, [value, delayMilliseconds]);
  return delayMilliseconds <= 0 ? value : settled;
}
