// Copyright (c) 2026 Ada Technology. All rights reserved.

// Lista de quem liga, não de quem desliga: um ambiente novo (staging, preview) nasce sem a documentação.
const DOCUMENTATION_ENVIRONMENTS: readonly string[] = ['dev', 'test'];

export function isDocumentationEnvironment(environmentName: string): boolean {
  return DOCUMENTATION_ENVIRONMENTS.includes(environmentName);
}
