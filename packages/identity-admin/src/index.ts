// Copyright (c) 2026 Ada Technology. All rights reserved.
// Cliente da Admin API do Keycloak compartilhado pela API e pelo cron (ADR 0001 §h): uma app não importa código de outra.
export {
  createKeycloakIdentityAdmin,
  type KeycloakIdentityAdminSettings,
} from './create-keycloak-identity-admin.js';
export { IDENTITY_OUTCOME } from './identity-admin.constant.js';
export type {
  IdentityAdminClient,
  IdentityOutcome,
  IdentityUser,
  SetEnabledParams,
} from './identity-admin.types.js';
export { mapInBatches } from './map-in-batches.js';
