# ADR 0001 — Autenticação e isolamento entre usuários

**Status:** aceito com ajustes (T0.5 proposto; revisão do `architect` — APROVADO COM AJUSTES — aplicada
na T0.5b) · **Data:** 2026-10-09

## Contexto

A spec 001 é multiusuário (RF00, RF00b): cada pessoa tem login, estratégias, simulações, alertas, metas
e ativos próprios; candles e sentimento são compartilhados. O plano já fixou: Keycloak/OIDC (D9),
tabela `users` espelho criada no primeiro acesso (D10), autorização por objeto num único ponto com o
escopo do dono obrigatório no tipo do repositório (D11) e um worker que avalia as simulações de todos os
donos no mesmo candle e roteia alertas pelo dono (D12). Os requisitos que este ADR fecha:

- RF00: Authorization Code + PKCE, recuperação de senha, verificação de e-mail, TOTP obrigatório para
  administrador, access token ≤ 15 min, refresh rotativo em cookie `HttpOnly`, cadastro por convite,
  bloqueio de conta pelo administrador.
- RF00b: `userId` só do token; filtro do dono em toda consulta e alteração; recurso de outro usuário
  responde `404`; tetos de simulações ao vivo (5) e walk-forwards simultâneos (1) por usuário.
- RNF04 (nada de segredo nem dado pessoal em log), RNF07 (rate limit por usuário, mais duro no login),
  RNF08 (exportar e apagar a conta).
- Critérios de aceite 6 (contrato negativo por rota: B recebe `404` ao ler, listar, alterar, parar e
  exportar o recurso de A, com resposta idêntica à de recurso inexistente) e 7 (dois usuários no mesmo
  par recebem só os próprios alertas).

As tasks T0.6 (realm), T0.7 (middleware), T0.8 (`/v1/me`, convite), T0.9 (LGPD) e todas as rotas
futuras herdam este desenho; as obrigações de cada uma estão em §k. Na dúvida, ele escolhe o lado mais
restritivo.

## Decisão

### a) Realm Keycloak

**Realm:** `crypto-paper-trader`, versionado em `realm/crypto-paper-trader-realm.json` (T0.6; o sufixo `-realm.json` é o que o `--import-realm` do Keycloak reconhece), import
idempotente. `KC_HOSTNAME` fixo por ambiente, para que o `iss` não varie com o host de quem chama.

**Clientes**

| `clientId` | Tipo | Configuração |
|---|---|---|
| `crypto-session` | **confidencial**, usado só pelo *token handler* da API | só `standardFlowEnabled`; `pkce.code.challenge.method = S256` obrigatório **e** segredo do cliente (`KEYCLOAK_SESSION_CLIENT_SECRET`, só na API, validado no boot); `implicitFlowEnabled`, `directAccessGrantsEnabled` e `serviceAccountsEnabled` desligados; `redirectUris` e `webOrigins` enumerados por ambiente (nunca `*`); `fullScopeAllowed = false`, com escopo restrito aos papéis `user` e `admin`; mapper *Audience* que inclui `crypto-api` no `aud` do access token. O navegador inicia o login com este `client_id`, mas quem troca o código é a API |
| `crypto-api` | resource server | não inicia login (todos os fluxos desligados, sem segredo usado); existe só para ser o `aud` esperado pela API |
| `crypto-api-service` | confidencial, só *service account* | usado pela API para o Admin API do Keycloak (convite, bloqueio, exclusão de conta). Permissões finas do Keycloak 26 (*fine-grained admin permissions* v2) restritas a **criar, desabilitar e apagar usuário e disparar `execute-actions-email`**; sem `map-roles`, sem `manage-realm`, sem `impersonation`. Segredo em env validado no boot (`KEYCLOAK_SERVICE_CLIENT_SECRET`), nunca em log. **Verificação obrigatória na T0.6:** a service account tenta mapear o papel de realm `admin` a um usuário e recebe `403` |

**Papéis de realm:** `user` e `admin`. O papel padrão do realm (`default-roles-crypto-paper-trader`)
contém `user`; `admin` é atribuído só à mão no Keycloak (nunca pela API). Os papéis somam: uma conta com
`admin` e `user` usa o produto como qualquer usuário e, além disso, acessa `/v1/admin/*`.

**Segundo fator e níveis de autenticação (LoA)**

- O fluxo de navegador do realm (`browser-loa`) é feito de subfluxos condicionais
  *Condition – Level Of Authentication*: **LoA 1** = usuário e senha; **LoA 2** = *OTP Form*
  `REQUIRED`. Mapa no realm: `acr.loa.map = {"password":1,"mfa":2}`. Só *Condition – User Role* não
  atende: ele não responde a `acr_values=2`, e o step-up da spec 002 depende disso.
- `admin`: a ação obrigatória `CONFIGURE_TOTP` é atribuída na criação da conta, e o OTP dele é o do
  subfluxo LoA 2. A API exige `acr ≥ 2` em toda rota `/v1/admin/*` (§b); sem isso, `403 MFA_REQUIRED`
  e o painel refaz o login com `acr_values=2`.
- Quem cadastra chave de corretora (spec 002): a rota exige `acr = 2` **e** `auth_time ≤ 5 min`
  (reautenticação recente); fora disso, `403 MFA_REQUIRED` / `403 REAUTHENTICATION_REQUIRED`.
- TOTP: **`HmacSHA1`**, 6 dígitos, período 30 s, janela 1. SHA-256 foi descartado: Google Authenticator
  e Microsoft Authenticator ignoram o parâmetro de algoritmo do QR code e geram SHA-1, o que faria o
  código nunca bater.

**Política de senha:** `length(12) and maxLength(128) and notUsername and notEmail and passwordHistory(5)`.
Hash padrão do Keycloak (argon2 na série 26). **Brute force detection** ligada: `failureFactor 5`,
`waitIncrementSeconds 60`, `maxFailureWaitSeconds 900`, `maxDeltaTimeSeconds 43200`, bloqueio
temporário (não permanente, para não virar negação de serviço contra a vítima).

**Conta:** `registrationAllowed = false` (cadastro só por convite), `verifyEmail = true`,
`resetPasswordAllowed = true`, `loginWithEmailAllowed = true`, `duplicateEmailsAllowed = false`,
`editUsernameAllowed = false`, `rememberMe = false`. SMTP do realm aponta para o **Mailpit** do
`compose.yaml` em dev e teste (T0.6) e para o provedor real só quando publicado.

**Tokens e sessão**

| Parâmetro | Valor |
|---|---|
| `accessTokenLifespan` | 300 s (5 min; teto de RF00 é 15) |
| `ssoSessionIdleTimeout` | 1800 s |
| `ssoSessionMaxLifespan` | 36000 s (10 h) |
| `revokeRefreshToken` | `true`, `refreshTokenMaxReuse = 0` (refresh rotativo). **A T0.6 mediu** o que o reuso de um refresh antigo causa (resultado em §l); a deduplicação de §b existe para que uma corrida legítima do próprio painel não caia nesse caso |
| `offline_access` | removido do papel padrão; ninguém recebe refresh offline |

**Claims usadas pela API:** `sub` (identidade estável), `email_verified` (precisa ser `true`),
`realm_access.roles`, `iss`, `aud`, `azp` (precisa ser **`crypto-session`**), `exp`, `iat`, `typ`
(precisa ser `Bearer` — ID token e refresh token apresentados como bearer são recusados), `acr` (rotas
admin e de chave de corretora) e `auth_time` (`DELETE /v1/me`, §h, e chave de corretora). O `email` não
entra no contexto autenticado (§c); a exportação e a listagem admin o leem na própria rota.

**`issuer`:** `${KEYCLOAK_PUBLIC_URL}/realms/crypto-paper-trader`. **`audience`:** `crypto-api`. Os dois
e a URL da JWKS (`${KEYCLOAK_INTERNAL_URL}/realms/crypto-paper-trader/protocol/openid-connect/certs`)
vêm do env validado no boot; a API **não** usa descoberta (`.well-known`) em tempo de execução, para que
um issuer trocado não seja aceito por engano.

**Refresh em cookie `HttpOnly` — *token handler* com cliente confidencial.** O navegador nunca vê o
refresh token nem o segredo do cliente.

1. O painel gera `code_verifier`/`code_challenge` (S256) e `state`, guarda o verifier em
   `sessionStorage` só até o retorno, e redireciona ao Keycloak com `client_id=crypto-session`.
2. No retorno, o painel envia `{ code, codeVerifier, redirectUri }` para `POST /v1/session`. A API
   confere `redirectUri` contra a **lista configurada** (igualdade exata; fora dela, `400`), troca o
   código no endpoint de token do Keycloak com PKCE **e** o segredo do cliente, devolve **só o access
   token** no corpo e grava o refresh em cookie
   `__Host-crypto_refresh; HttpOnly; Secure; SameSite=Strict; Path=/` com validade igual à da sessão.
3. O access token vive só em memória no painel. Expirado (ou ao recarregar a página), o painel chama
   `POST /v1/session/refresh`; a API lê o cookie, renova no Keycloak, regrava o cookie com o refresh
   novo (rotação) e devolve o access token novo. O painel faz **uma renovação por vez** (as demais
   chamadas esperam a mesma promessa) e a API **deduplica** pelo hash do refresh recebido por ~10 s:
   a segunda chamada com o mesmo refresh recebe o mesmo resultado, sem ir ao Keycloak de novo.
4. `DELETE /v1/session` faz logout no Keycloak e apaga o cookie.
5. As três rotas de sessão exigem `Origin` na lista de origens permitidas e o cabeçalho
   `X-Requested-With: fetch` (defesa de CSRF além do `SameSite=Strict`; valor fixado na T0.7b), respondem com
   `Cache-Control: no-store`, e nunca registram o corpo nem o cookie em log.
6. **Topologia:** painel e API na **mesma origem**, com proxy em `/v1` (Vite em dev, borda quando
   publicado), porque o cookie `__Host-` com `SameSite=Strict` não atravessa origens. Se algum ambiente
   precisar de origens separadas: CORS com `credentials` e origem exata, nunca `*`.
7. `Secure` em `http://localhost` funciona em Chromium e Firefox, mas **não no Safari**; em dev, quem
   usa Safari acessa por HTTPS local (documentado na T0.6).

### b) Validação do JWT na API

**Biblioteca:** [`jose`](https://github.com/panva/jose) de Filip Skokan (panva), **versão exata
`6.2.12`** (`"jose": "6.2.12"`, sem `^`, lockfile congelado). Instalação na T0.7 — é o único pacote
novo previsto para a Fase 0b.

- Por quê: zero dependências; implementada sobre Web Crypto, portanto roda em Bun sem addon nativo e sem
  I/O bloqueante; tipos TypeScript próprios; mantida ativamente pelo autor que também mantém
  `openid-client` e é certificado pela OpenID Foundation; `createRemoteJWKSet` já resolve cache,
  rotação por `kid` e *cooldown*; `jwtVerify` valida `iss`, `aud`, `exp`, `nbf`, `iat`, tolerância de
  relógio e lista de algoritmos e **nunca** aceita `alg: none`.
- Rejeitadas: `jsonwebtoken` (CommonJS, sem JWKS, depende do `crypto` do Node); `fast-jwt` (foco em
  Node, sem resolvedor de JWKS remoto com rotação); `@node-rs/jsonwebtoken` (addon nativo — contraria a
  regra de runtime Bun sem addon); **implementação própria com Web Crypto** — rejeitada porque o código
  de segurança mais sensível do sistema passaria a ser nosso: parse de JWS compacto, conversão JWK →
  `CryptoKey`, seleção de chave por `kid`/`alg`/`use`, cache e cooldown da JWKS, validação de cada claim
  registrada e as armadilhas conhecidas (confusão de algoritmo, `crit`, `b64`). O ganho seria remover
  uma dependência pequena e auditada; o custo, um caminho de bypass de autenticação mantido por nós.

**Configuração (fixa, num único módulo `apps/api-crypto/src/authentication/`):**

| Item | Valor |
|---|---|
| JWKS | `createRemoteJWKSet(jwksUrl, { cacheMaxAge: 600_000, cooldownDuration: 30_000, timeoutDuration: 3_000 })` — chave nova (rotação no Keycloak) com `kid` desconhecido força nova busca após o cooldown; a chave antiga continua aceita enquanto o Keycloak a publicar como passiva |
| `algorithms` | `['RS256']` — lista fechada; incluir outro algoritmo exige mudar este ADR |
| `issuer` / `audience` | exatos, do env (§a) |
| `clockTolerance` | 10 s |
| `maxTokenAge` | `'15m'` (defesa contra token com `exp` longo emitido por configuração errada) |
| `requiredClaims` | `['sub', 'exp', 'iat', 'iss', 'aud']`; depois do `jwtVerify`, um schema Zod valida `typ = 'Bearer'`, `azp = 'crypto-session'`, `sub` (até 255 caracteres), `email_verified = true`, `realm_access.roles` (array de strings) e, quando presentes, `acr` e `auth_time` |

**Classificação dos erros — nenhum `catch` cai em "autenticado".** O resultado da verificação é uma
união fechada (`authenticated | rejected(code) | unavailable`); o único caminho para `authenticated` é o
retorno normal do `jwtVerify` seguido do schema. `401` só para a **lista fechada** de erros de JWT do
`jose` (`ERR_JWT_EXPIRED`, `ERR_JWT_CLAIM_VALIDATION_FAILED`, `ERR_JWS_SIGNATURE_VERIFICATION_FAILED`,
`ERR_JWS_INVALID`, `ERR_JWT_INVALID`, `ERR_JOSE_ALG_NOT_ALLOWED`, `ERR_JWKS_NO_MATCHING_KEY`,
`ERR_JWKS_MULTIPLE_MATCHING_KEYS`, `ERR_JOSE_NOT_SUPPORTED`) e para a recusa do schema; **qualquer outro
erro** — JWKS inalcançável, timeout, rede, erro desconhecido — vira `503`. Contrato da T0.7: um
verificador que lança um erro desconhecido produz `503`, nunca `2xx`.

**Respostas de erro** (envelope `{ error: { code, message } }`, mensagem genérica, sem detalhe da causa):

| Situação | Status | `code` |
|---|---|---|
| Sem `Authorization: Bearer …` ou formato inválido | 401 | `AUTHENTICATION_REQUIRED` |
| Token expirado (`ERR_JWT_EXPIRED`) | 401 | `ACCESS_TOKEN_EXPIRED` (+ `WWW-Authenticate: Bearer error="invalid_token"`) |
| Demais erros da lista fechada; `typ`, `azp` ou claim inválidos no schema | 401 | `INVALID_ACCESS_TOKEN` |
| `email_verified` falso | 403 | `EMAIL_NOT_VERIFIED` |
| Token válido sem o papel exigido pela rota | 403 | `FORBIDDEN` |
| Rota admin (ou de chave de corretora) sem `acr ≥ 2` | 403 | `MFA_REQUIRED` |
| Rota de chave de corretora com `auth_time` > 5 min | 403 | `REAUTHENTICATION_REQUIRED` |
| Conta apagada (§d, §h) | 401 | `ACCOUNT_DELETED` |
| Conta bloqueada pelo admin (§d) | 403 | `ACCOUNT_BLOCKED` |
| JWKS inalcançável, timeout ou erro desconhecido | 503 | `AUTHENTICATION_UNAVAILABLE` (falha de infraestrutura não desloga ninguém) |

**Roteador que nega por padrão.** Toda rota declara `access: 'public' | 'user' | 'admin'` na tabela de
rotas; rota sem declaração não registra (erro no boot). Contrato da T0.7 varre a tabela: toda rota não
pública chamada sem token responde `401`. O upgrade de `/v1/stream` só acontece depois de consumir o
ticket (§e). `/v1/admin/*` exige papel `admin` **e** `acr ≥ 2`.

**Cabeçalhos e borda:** `Cache-Control: no-store` em `/v1/session*` e na exportação (`/v1/me/export`);
CORS com allowlist exata; `Strict-Transport-Security`, CSP sem `unsafe-inline`, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`;
`X-Forwarded-For` só é lido quando a conexão vem de um proxy da lista de proxies confiáveis (senão, o IP
é o da conexão).

O token, o cabeçalho `authorization` e a causa detalhada da falha nunca vão para log; o log leva só o
`code` e o `traceId` (redação no logger, §k).

### c) Contexto autenticado

```ts
// apps/api-crypto/src/authentication/authenticated-user.ts
type AuthenticatedUser = {
  readonly userId: UserId;             // uuid interno de users.id, tipo nominal de @crypto/database
  readonly keycloakSubject: string;    // sub
  readonly roles: readonly UserRole[]; // 'user' | 'admin'
};
```

- **Sem e-mail.** O e-mail é dado pessoal e só serve à exportação e à listagem admin, que o leem do
  token ou do Keycloak dentro da própria rota. Fora do contexto, ele não chega a log, a evento de
  WebSocket nem a payload de `NOTIFY`, e não é coluna de `users`.
- **Onde nasce:** no middleware de autenticação da API (T0.7), depois do `jwtVerify`, do rate limit por
  `sub` e da resolução do usuário (§d). Objeto congelado (`createAuthenticatedUser`), inclusive o array
  de papéis. Tipo, fábrica e `USER_ROLE` moram em `apps/api-crypto/src/authentication/`.
- **Como chega ao use case:** parâmetro explícito. A rota recebe `authenticatedUser` do middleware e
  chama o use case com o `scope` que a resolução do usuário devolveu (`resolveUserBySubject` →
  `{ userId, scope }`, recurso de usuário) ou com o próprio `authenticatedUser` (perfil, sessão). **Proibido** global, singleton por requisição,
  `AsyncLocalStorage` ou leitura implícita de contexto.
- **`userId` vem só do token — defesa em camadas, sem afirmar impossibilidade.** `UserId` é tipo nominal
  e o escopo de dono (`OwnerScope`) só nasce dentro de `@crypto/database`. Nada abaixo é uma prova de
  que nenhuma app, jamais, alcance o banco ou fabrique um `UserId`: são três camadas, cada uma com o
  que ela cobre e o que não cobre.
  1. **Tipo e runtime (a camada que não depende de lint).** O `package.json` do pacote declara
     `"exports": { ".": "./src/index.ts" }`, então subcaminho não resolve. O índice público
     (`packages/database/src/index.ts`) exporta só os **tipos** `UserId` e `OwnerScope`, mais
     `AccountId`, `parseAccountId` e `InvalidUserIdError`; **não** exporta `createOwnerScope`,
     `userIdFromDatabase`, `ownerCondition`, schema/tabelas nem o cliente cru (`test/database.contract.test.ts`
     prende a lista exata de exportações em tempo de execução e reprova se `createOwnerScope` voltar ao
     índice). A app só recebe um `OwnerScope`/`UserId` **como retorno de função do pacote**: a T0.7
     expõe `resolveUserBySubject(subject)`, e a recomendação deste ADR é que ela devolva
     `{ userId, scope }` já com o escopo construído lá dentro, de modo que nem `createOwnerScope`
     precise sair do pacote. O limite honesto: o tipo nominal é compile-time; um valor produzido por
     código que contorne o compilador (import dinâmico de caminho relativo, `Bun.SQL` direto) não passa
     por ele, e é para isso que existe a camada 2.
  2. **Lint de `apps/*/src` como lista de bloqueio** (`noInlineConfig` ligado, então `eslint-disable`
     não desliga nada). É lista de bloqueio, não de permissão: cada brecha conhecida foi fechada por
     uma sonda em `test/app-import-boundary.contract.test.ts`, que grava arquivos em
     `apps/api-crypto/src` e confere que o ESLint os reprova. Fechadas: importar `drizzle-orm`,
     `drizzle-orm/*`, `drizzle-kit`, `@crypto/database/*` e qualquer caminho para `packages/`;
     `import()` dinâmico nas apps de backend (`api`, `worker`, `cron`; o frontend o usa em
     `React.lazy` e não depende de `@crypto/database`, o que um contrato lê no `package.json`);
     `Bun.SQL`/`Bun.sql` por membro, por índice (`Bun['SQL']`), por `globalThis.Bun`, por
     desestruturação (`const { SQL } = Bun`) e por apelido (`const runtime = Bun`); `import` default
     ou namespace de `bun` e os nomes `SQL`/`sql`; asserção de tipo
     (`consistent-type-assertions` com `assertionStyle: 'never'`; `as const` é aceito); *type guard*
     que produza `UserId`, `OwnerScope` ou `AccountId`; sobrecarga ou tipo de função cujo retorno
     declarado seja um desses três (fecha `function mint(v: string): UserId; function mint(v: string): unknown`);
     e `no-unsafe-assignment`/`no-unsafe-argument` como erro. A regra de fonte também cobre `.tsx`,
     `.mts` e `.cts`, e um contrato reprova qualquer `.js`, `.mjs`, `.cjs`, `.jsx`, `.mts` ou `.cts`
     em `apps/*/src` (a stack é TypeScript em 100%). Brechas **conhecidas e não fechadas**:
     passar o global `Bun` como argumento de função ou guardá-lo em estrutura maior e acessá-lo
     depois, `eval`/`Function`, `require` dinâmico via `module`, e qualquer padrão que ainda não
     virou sonda. Toda brecha nova achada vira sonda primeiro, regra depois.
  3. **Contratos negativos por rota** (§e): para cada rota de recurso de usuário, o harness prova que
     outro usuário recebe `404` indistinguível de UUID inexistente. É a camada que pega o filtro de dono
     errado **dentro** do pacote, onde as duas anteriores não olham.
  Reforço adicional, não camada: `test/ownership.contract.test.ts` reprova `userIdFromDatabase`,
  `as UserId` e `as OwnerScope` em qualquer `src/` fora de `packages/database`.
  Nenhum schema de entrada declara campo `userId`; o `.strict()` dos schemas Zod faz um `userId` no
  corpo virar `400`.
- **Por que o tipo fica em `packages/database` e não num `packages/auth`:** a garantia depende de que só
  a camada de persistência cunhe `UserId`; um pacote de autenticação teria de reexportar a cunhagem para
  o `database`, abrindo exatamente a porta que o tipo fecha. A verificação do JWT (com `jose`) e o
  contexto autenticado ficam em `apps/api-crypto`, porque só a API recebe token.

### d) Tabela `users` e resolução no acesso

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | `uuid` PK (v7) | o `UserId` |
| `keycloak_sub` | `varchar(255)` `NOT NULL` | **índice único total** (não parcial: a linha apagada continua bloqueando a recriação) |
| `display_name` | `varchar(120)` nulo | |
| `display_currency` | `varchar(3)` `NOT NULL` default `'BRL'` | `BRL`/`USD`, sem ENUM nativo |
| `timezone` | `varchar(64)` `NOT NULL` default `'America/Sao_Paulo'` | |
| `telegram_chat_id` | `varchar(32)` nulo | dado pessoal; nunca em log |
| `limits` | `jsonb` `NOT NULL` | `{ "maxActiveLivePaperRuns": 5, "maxConcurrentWalkForwards": 1, "maxActivePriceAlerts": 50 }`, validado por Zod |
| `created_at`, `updated_at` | `timestamptz` | |
| `blocked_at` | `timestamptz` nulo | bloqueio pelo admin; a API responde `403 ACCOUNT_BLOCKED` |
| `deleted_at` | `timestamptz` nulo | passo 1 da exclusão (§h) |
| `identity_deleted_at` | `timestamptz` nulo | passo 2 concluído: usuário apagado no Keycloak |
| `data_purged_at` | `timestamptz` nulo | passo 3 concluído: dados de dono apagados e colunas pessoais anuladas |

E-mail não é coluna. **Resolução por requisição — leitura primeiro, escrita só na primeira vez**
(`resolveUserBySubject(subject)` em `@crypto/database`, T0.7, única função pública que devolve
`UserId`; **recomendação:** devolve `{ userId, scope }`, com o `OwnerScope` construído dentro do pacote):

```sql
SELECT id, deleted_at, blocked_at FROM users WHERE keycloak_sub = $1;
-- só se não existir:
INSERT INTO users (id, keycloak_sub) VALUES ($uuidv7, $1) ON CONFLICT (keycloak_sub) DO NOTHING;
SELECT id, deleted_at, blocked_at FROM users WHERE keycloak_sub = $1;  -- relê
```

O caminho quente é um `SELECT` simples: não escreve no banco a cada chamada e não disputa o lock do
`SELECT … FOR UPDATE` da cobrança dos tetos (§g). Dois primeiros acessos simultâneos do mesmo `sub`
resolvem no índice único: um insere, o outro não insere nada e relê a mesma linha (contrato da T0.7:
`Promise.all` de dois acessos → `count(*) = 1` e o mesmo `id` nos dois). Se a linha tiver `deleted_at`,
a resposta é `401 ACCOUNT_DELETED` e **nada é recriado**: um access token ainda válido (até 5 min) de
uma conta apagada não ressuscita a conta. Com `blocked_at`, `403 ACCOUNT_BLOCKED`.

O **rate limit por `sub` vem antes** dessa consulta (§g): um token válido em laço não chega ao banco.

### e) Isolamento por dono (D11)

**Tipos** (`packages/database/src/ownership/`):

- `UserId` — `string` com marca nominal; cunhado só por `userIdFromDatabase` (UUID em minúsculas, senão
  `InvalidUserIdError`), **interno** ao pacote (§c).
- `OwnerScope` — `{ readonly ownerUserId: UserId }` com marca nominal; só `createOwnerScope(userId)`
  cria, congelado, e essa função é **interna ao pacote** (não está no índice público). Um objeto montado
  à mão não é `OwnerScope`, mesmo com `UserId` legítimo. O **tipo** é público, porque a app precisa
  nomeá-lo nas assinaturas; o **valor** a app só recebe como retorno de função do pacote
  (`resolveUserBySubject` → `{ userId, scope }`).
- `ownerCondition(scope, tabela.userId)` — devolve o `SQL` `"tabela"."user_id" = $1` do Drizzle; interno.

**Entrada de repositórios para as apps.** As apps nunca recebem o cliente Drizzle nem as tabelas. Na
T0.7 o índice público passa a exportar `openDatabase(url)` → `DatabaseHandle` (tipo opaco, sem o cliente
acessível), `resolveUserBySubject` e as fábricas de repositório `create<Recurso>Repository(handle)`, cujos
métodos recebem `OwnerScope`. Qualquer nova exportação pública passa pelo contrato que fixa a lista.

**Regras do repositório de recurso de usuário** (toda tabela de `OWNED_TABLES`, §h):

1. Todo método recebe `scope: OwnerScope` como **primeiro** parâmetro. Chamar sem escopo, com objeto
   forjado ou com `string` crua é erro de compilação (provado por `@ts-expect-error` no contrato).
2. Toda leitura usa `where(and(ownerCondition(scope, t.userId), …))`. Toda alteração é
   `UPDATE/DELETE … WHERE id = $id AND user_id = $owner RETURNING id`; zero linhas → **`undefined`**
   (nunca `null` no repositório do projeto), e o use case lança o erro de domínio do recurso → `404`.
   Nunca "busca por id e depois compara o dono" em código.
3. Inserção grava `user_id = scope.ownerUserId`; o tipo de entrada do repositório não tem campo de dono.
4. Recurso que referencia outro (ex.: `POST /v1/runs` com `strategyVersionId`) carrega o referenciado
   com o mesmo escopo antes; de outro dono → `404` do referenciado. O banco reforça com FK composta.
5. Toda tabela de usuário leva `user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT`,
   **inclusive as filhas** (`strategy_versions`, `fills`, `walk_forward_windows`, `telegram_link_codes`),
   para que o filtro nunca dependa de join. Filha referencia o pai por FK composta
   `(parent_id, user_id) → parent(id, user_id)` (o pai declara `UNIQUE (id, user_id)`), inclusive
   `runs.strategy_version_id` e `goals.run_id`/`goals.strategy_version_id`: o banco recusa uma linha cujo
   dono diverge do dono do pai. Índices começam por `user_id`.
6. **`404`, nunca `403`,** para recurso de outro usuário. **Um código por tipo de recurso**,
   `<RESOURCE>_NOT_FOUND` (`STRATEGY_NOT_FOUND`, `RUN_NOT_FOUND`, `GOAL_NOT_FOUND`, …), **o mesmo** para
   "recurso de outro dono" e "UUID inexistente", com a mesma mensagem e a mesma consulta (sem caminho de
   tempo diferente). UUID malformado no path também responde esse `404`.
7. O worker opera em nome do dono com o escopo que uma função do pacote devolve junto da linha
   (`(runId, scope)`, construído lá dentro a partir de `row.userId`), nunca com `createOwnerScope`. Não existe "escopo de sistema" que enxergue todos os donos dentro de um
   repositório de recurso; a leitura que lista as simulações ativas de um par é uma consulta própria do
   worker, que devolve `(runId, userId)` e filtra conta apagada ou bloqueada (`deleted_at IS NULL`,
   `blocked_at IS NULL`).

**WebSocket (`/v1/stream`):** o navegador não manda cabeçalho no handshake, e token em query é proibido.
O painel pede `POST /v1/stream/tickets` (Bearer) e recebe um ticket aleatório de 32 bytes, uso único,
válido por 30 s, guardado em memória da API com o `userId` (só o hash do ticket). O handshake
`/v1/stream?ticket=…` valida `Origin` contra a allowlist, **consome o ticket antes do upgrade** e liga a
conexão a `ws.data.userId`; o ticket é redigido no log de acesso. A conexão assina **só** o tópico
`user:<userId>`; o cliente não escolhe tópico. Eventos do worker chegam por `NOTIFY` com
**`{ runId, kind, eventId }`** — sem `userId` e sem dado pessoal: a API resolve o dono pelo banco e
**nunca** confia em dono vindo do payload. A conexão fecha com `4401` no `exp` do token que gerou o
ticket, a menos que o painel renove o token **dentro do socket** (mensagem de renovação com o access
token novo, preferida a reconectar a cada 5 min); ao bloquear ou apagar a conta, a API fecha com
`4403` todos os sockets do usuário (registro em memória `userId → sockets`). Na reconexão do listener
de `NOTIFY`, a API avisa o painel, que rebusca o estado.

**Como se testa:**

- Harness `expectOtherUserGetsNotFound(contract)` em `test/fixtures/cross-owner-access.fixture.ts`. O
  contrato declara `createResource`, `readResource`, `listResources` e as tentativas (`read`,
  `rename`/`update`, `stop`, `export`, …). **Regra do contrato:** `readResource` projeta **todos** os
  campos mutáveis do recurso, e `undefined` **ou** `null` contam como "não encontrado" no harness (o
  repositório do projeto devolve `undefined`). Para cada tentativa, com um recurso novo de A **e** um
  recurso próprio de B: A vê o seu; B vê o seu; B não vê o de A; a listagem de B **não contém** o id de A
  (e a de A contém); a tentativa de B no recurso de A devolve `not_found`; os dois recursos ficam
  intactos; a mesma tentativa de A devolve `granted` (prova que está ligada de verdade); e o recurso de
  B continua intacto depois da tentativa de A.
- O próprio harness é provado contra um repositório em memória correto e contra cinco defeitos
  (leitura sem filtro, listagem sem filtro — `LIST_IGNORES_OWNER`, alteração sem filtro, escrita antes da
  checagem, parada que atinge todos os donos) — os cinco reprovam.
- **Rotas HTTP (a partir da T0.8):** o adaptador da tentativa mapeia **só** `404` com o
  `<RESOURCE>_NOT_FOUND` daquele recurso → `not_found` e `2xx` → `granted`; qualquer outro status
  (inclusive `403`) lança e reprova. Além disso, o adaptador **compara** a resposta do recurso de outro
  dono com a de um UUID inexistente — mesmo status, `code`, `message`, `Content-Type`, chaves do corpo e
  tamanho do corpo — com `expectIndistinguishableNotFound` (`test/fixtures/not-found-response.fixture.ts`,
  provado em `test/not-found-response.contract.test.ts`). Cada rota com recurso de usuário nasce com seu
  contrato (critério de aceite 6).
- WebSocket: dois usuários conectados; evento do run de A é publicado; o socket de B não recebe nada
  dentro de 1 s e o de A recebe (critério 7, Fase 4/5).

### f) Papel `admin`

**Pode** (com `acr ≥ 2`, §b): ver saúde do sistema (`GET /v1/admin/health`: filas, último candle por par,
atraso do stream, contagem agregada de simulações ativas — números, sem dono); convidar usuário
(`POST /v1/admin/invitations { email }`, §k T0.8); listar contas com dados mínimos
(`GET /v1/admin/accounts`: e-mail lido do Keycloak, estado, datas); bloquear e desbloquear conta
(`POST /v1/admin/accounts/:accountId/block` e `/unblock`: Keycloak `enabled = false` + `users.blocked_at`,
e fechamento `4403` dos sockets).

**Alvo administrativo é outro tipo.** O id do path vira `AccountId` (`parseAccountId`, público; UUID
malformado → `undefined` → `404 ACCOUNT_NOT_FOUND`). O repositório admin (`packages/database/src/admin/`)
recebe e devolve `AccountId`, **nunca** `OwnerScope`; `AccountId` e `UserId` não são intercambiáveis
(`@ts-expect-error` nos dois sentidos), e o contrato `test/admin-boundary.contract.test.ts` reprova
`createOwnerScope`, `OwnerScope` e `ownerCondition` em qualquer arquivo `admin*` do pacote.

**Não pode:** ler, listar, alterar ou exportar estratégias, versões, execuções, sinais, ordens,
carteiras, alertas, metas, alertas de preço, ativos ou o Telegram de outro usuário; não existe rota
admin que receba id de usuário e devolva recurso de usuário ou atue sobre a execução dele. Não atribui
papel `admin` (só à mão no Keycloak). **Não bloqueia a si mesmo** (`409 CANNOT_BLOCK_SELF`) **nem o
último admin ativo** (`409 LAST_ADMIN`). Toda ação admin grava `audit_events` (§i).

### g) Rate limit e tetos de uso

- **Onde vive:** middleware da API, em memória (token bucket por chave). Etapa 1 roda uma instância da
  API; mais de uma instância exige mover para o Postgres ou Redis (ADR novo).
- **Ordem:** sem token ou token inválido → limite por IP **antes** da verificação; token válido → limite
  por `sub` logo depois do `jwtVerify` e **antes** de qualquer acesso ao banco (§d).
- **Chaves e limites iniciais:** autenticado → por `sub`, 120 req/min; criação de execução
  (`POST /v1/runs`, `POST /v1/goals/evaluate`) → por `sub`, 20/min; rotas de sessão (`/v1/session*`) e
  tickets de stream → por IP, 10/min; convite (`POST /v1/admin/invitations`) → por ator, 10/h; sem token
  → por IP, 30/min. Excedido → `429 RATE_LIMITED` com `Retry-After`.
- **Login:** a senha é digitada no Keycloak, não na API; o limite duro do login é o *brute force
  detection* do realm (§a) mais o limite de 10/min por IP nas rotas de sessão.
- **Tetos de RF00b:** valores em `users.limits`. Cobrança no use case que cria a execução, dentro de uma
  transação: `SELECT … FROM users WHERE id = $owner FOR UPDATE`, conta as execuções `live_paper`
  ativas (ou `walk_forward` em andamento) do dono e insere; acima do teto → `409 LIVE_RUN_LIMIT_REACHED`
  / `409 WALK_FORWARD_LIMIT_REACHED`. O lock na linha do dono serializa criações concorrentes do mesmo
  usuário sem travar os outros, e não conflita com a resolução de §d, que só lê. A fila de
  `worker_thread` do walk-forward também recusa um segundo job do mesmo dono (defesa em profundidade).
  Alertas de preço: mesmo padrão, `409 PRICE_ALERT_LIMIT_REACHED`.

### h) LGPD — exportar e apagar a conta

**Registro de tabelas** em `packages/database/src/ownership/` (criado na primeira migration com tabela
de dono), com três categorias disjuntas:

- `OWNED_TABLES` — têm `user_id NOT NULL` com FK para `users`; exportadas e apagadas por dono.
- `PSEUDONYMIZED_TABLES` — referenciam pessoas sem pertencer a elas; na exclusão, as colunas
  identificadoras viram `NULL` e a linha fica. Hoje: `audit_events` (§i).
- `SHARED_TABLES` — sem dono: `candles`, `sentiment_daily`, e `users` (tratada à parte).

| Tabela | Categoria | Exporta | Na exclusão |
|---|---|---|---|
| `strategies` | owned | sim | apaga |
| `strategy_versions` | owned | sim | apaga (`user_id` denormalizado) |
| `runs` | owned | sim | apaga |
| `walk_forward_windows` | owned | sim | apaga (`user_id` denormalizado) |
| `signals` | owned | sim | apaga |
| `orders` | owned | sim | apaga |
| `fills` | owned | sim | apaga (`user_id` denormalizado) |
| `positions` | owned | sim | apaga |
| `equity_points` | owned | sim | apaga |
| `alerts` | owned | sim | apaga |
| `goals` | owned | sim | apaga |
| `price_alerts` | owned | sim | apaga |
| `user_assets` | owned | sim | apaga (dado financeiro pessoal) |
| `telegram_link_codes` | owned | não (segredo transitório) | apaga |
| `exchange_credentials` (spec 002) | owned | sim, sem `ciphertext`/`iv` (só `exchange`, `environment`, `last4`, datas) | apaga (revoga na corretora antes, se possível) |
| `execution_sessions` (spec 002) | owned | sim | apaga |
| `exchange_orders` (spec 002) | owned | sim | apaga (`user_id` denormalizado) |
| `exchange_fills` (spec 002) | owned | sim | apaga (`user_id` denormalizado) |
| `reconciliations` (spec 002) | owned | sim | apaga (`user_id` denormalizado) |
| `audit_events` | pseudonymized | sim (as do próprio usuário como ator ou alvo, sem IP de terceiros) | `actor_user_id`, `target_id` e `ip` viram `NULL` onde apontam para o usuário; ação, tipos e data ficam |
| `users` | shared (à parte) | sim (preferências) | passos abaixo |

**Exportar** (`GET /v1/me/export`, `Cache-Control: no-store`): JSON em fluxo, uma seção por tabela
exportável, mais o e-mail lido do token na própria rota; tudo filtrado pelo escopo do dono; limite de 1
exportação por hora por usuário.

**Apagar** (`DELETE /v1/me`, exige reautenticação recente: `auth_time` ≤ 5 min):

1. `users.deleted_at = now()` e para as simulações ativas do dono. **A rota responde `202` aqui**; a
   partir deste ponto o middleware devolve `401 ACCOUNT_DELETED` para o usuário. Os passos 2 e 3 rodam
   em seguida, fora da requisição.
2. Apaga o usuário no Keycloak pelo `crypto-api-service` (derruba sessões e refresh) e grava
   `identity_deleted_at = now()`.
3. Numa transação: `DELETE` em cada tabela de `OWNED_TABLES`, das filhas para os pais (da spec 002:
   `exchange_fills`, `exchange_orders`, `reconciliations`, `execution_sessions`, `exchange_credentials`,
   antes das tabelas da spec 001 que elas referenciem), sempre `WHERE user_id = $owner`; pseudonimiza `PSEUDONYMIZED_TABLES`; anula `display_name` e
   `telegram_chat_id`, `limits` volta ao padrão; grava `data_purged_at = now()`.
4. Rotina do cron: para cada linha com `deleted_at` e `identity_deleted_at IS NULL`, **refaz o passo 2**;
   com `data_purged_at IS NULL`, **refaz o passo 3**; remove a linha de `users` **só** quando as duas
   estão preenchidas (e `deleted_at` tem mais de 24 h). Se alguma tabela de dono tiver ficado com linha,
   a FK `ON DELETE RESTRICT` faz esse `DELETE` falhar alto (alerta), em vez de deixar dado órfão.

Os passos são idempotentes. A essa altura não existe token válido para aquele `sub` (usuário apagado no
Keycloak, access token de no máximo 5 min).

**Mecanismo contra tabela esquecida:** contrato `test/ownership-registry.contract.test.ts` (nasce com a
primeira tabela de dono) lê todas as tabelas do schema Drizzle (`getTableConfig`) e reprova se:
(1) existe tabela com coluna `user_id` fora de `OWNED_TABLES`; (2) existe tabela que não está em
exatamente uma das três categorias; (3) uma tabela de `OWNED_TABLES` não tem `user_id NOT NULL` com FK
para `users`; (4) uma tabela de `PSEUDONYMIZED_TABLES` não declara as colunas que anula. O teste de
integração da T0.9 apaga a conta de A e confere, para cada tabela de `OWNED_TABLES`,
`count(*) WHERE user_id = A` = 0, as linhas de B intactas, `audit_events` sem referência a A e as duas
colunas de estado preenchidas.

### i) Trilha de auditoria — `audit_events`

**Um esquema só**, usado pelas specs 001 e 002 (a spec 002 referencia esta seção e não redefine a
tabela):

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | `uuid` PK (v7) | |
| `actor_user_id` | `uuid` **nulo**, FK `users(id) ON DELETE SET NULL` | `NULL` quando o ator é o sistema ou depois da pseudonimização |
| `actor_kind` | `varchar(16)` `NOT NULL` | `user`, `admin`, `system`, `telegram` |
| `target_kind` | `varchar(32)` `NOT NULL` | `account`, `session`, `invitation`, `execution`, `exchange_credential`, … |
| `target_id` | `uuid` nulo | |
| `action` | `varchar(64)` `NOT NULL` | `account.blocked`, `invitation.sent`, `execution.kill_all`, … |
| `ip` | `inet` nulo | dado pessoal |
| `created_at` | `timestamptz` `NOT NULL` | |
| `payload` | `jsonb` `NOT NULL` default `'{}'` | **sem PII**: nada de e-mail, chat, nome, token ou chave; validado por Zod por `action` |

Fica em `PSEUDONYMIZED_TABLES`, **fora** de `OWNED_TABLES`: não tem `user_id` e não segue a regra 3 do
contrato de registro. **Retenção do IP:** 90 dias (janela de investigação de incidente); depois disso o
cron grava `ip = NULL`. A linha fica 2 anos e então é apagada. Índices: `(actor_user_id, created_at)` e
`(target_kind, target_id, created_at)`.

### j) Kill switch global (spec 002)

`POST /v1/admin/execution/kill-all` (papel `admin`, `acr ≥ 2`) **só grava um sinal global** de desarme e
um `audit_events` (`execution.kill_all`). Quem cancela as ordens e desarma é o **processo executor**, que
lê o sinal e, para cada sessão armada, age com o escopo devolvido pelo pacote junto da linha — o mesmo padrão do worker
(§e regra 7). A resposta é **só agregada** (quantas sessões desarmadas, quantas falhas), sem saldo,
ordens ou ids. É **proibido** `kill/:userId` ou qualquer rota admin que receba id de usuário e atue sobre
a execução dele.

### k) Obrigações herdadas por task

Cada task abaixo só fecha com estes itens atendidos e provados (contrato ou verificação registrada em
`evidence.md`).

**T0.6 — realm e infraestrutura**

- Clientes, papéis e LoA de §a: TOTP `HmacSHA1`; fluxo de navegador com subfluxos *Condition – Level Of
  Authentication* (LoA 1 = senha, LoA 2 = OTP, o OTP do admin dentro dele); cliente confidencial
  `crypto-session`.
- `crypto-api-service` com permissões finas do Keycloak 26 restritas a criar, desabilitar, apagar e
  `execute-actions-email`; **verificação:** mapear o papel de realm `admin` com essa service account
  responde `403`.
- Medir se o reuso de um refresh antigo derruba a sessão inteira ou só recusa a chamada; registrar.
- Mailpit (SMTP de dev) no `compose.yaml`, com bind em `127.0.0.1`.
- Documentar que `Secure` em `http://localhost` não funciona no Safari.
- Topologia painel + API na mesma origem (proxy em `/v1`) por causa do cookie `__Host-` com
  `SameSite=Strict`; senão, CORS com `credentials` e origem exata.

**T0.7 — middleware e sessão**

- *Token handler* com o cliente confidencial `crypto-session` (PKCE + segredo na API); `azp` esperado
  `crypto-session`.
- Classificação de §b: `401` só para a lista fechada de erros de JWT do `jose`; JWKS, rede ou erro
  desconhecido → `503`; nenhum `catch` cai em "autenticado" (contrato).
- Roteador que nega por padrão: toda rota declara `access`; contrato varre a tabela (rota não pública
  sem token → `401`); upgrade de `/v1/stream` só depois de consumir o ticket.
- `/v1/admin/*` exige `acr ≥ 2`. Rota de chave de corretora (spec 002) exige `acr = 2` e
  `auth_time ≤ 5 min`.
- `jose` na versão exata `6.2.12`.
- Deduplicação de refresh na API (hash do refresh por ~10 s) e uma renovação por vez no painel.
- `Cache-Control: no-store` em `/v1/session*` e na exportação; `redirectUri` só da lista configurada.
- CORS com allowlist exata; HSTS, CSP sem `unsafe-inline`, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`; `X-Forwarded-For` só de proxy confiável.
- `users.keycloak_sub varchar(255)`; resolução de §d (leitura, inserção só na primeira vez, contrato de
  `count = 1`); rate limit por `sub` antes do banco.
- Índice público de `@crypto/database` ganha `openDatabase`, `resolveUserBySubject` e as fábricas de
  repositório (§e), atualizando o contrato da lista de exportações.

**T0.8 — `/v1/me`, Telegram e convite**

- Código de vínculo do Telegram: ≥ 8 caracteres base32 gerados por CSPRNG, guardado só o hash, uso
  único, validade 10 min, tentativas limitadas por chat e por código.
- Convite: validade de 24 h (`execute-actions-email` com `lifespan` de 24 h), token de ação de uso
  único, reenvio invalida o anterior; rate limit no convite (§g); auditado (§i).
- Bloquear/desbloquear com `AccountId`, sem bloquear a si mesmo nem o último admin (§f).
- Contrato negativo por rota com o harness e a comparação de 404 de §e.

**Fases 2, 3 e 5 — worker, NOTIFY e WebSocket**

- Worker filtra conta apagada ou bloqueada (`deleted_at IS NULL`, `blocked_at IS NULL`) ao listar
  simulações ativas.
- Violação de FK na corrida com a exclusão de conta = "execução encerrada", não erro em laço.
- Walk-forward órfão (processo caiu no meio) vira `failed` no boot.
- `NOTIFY` leva só `{ runId, kind, eventId }`; a API resolve o dono pelo banco e nunca confia em
  `userId` do payload; na reconexão do listener o painel rebusca.
- Confirmar na Fase 3 se `Bun.SQL` suporta `LISTEN`; se não suportar, ADR antes de qualquer dependência.
- WebSocket: ticket redigido no log, `Origin` validado, fechar com `4403` ao bloquear ou apagar a conta
  (registro em memória `userId → sockets`), renovação de token por mensagem dentro do socket em vez de
  reconectar a cada 5 min.

**Todas — PII em log**

- `email`, `telegram_chat_id`, `ticket`, `code`, `codeVerifier`, `authorization` e cookie são
  **redigidos no logger** (lista de chaves no próprio logger, não disciplina de quem escreve o log).
- O log de acesso mascara a query string.

### l) Resultados medidos da T0.6

Medidos por `make identity-test` (Keycloak de teste descartável, `scripts/identity-test.ts`), contra
**Keycloak 26.8.0** (`quay.io/keycloak/keycloak:26.8.0`, `start-dev --import-realm`) e **Mailpit v1.31.4**.
Reproduzir: `make identity-test`; ao fim ele derruba a infra de teste e apaga o volume.

**Reuso de refresh token** (`revokeRefreshToken = true`, `refreshTokenMaxReuse = 0`), medido com um
cliente temporário com *direct grant*, criado e apagado pelo próprio teste:

| Passo | Resultado |
|---|---|
| refresh #1 com o refresh original | `200`, refresh rotacionado (token novo diferente) |
| refresh #2 com o refresh **original** de novo (reuso) | `400 invalid_grant`, "Maximum allowed refresh token reuse exceeded" |
| refresh #3 com o refresh **novo** (o legítimo) logo depois | `400 invalid_grant`, "Session doesn't have required client" |
| sessões SSO do usuário antes / depois do reuso / depois do #3 | 1 / 1 / 1 |

Conclusão: o reuso **não recusa só a chamada**. Ele invalida a **sessão do cliente** (o vínculo entre a
sessão SSO e aquele cliente), então o refresh novo também morre; a sessão SSO do usuário no Keycloak
continua existindo. Consequência para T0.7: depois de um `400` no refresh o painel precisa refazer o
Code + PKCE (silencioso enquanto a sessão SSO viver, com senha se ela tiver acabado), e a deduplicação
por hash de ~10 s de §a continua obrigatória, porque duas abas ou uma corrida legítima do próprio painel
cairiam exatamente neste caso.

**Service account `crypto-api-service`** (permissões finas v2 do Keycloak 26.8: policy de cliente +
permissão de escopo `manage` e `view` no tipo `Users`, definidas no cliente `admin-permissions` do
realm; **nenhum** papel de `realm-management`, nem `manage-users`):

| Tentativa | Resultado |
|---|---|
| mapear o papel de realm `admin` a um usuário | **`403`** |
| criar usuário com `realmRoles: ["admin"]` no corpo | `201`, mas o corpo é ignorado: o usuário nasce só com o papel padrão |
| ler o realm, listar clientes, alterar o realm | `403` nos três |
| criar usuário, `execute-actions-email` (`lifespan` 86400), desabilitar, apagar | `201`, `204`, `204`, `204`; o e-mail chegou ao Mailpit |

Por que `manage` não basta para mapear papel: no modelo v2 o mapeamento exige o escopo `map-roles` no
usuário e `map-role` no papel, e nenhum dos dois foi concedido.

**Segundo fator e `acr` (para T0.7).** Medido pelo fluxo de navegador real (Code + PKCE, `crypto-panel`):

- Usuário comum: entra só com senha, sem OTP, e o token traz `aud` com `crypto-api`, `azp = crypto-panel`,
  papéis `user` (sem `admin`, sem `offline_access`) e `acr = "password"`.
- Admin **sem** credencial TOTP, com a ação `CONFIGURE_TOTP` pendente: o login para na tela de
  configuração do TOTP. É assim que o convite do admin (T0.8) obriga o cadastro do segundo fator.
- Admin **com** TOTP, login **sem** `acr_values`: entra sem OTP, com `acr = "password"`. Por isso o portão
  do `/v1/admin/*` é o `acr` na API (§b), não o login.
- Admin com `acr_values=2`: um único pedido de OTP (SHA-1, 6 dígitos, 30 s) e `acr = "2"`.
- **O claim `acr` não é um número uniforme.** Nível 1 vem como o nome do mapa (`"password"`); nível 2 vem
  como o valor que o cliente pediu (`"2"` ou `"mfa"`, conforme o `acr_values`). A T0.7 normaliza: aceita
  `acr` em `{"2","mfa"}` como LoA 2 e trata o resto como LoA 1. O painel pede sempre `acr_values=2`.
- Um subfluxo extra "OTP sempre para o papel `admin`" foi testado e **descartado**: ele pede o OTP no
  login comum sem elevar o `acr`, e o step-up da API o pediria de novo (OTP duplo).

**Import do realm.** `--import-realm` usa a estratégia `IGNORE_EXISTING`: subir de novo com o volume
existente registra "Realm already exists. Import skipped" e não toca no realm. Consequência: **mudar o
JSON não altera um realm já importado**; para reimportar, apague o volume
(`make down DOWN_FLAGS=--volumes`). O `make identity-test` sempre parte de volume novo. Segredos
(`KEYCLOAK_SESSION_CLIENT_SECRET`, `KEYCLOAK_SERVICE_CLIENT_SECRET`) e a origem do painel
(`KEYCLOAK_PANEL_ORIGIN`) entram por substituição `${VAR}` no import; o JSON só tem os marcadores, e o
compose falha (`:?`) se a variável faltar.

**Detalhes do realm que a importação ensinou.** O papel padrão só recebe `user` se
`default-roles-crypto-paper-trader` estiver em `roles.realm` com `composites` (o campo `defaultRole`
sozinho deixa os padrões do Keycloak, inclusive `offline_access`); o contrato prende isso.
O realm precisa listar **todos** os fluxos de autenticação (os nativos mais `browser-loa`), porque uma
lista parcial impede o Keycloak de criar os nativos.

**Safari e topologia (obrigação §k).** O cookie `__Host-crypto_refresh` com `Secure` em
`http://localhost` funciona em Chromium e Firefox e **não no Safari**: em desenvolvimento com Safari, use
HTTPS local. Painel e API ficam na **mesma origem** (proxy `/v1`), por causa de `SameSite=Strict`;
senão, CORS com `credentials` e origem exata.

**Portas (127.0.0.1).** dev: Keycloak 56180, Mailpit SMTP 56125 e UI 56126. teste: Keycloak 56181,
Mailpit SMTP 56127 e UI 56128. Console do Keycloak: `http://127.0.0.1:<porta>/admin/` com
`KEYCLOAK_ADMIN_USER` / `KEYCLOAK_ADMIN_PASSWORD` do `envs/`.

### m) Resultados e desvios da T0.7b

Implementação em `apps/api-crypto/src/session/` (rotas, cliente do endpoint de token do Keycloak,
deduplicação) e `apps/api-crypto/src/stream/` (ticket). Provas: contratos contra um Keycloak falso
(`test/session-*.contract.test.ts`, `test/stream-ticket.contract.test.ts`) e `make session-test`
contra o Keycloak 26.8.0 de teste.

**Deduplicação do refresh — medida.** Com a deduplicação, duas chamadas paralelas a
`/v1/session/refresh` com o mesmo cookie dão **200 e 200**, com o mesmo access token e o mesmo
`Set-Cookie`, e uma só troca no Keycloak. Com a deduplicação removida (mutação), o mesmo teste contra o
Keycloak real dá **200 e 401**: a segunda troca reusa o refresh já rotacionado, que o Keycloak recusa (§l).
O resultado de uma troca fica na memória por 10 s (chave: SHA-256 do refresh); falha do Keycloak
(rede/5xx) não é retida, para que a nova tentativa chegue a ele.

**Decisões que o ADR não fixava**

| Ponto | Decisão |
|---|---|
| Cabeçalho CSRF | `X-Requested-With: fetch` (o texto anterior dizia `crypto-panel`); ausente ou diferente, ou `Origin` fora da allowlist do CORS, é `403 CSRF_REJECTED` nas três rotas |
| Resposta do Keycloak | `400` na troca ou no refresh = recusa (`400 AUTHORIZATION_CODE_REJECTED` no login; `401 SESSION_ENDED` e cookie apagado no refresh). Rede, timeout, 5xx, `401 invalid_client` (configuração errada) ou corpo ilegível = `503 SESSION_UNAVAILABLE`, cookie mantido |
| Refresh sem cookie, ou com valor fora do formato de token | `401 SESSION_ENDED` com o cookie apagado, sem ir ao Keycloak |
| Token que a API recusaria | O access token devolvido passa pelo verificador da T0.7 (inclui `email_verified`). Recusado: o refresh recém-emitido é revogado, `401 INVALID_ACCESS_TOKEN`, sem cookie. JWKS fora do ar no login: `503 AUTHENTICATION_UNAVAILABLE`, refresh revogado |
| JWKS fora do ar no refresh | O Keycloak já rotacionou o refresh. A API responde `503` **e regrava o cookie** com o refresh novo; sem isso a tentativa seguinte reusaria o antigo e derrubaria a sessão |
| `DELETE /v1/session` | Revoga no Keycloak (`400` = já morto, conta como feito) e apaga o cookie: `204`, idempotente (sem cookie também). Keycloak inalcançável: `503` e cookie mantido, para o usuário poder tentar de novo em vez de achar que saiu |
| Ticket do stream | `201`, 32 bytes de CSPRNG (256 bits), 30 s, guardado só o SHA-256, uso único; política de rate limit própria (10/min por IP), separada da de login |
| `redirectUri` | Igualdade exata com `SESSION_ALLOWED_REDIRECT_URIS`; corpo `strict`, `codeVerifier` com 43 a 128 caracteres RFC 7636; mensagens de erro nunca ecoam valor |

**Env novo da API (validado no boot):** `KEYCLOAK_TOKEN_URL`, `KEYCLOAK_LOGOUT_URL`,
`KEYCLOAK_SESSION_CLIENT_ID`, `KEYCLOAK_SESSION_CLIENT_SECRET`, `SESSION_ALLOWED_REDIRECT_URIS`.

**Pendente.** O consumo do ticket no handshake do WebSocket (`consumeTicket`) entra na T4.4/T4.7; aqui
estão a função e o contrato (uso único, expirado, inexistente). Dois pontos em memória (deduplicação e
tickets) valem para uma instância da API (§g).

### n) Resultados e desvios da T0.8

Implementação em `apps/api-crypto/src/{profile,telegram,identity-admin,admin}/` e, no pacote,
`users/profile.repository.ts`, `telegram/*`, `admin/admin-account.repository.ts` e
`audit/audit-event.repository.ts`. Migrations `0002` (preferência `alert_telegram_enabled`), `0003`
(`telegram_link_codes` e índice único parcial do `telegram_chat_id`) e `0004` (`audit_events`, esquema único
de §i), todas com rollback. Provas: contratos com Keycloak e Telegram falsos (`test/profile`, `telegram-*`,
`admin-*`, `identity-admin`, `route-params`, `ownership-registry`), `make database-test` (repositórios no
Postgres real) e `make admin-test` (Postgres, Keycloak 26.8.0 e Mailpit descartáveis).

**Medições no Keycloak real** (saída literal em `make admin-test`):

| Pergunta | Resultado |
|---|---|
| A service account lê os papéis de um usuário? | **Sim.** `GET /users/{id}/role-mappings/realm/composite` responde `200` com os papéis **efetivos** (padrão do realm e compostos: `offline_access`, `default-roles-…`, `user`, `uma_authorization` e `admin` quando atribuído à mão). `GET /roles/admin/users` responde `403`; `GET /users/{id}/credentials`, `GET /users?email=…&exact=true` e `GET /users/{id}` respondem `200`. A regra "não bloquear admin" usa os papéis efetivos |
| O `execute-actions-email` respeita `lifespan` e as ações? | Sim. O link do e-mail leva um JWT de ação com `exp - iat = 86400` e `rqac = [VERIFY_EMAIL, UPDATE_PASSWORD]`, nada além disso (claims: `jti`, `nonce`, `eml`, `reduri`) |
| Reenviar o e-mail invalida o link anterior? | **Não.** Duas chamadas seguidas a `execute-actions-email` geram dois links, e os dois abrem o formulário de senha |
| O link de ação é de uso único? | **Não.** Depois de concluir `UPDATE_PASSWORD` com um link, o mesmo link e o anterior (nunca usado) continuam abrindo o formulário de senha e **trocam a senha** (conferido pela data da credencial) até expirar, em 24 h |
| Apagar e recriar o convidado invalida os links? | Sim: o token aponta para o id do usuário apagado e o link deixa de oferecer a etapa de ação |

**Decisão de convite.** Reenviar (`POST /v1/admin/invitations` para o mesmo e-mail) só é permitido a um
convidado **provadamente pendente**: existe no Keycloak, `GET …/credentials` vazio **e** nenhuma linha em
`users` com o id dele como `keycloak_sub`. Nesse caso a API apaga e recria o usuário no Keycloak e envia o
convite novo (links antigos morrem; `isResend: true`). Conta com credencial ou com linha em `users` responde
`409 ACCOUNT_ALREADY_ACTIVE` e não envia nada. Dúvida (Keycloak fora do ar) responde `503`.

**Risco residual aceito até decisão humana.** Depois que a pessoa ativa a conta, os links do e-mail
continuam válidos até 24 h e permitem trocar a senha de uma conta ativa (comportamento do Keycloak 26.8; a
API não consegue revogar o `jti` pelo Admin API). Mitigações possíveis, nenhuma implementada: um
authenticator/SPI que marque o `jti` como usado; reduzir `actionTokenGeneratedByAdminLifespan` (contraria o
requisito de 24 h); avisar o titular por e-mail quando a senha mudar.

**Desvios e decisões que o ADR não fixava**

| Ponto | Decisão |
|---|---|
| Bloquear administrador | A API recusa bloquear **qualquer** conta com papel `admin` (`409 CANNOT_BLOCK_ADMIN`), o que contém o "último admin" de §f; `409 CANNOT_BLOCK_SELF` vale para a própria conta. Papéis ilegíveis (Keycloak fora do ar ou `403`) = `503 IDENTITY_PROVIDER_UNAVAILABLE` e nada é bloqueado. `LAST_ADMIN` não existe |
| Ordem e falha parcial | Bloquear grava `blocked_at` no banco **antes** de desabilitar no Keycloak. Se o Keycloak falhar, o bloqueio do banco fica e a resposta é `202` com `isIdentityProviderSynced: false` (a ação é idempotente e repetível). Desbloquear faz o inverso (habilita no Keycloak e só então limpa o banco); falha do Keycloak = `503` e a conta segue bloqueada |
| Conta apagada | `block`/`unblock` de conta com `deleted_at` respondem `404 ACCOUNT_NOT_FOUND`, igual a id inexistente ou mal formado |
| Harness cross-owner | Nenhuma rota da T0.8 endereça um recurso de usuário por id (`/v1/me` é sempre o do token; o alvo admin é `AccountId`). O harness `expectOtherUserGetsNotFound` não se aplica; em seu lugar há contratos HTTP com dois usuários (B não lê nem altera A, `userId` no corpo vira `400`), a comparação `expectIndistinguishableNotFound` para `ACCOUNT_NOT_FOUND` e a varredura das rotas admin contra uma lista fechada de campos. O ponto que o harness cobriria ao chegar a primeira rota por id (T1.x) continua obrigatório |
| Telegram | Tentativas por **chat** em memória (5 erros em 10 min bloqueiam o chat por 1 h; vale para uma instância, §g); por **código** no banco (`telegram_link_codes.attempts`, o código morre na 5ª recusa por conflito de chat). Um chat só vincula a um usuário (índice único parcial). `TELEGRAM_BOT_TOKEN` e `TELEGRAM_WEBHOOK_SECRET` são opcionais, mas só valem juntos; sem eles a rota do webhook não é registrada e `POST /v1/me/telegram-link` responde `503 FEATURE_DISABLED` (desvincular continua funcionando) |
| Limites de taxa novos | Convite 10/h por administrador (§g); emissão de código do Telegram 10/h por usuário; webhook 300/min por IP |
| Auditoria | Falha ao gravar `audit_events` depois do efeito colateral responde `500` (a ação já ocorreu; repetir é seguro). Vínculo do Telegram não gera evento nesta task |
| Envelope | Erros de validação trazem `error.details: [{ field, reason }]` com todos os problemas de uma vez e **sem eco de valores** (campo desconhecido aparece como `(body)`); listas trazem `pagination` |
| Roteador | Aceita segmentos `:param` no caminho e entrega `pathParams` e `clientAddress` ao handler (o IP vai para a auditoria) |
| Contas listadas | `GET /v1/admin/accounts` lista linhas de `users`; convidados que ainda não entraram não aparecem (só existem no Keycloak) |

**Defeitos de infraestrutura achados pela integração.** (a) Com `jsonb`, o driver `bun-sql` do Drizzle grava
objeto como *string* JSON (jsonb do tipo `string`); o repositório de auditoria faz `${payload}::jsonb`, e o
`database-test` confere `jsonb_typeof = 'object'`. (b) O cursor de listagem perdia a precisão de
microssegundos do `created_at` (repetia a última linha de cada página); a ordenação e o cursor usam
`date_trunc('milliseconds', created_at)`.

**Ponto de extensão (T4.4/T4.7, não implementado).** Fechar com `4403` os sockets abertos de uma conta
bloqueada entra em `apps/api-crypto/src/admin/block-account.use-case.ts`, logo depois de `markBlocked`
(antes de sincronizar o Keycloak): um `AccountBlockedListener` injetado em `AccountStateDependencies` recebe o
`AccountId` e o registro `userId → sockets` fecha as conexões. A conversão `AccountId → UserId` do registro
fica no módulo de stream, nunca no repositório admin.

## Alternativas rejeitadas

| Alternativa | Por que não |
|---|---|
| Autenticação própria (senha na API) | Reimplementar hash, recuperação, verificação de e-mail, TOTP e bloqueio; D9 já decidiu Keycloak |
| Refresh token no `localStorage` ou em memória do SPA | Proibido por RF00 e pela regra de segurança; XSS roubaria sessão longa |
| Cliente público com PKCE trocando o código na API | O *token handler* guarda o refresh; sem segredo, qualquer um que obtenha um código troca por tokens fora da API. Cliente confidencial amarra a troca à API |
| BFF com sessão própria (cookie de sessão opaco, tokens só no servidor) | Mais seguro contra XSS do access token, mas exige armazenamento de sessão no servidor e muda o modelo de autenticação do WebSocket; o *token handler* cobre RF00 com menos peça. Reavaliar antes de abrir para clientes externos |
| Upsert de `users` a cada requisição | Escreve no banco a cada chamada e disputa o lock com o `FOR UPDATE` dos tetos; a leitura com inserção só na primeira vez (§d) resolve o mesmo |
| `userId` no contexto via `AsyncLocalStorage` | Implícito: um use case pode rodar sem dono e ninguém percebe; o parâmetro explícito faz o compilador cobrar |
| Row Level Security do Postgres como mecanismo principal | Exige `SET` de variável de sessão por transação com `Bun.SQL` em pool, fácil de vazar entre conexões; fica como defesa em profundidade a avaliar depois, não substitui o tipo |
| `403` para recurso de outro usuário | Revela que o recurso existe (RF00b) |
| Pacote `packages/auth` | Teria de exportar a cunhagem de `UserId` para o `database` usar, abrindo a porta que o tipo fecha (§c) |
| Web Crypto puro em vez de `jose` | §b |
| TOTP `HmacSHA256` | Os autenticadores mais usados ignoram o algoritmo e geram SHA-1 (§a) |

## Consequências

- Toda rota nova com recurso de usuário nasce com: método de repositório com `OwnerScope`, contrato
  negativo pelo harness (com listagem e comparação de 404) e entrada no registro de tabelas se criar
  tabela. Revisão de código bloqueia sem os três.
- As tabelas filhas ganham `user_id` e FK composta (refletido no `plan.md` §3).
- A API tem rotas de sessão, ticket do stream e admin (`health`, `accounts`, bloquear/desbloquear),
  refletidas no `plan.md` §6.
- O env da API ganha `KEYCLOAK_PUBLIC_URL`, `KEYCLOAK_INTERNAL_URL`, `KEYCLOAK_REALM`,
  `KEYCLOAK_AUDIENCE`, `KEYCLOAK_SESSION_CLIENT_ID`, `KEYCLOAK_SESSION_CLIENT_SECRET`,
  `KEYCLOAK_SERVICE_CLIENT_ID`, `KEYCLOAK_SERVICE_CLIENT_SECRET` e a lista de `redirectUri` (T0.6/T0.7).
- Mudar a superfície pública de `@crypto/database`, afrouxar `OwnerScope`/`UserId` ou desligar uma regra
  do bloco `apps/*/src` do ESLint reprova `typecheck`, `lint` ou os contratos de §c.

## Riscos e o que ficou para depois

| Risco / pendência | Tratamento |
|---|---|
| Cast `as UserId` dentro de `packages/database` fora do mapeamento | Revisão de código; o lint de asserção vale só nas apps |
| Teste (`test/`) importa internals do pacote por caminho relativo | Aceito: o lint de fronteira vale para `apps/*/src`; testes precisam cunhar `UserId` |
| Rate limit, tickets do stream, deduplicação de refresh e registro de sockets em memória | Válido com uma instância; escalar exige ADR (Postgres/Redis) |
| Access token roubado por XSS vale até 5 min | CSP sem `unsafe-inline`, token só em memória, vida curta; BFF reavaliado antes de abrir a clientes |
| Keycloak fora do ar | Rotas respondem `503` quando a JWKS em cache expirar; login indisponível |
| `crypto-api-service` comprometido gerencia usuários | Permissões finas mínimas, sem mapear papel (verificado na T0.6), segredo só em env, rotação documentada |
| Rotação de chave do Keycloak | Coberta pelo cooldown da JWKS; testar na T0.7 com JWKS falso servindo duas chaves |
| Comportamento do Keycloak 26 ao reusar refresh | Medido na T0.6 (§k) |
| `Bun.SQL` sem `LISTEN` | Conferido na Fase 3; ADR antes de dependência |
| Row Level Security como segunda camada | Avaliar depois da Fase 2 |
| Exportação de dados do Keycloak (logs de login) | Fora da etapa 1; a exportação traz o e-mail e as preferências |
| Critério de aceite da T0.5 dizia "contrato negativo vermelho" | Substituído por harness verde com mutação embutida: teste vermelho não é commitado; o contrato de cada rota real nasce vermelho na task da própria rota |
