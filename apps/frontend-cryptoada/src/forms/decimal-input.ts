// Copyright (c) 2026 Ada Technology. All rights reserved.

// Aceita a vírgula do teclado brasileiro: o texto que vai à API tem sempre ponto.
export function normalizeDecimalInput(text: string): string {
  return text.trim().replace(',', '.');
}
