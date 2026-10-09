// Copyright (c) 2026 Ada Technology. All rights reserved.
export const FAKE_SERVICE_CLIENT_ID = 'crypto-api-service';
export const FAKE_SERVICE_CLIENT_SECRET = 'fake-service-secret-value';
export const FAKE_SERVICE_TOKEN = 'fake-service-account-access-token';

export const ADMIN_OPERATION = {
  LOOKUP: 'lookup',
  CREATE: 'create',
  DELETE: 'delete',
  LOGOUT: 'logout',
  CREDENTIALS: 'credentials',
  SEND_INVITATION: 'send-invitation',
  ROLES: 'roles',
  READ_USER: 'read-user',
  UPDATE_USER: 'update-user',
} as const;

export type AdminOperation = (typeof ADMIN_OPERATION)[keyof typeof ADMIN_OPERATION];

export type FakeIdentityUser = {
  readonly id: string;
  email: string;
  enabled: boolean;
  roles: string[];
  credentialCount: number;
};

export type FakeAdminCall = {
  readonly operation: AdminOperation;
  readonly userId: string | undefined;
  readonly query: Readonly<Record<string, string>>;
  readonly body: unknown;
};

export type FakeKeycloakAdmin = {
  readonly users: Map<string, FakeIdentityUser>;
  readonly calls: FakeAdminCall[];
  readonly failing: Set<AdminOperation>;
  readonly forbidden: Set<AdminOperation>;
  readonly behavior: { hasBareNotFound: boolean };
  readonly seedUser: (params: SeedIdentityUser) => FakeIdentityUser;
  readonly callsOf: (operation: AdminOperation) => readonly FakeAdminCall[];
  readonly handle: (request: Request) => Promise<Response>;
};

export type SeedIdentityUser = {
  readonly id: string;
  readonly email: string;
  readonly roles?: readonly string[];
  readonly credentialCount?: number;
};

type ParsedRequest = {
  readonly operation: AdminOperation;
  readonly userId: string | undefined;
};

const ADMIN_PREFIX = '/admin';

function parseRequest(method: string, path: string): ParsedRequest | undefined {
  const segments = path.slice(ADMIN_PREFIX.length).split('/').slice(1);
  const [resource, userId, ...rest] = segments;
  if (resource !== 'users') return undefined;
  const tail = rest.join('/');
  if (userId === undefined) return { operation: method === 'POST' ? 'create' : 'lookup', userId };
  const operationByTail: Readonly<Record<string, AdminOperation>> = {
    credentials: 'credentials',
    logout: 'logout',
    'execute-actions-email': 'send-invitation',
    'role-mappings/realm/composite': 'roles',
  };
  if (tail !== '') {
    const operation = operationByTail[tail];
    return operation === undefined ? undefined : { operation, userId };
  }
  const operationByMethod: Readonly<Record<string, AdminOperation>> = {
    GET: 'read-user',
    PUT: 'update-user',
    DELETE: 'delete',
  };
  const operation = operationByMethod[method];
  return operation === undefined ? undefined : { operation, userId };
}

export function createFakeKeycloakAdmin(options: { readonly events: string[] }): FakeKeycloakAdmin {
  const users = new Map<string, FakeIdentityUser>();
  const calls: FakeAdminCall[] = [];
  const failing = new Set<AdminOperation>();
  const forbidden = new Set<AdminOperation>();
  const behavior = { hasBareNotFound: false };

  function userRepresentation(user: FakeIdentityUser): Record<string, unknown> {
    return { id: user.id, username: user.email, email: user.email, enabled: user.enabled };
  }

  async function execute(
    parsed: ParsedRequest,
    request: Request,
    query: Readonly<Record<string, string>>,
  ): Promise<Response> {
    const body: unknown = await request.json().catch(() => undefined);
    calls.push({ operation: parsed.operation, userId: parsed.userId, query, body });
    if (failing.has(parsed.operation)) return Response.json({}, { status: 500 });
    if (forbidden.has(parsed.operation)) return Response.json({}, { status: 403 });
    const user = parsed.userId === undefined ? undefined : users.get(parsed.userId);
    if (parsed.userId !== undefined && user === undefined) {
      return Response.json(behavior.hasBareNotFound ? {} : { error: 'User not found' }, {
        status: 404,
      });
    }
    switch (parsed.operation) {
      case 'lookup':
        return Response.json(
          [...users.values()]
            .filter((entry) => entry.email === query['email'])
            .map(userRepresentation),
        );
      case 'create': {
        const email = String((body as { email?: unknown }).email);
        if ([...users.values()].some((entry) => entry.email === email)) {
          return Response.json({}, { status: 409 });
        }
        const created = fakeSeed({ id: crypto.randomUUID(), email });
        return new Response(null, {
          status: 201,
          headers: { Location: `http://fake.test${ADMIN_PREFIX}/users/${created.id}` },
        });
      }
      case 'delete':
        users.delete(parsed.userId ?? '');
        options.events.push(`keycloak:delete:${parsed.userId}`);
        return new Response(null, { status: 204 });
      case 'logout':
        options.events.push(`keycloak:logout:${parsed.userId}`);
        return new Response(null, { status: 204 });
      case 'credentials':
        return Response.json(
          Array.from({ length: user?.credentialCount ?? 0 }, () => ({ id: 'c' })),
        );
      case 'send-invitation':
        options.events.push(`keycloak:invite:${parsed.userId}`);
        return new Response(null, { status: 204 });
      case 'roles':
        return Response.json((user?.roles ?? []).map((name) => ({ id: name, name })));
      case 'read-user':
        return Response.json(userRepresentation(user as FakeIdentityUser));
      case 'update-user':
        if (user !== undefined) user.enabled = (body as { enabled: boolean }).enabled;
        options.events.push(`keycloak:enabled=${String(user?.enabled)}:${parsed.userId}`);
        return new Response(null, { status: 204 });
    }
  }

  function fakeSeed(params: SeedIdentityUser): FakeIdentityUser {
    const user: FakeIdentityUser = {
      id: params.id,
      email: params.email,
      enabled: true,
      roles: [...(params.roles ?? ['user'])],
      credentialCount: params.credentialCount ?? 0,
    };
    users.set(user.id, user);
    return user;
  }

  return {
    users,
    calls,
    failing,
    forbidden,
    behavior,
    seedUser: fakeSeed,
    callsOf: (operation) => calls.filter((call) => call.operation === operation),
    handle: async (request): Promise<Response> => {
      if (request.headers.get('Authorization') !== `Bearer ${FAKE_SERVICE_TOKEN}`) {
        return Response.json({}, { status: 401 });
      }
      const url = new URL(request.url);
      const parsed = parseRequest(request.method, url.pathname);
      if (parsed === undefined) return Response.json({}, { status: 404 });
      return execute(parsed, request, Object.fromEntries(url.searchParams));
    },
  };
}
