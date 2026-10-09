// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@crypto/environment';

import { HTTP_METHOD, HTTP_STATUS } from './identity-http.constant.js';
import { INVITATION_ACTIONS, INVITATION_LIFESPAN_SECONDS } from './identity-admin.constant.js';
import type { IdentityAdminClient, IdentityOutcome, IdentityUser } from './identity-admin.types.js';
import type { IdentityHttp, IdentityResponse } from './identity-http.js';
import { CONFLICT, NOT_FOUND, UNAVAILABLE, emptyOutcome, ok } from './identity-outcome.js';
import { createIdentityReads, userPath } from './keycloak-admin-reads.js';

export type KeycloakAdminClientSettings = {
  readonly http: IdentityHttp;
  readonly invitationClientId?: string;
  readonly invitationRedirectUri?: string;
};

const representationSchema = z.record(z.string(), z.unknown());

export function buildInvitedUserRepresentation(email: string): Readonly<Record<string, unknown>> {
  return { username: email, email, enabled: true, emailVerified: false };
}

function readCreatedUser(response: IdentityResponse, email: string): IdentityOutcome<IdentityUser> {
  const id = response.location?.split('/').at(-1) ?? '';
  return id.length === 0 ? UNAVAILABLE : ok({ id, email });
}

async function createInvitedUser(
  http: IdentityHttp,
  email: string,
): Promise<IdentityOutcome<IdentityUser>> {
  const response = await http({
    method: HTTP_METHOD.POST,
    path: '/users',
    json: buildInvitedUserRepresentation(email),
  });
  if (response === undefined) return UNAVAILABLE;
  if (response.status === HTTP_STATUS.CONFLICT) return CONFLICT;
  return response.status === HTTP_STATUS.CREATED ? readCreatedUser(response, email) : UNAVAILABLE;
}

async function updateEnabled(
  http: IdentityHttp,
  params: { readonly userId: string; readonly isEnabled: boolean },
): Promise<IdentityOutcome<undefined>> {
  const path = userPath(params.userId);
  const current = await http({ method: HTTP_METHOD.GET, path });
  const representation = representationSchema.safeParse(current?.body);
  if (current === undefined) return UNAVAILABLE;
  if (current.status === HTTP_STATUS.NOT_FOUND) return NOT_FOUND;
  if (current.status !== HTTP_STATUS.OK || !representation.success) return UNAVAILABLE;
  const merged = { ...representation.data, enabled: params.isEnabled };
  return emptyOutcome(
    await http({ method: HTTP_METHOD.PUT, path, json: merged }),
    HTTP_STATUS.NO_CONTENT,
  );
}

async function sendActionsEmail(
  http: IdentityHttp,
  params: { readonly userId: string; readonly clientId: string; readonly redirectUri: string },
): Promise<IdentityOutcome<undefined>> {
  const query = new URLSearchParams({
    lifespan: String(INVITATION_LIFESPAN_SECONDS),
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
  });
  const response = await http({
    method: HTTP_METHOD.PUT,
    path: `${userPath(params.userId)}/execute-actions-email?${query.toString()}`,
    json: INVITATION_ACTIONS,
  });
  return emptyOutcome(response, HTTP_STATUS.NO_CONTENT);
}

async function sendConfiguredInvitation(
  settings: KeycloakAdminClientSettings,
  userId: string,
): Promise<IdentityOutcome<undefined>> {
  const { invitationClientId, invitationRedirectUri } = settings;
  if (invitationClientId === undefined || invitationRedirectUri === undefined) return UNAVAILABLE;
  return sendActionsEmail(settings.http, {
    userId,
    clientId: invitationClientId,
    redirectUri: invitationRedirectUri,
  });
}

export function createKeycloakAdminClient(
  settings: KeycloakAdminClientSettings,
): IdentityAdminClient {
  const { http } = settings;
  return {
    ...createIdentityReads(http),
    createUser: (email) => createInvitedUser(http, email),
    deleteUser: async (userId) =>
      emptyOutcome(
        await http({ method: HTTP_METHOD.DELETE, path: userPath(userId) }),
        HTTP_STATUS.NO_CONTENT,
      ),
    logoutUser: async (userId) =>
      emptyOutcome(
        await http({ method: HTTP_METHOD.POST, path: `${userPath(userId)}/logout` }),
        HTTP_STATUS.NO_CONTENT,
      ),
    sendInvitation: (userId) => sendConfiguredInvitation(settings, userId),
    setEnabled: (params) => updateEnabled(http, params),
  };
}
