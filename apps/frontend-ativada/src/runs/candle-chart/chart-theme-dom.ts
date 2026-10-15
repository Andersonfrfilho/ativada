// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ColorResolver } from './chart-theme.js';

const OPAQUE_ALPHA = 255;
const ALPHA_PRECISION = 1_000;
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

function toRgbText(data: Uint8ClampedArray): string {
  const [red = 0, green = 0, blue = 0, alpha = 0] = data;
  if (alpha === OPAQUE_ALPHA) return `rgb(${red}, ${green}, ${blue})`;
  return `rgba(${red}, ${green}, ${blue}, ${Math.round((alpha / OPAQUE_ALPHA) * ALPHA_PRECISION) / ALPHA_PRECISION})`;
}

// A biblioteca não lê `color-mix()` nem `var()`: o token é resolvido pelo navegador e convertido em `rgb()` por um pixel
// de canvas. Sem canvas (testes) devolve o valor computado do token como está.
export function createCssColorResolver(root: HTMLElement): ColorResolver {
  const document = root.ownerDocument;
  const computed = document.defaultView?.getComputedStyle(root);
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return (token) => {
    const value = computed?.getPropertyValue(token).trim() ?? '';
    if (context === null) return value;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = TRANSPARENT;
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    return toRgbText(context.getImageData(0, 0, 1, 1).data);
  };
}
