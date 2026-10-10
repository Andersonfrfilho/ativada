// Copyright (c) 2026 Ada Technology. All rights reserved.
// A tabela de rotas tem rota sem `documentation`: o documento OpenAPI sairia incompleto, então não sai.
export class UndocumentedRouteError extends Error {
  readonly routes: readonly string[];

  constructor(routes: readonly string[]) {
    super(`Rota(s) sem documentação OpenAPI: ${routes.join(', ')}`);
    this.name = 'UndocumentedRouteError';
    this.routes = routes;
  }
}
