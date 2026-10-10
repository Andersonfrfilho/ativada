// Copyright (c) 2026 Ada Technology. All rights reserved.
export class RouteDeclarationError extends Error {
  constructor(description: string) {
    super(`Rota inválida: ${description}`);
    this.name = 'RouteDeclarationError';
  }
}
