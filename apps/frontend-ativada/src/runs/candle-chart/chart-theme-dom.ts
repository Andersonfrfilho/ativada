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
// de canvas. Sem canvas (testes) devolve o valor computado do token como está. O token vale no elemento pedido (uma moldura
// pode redefini-lo); sem valor ali (ambiente que não herda propriedade personalizada), vale o da página.
export function createCssColorResolver(root: HTMLElement): ColorResolver {
  const document = root.ownerDocument;
  const own = document.defaultView?.getComputedStyle(root);
  const page = document.defaultView?.getComputedStyle(document.documentElement);
  const read = (token: string): string => {
    const value = own?.getPropertyValue(token).trim() ?? '';
    return value === '' ? (page?.getPropertyValue(token).trim() ?? '') : value;
  };
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return (token) => {
    const value = read(token);
    if (context === null) return value;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = TRANSPARENT;
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    return toRgbText(context.getImageData(0, 0, 1, 1).data);
  };
}
