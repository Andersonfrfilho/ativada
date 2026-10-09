# ADR 0001 — Autenticação e isolamento entre usuários

**Status:** proposto (T0.5, spec 001) · **Data:** 2026-10-09 · **Revisão:** `architect` antes da T0.6

## Contexto

A spec 001 é multiusuário (RF00, RF00b): cada pessoa tem login, estratégias, simulações, alertas, metas
e ativos próprios; candles e sentimento são compartilhados. O plano já fixou: Keycloak/OIDC (D9),
tabela `users` espelho criada no primeiro acesso (D10), autorização por objeto num único ponto com
`userId` obrigatório no tipo do repositório (D11) e um worker que avalia as simulações de todos os
donos no mesmo candle e roteia alertas pelo dono (D12). Os requisitos que este ADR fecha:

- RF00: Authorization Code + PKCE, recuperação de senha, verificação de e-mail, TOTP obrigatório para
  administrador, access token ≤ 15 min, refresh rotativo em cookie `HttpOnly`, cadastro por convite.
- RF00b: `userId` só do token; filtro do dono em toda consulta e alteração; recurso de outro usuário
  responde `404`; tetos de simulações ao vivo (5) e walk-forwards simultâneos (1) por usuário.
- RNF04 (nada de segredo nem dado pessoal em log), RNF07 (rate limit por usuário, mais duro no login),
  RNF08 (exportar e apagar a conta).
- Critérios de aceite 6 (contrato negativo por rota: B recebe `404` ao ler, alterar, parar e exportar
  o recurso de A) e 7 (dois usuários no mesmo par recebem só os próprios alertas).

As tasks T0.6 (realm), T0.7 (middleware), T0.8 (`/v1/me`, convite), T0.9 (LGPD) e todas as rotas
futuras herdam este desenho. Na dúvida, ele escolhe o lado mais restritivo.

## Decisão

### a) Realm Keycloak

**Realm:** `crypto-paper-trader`, versionado em `realm/crypto-paper-trader.realm.json` (T0.6), import
idempotente. `KC_HOSTNAME` fixo por ambiente, para que o `iss` não varie com o host de quem chama.

**Clientes**

| `clientId` | Tipo | Configuração |
|---|---|---|
| `crypto-panel` | público (SPA) | só `standardFlowEnabled`; `pkce.code.challenge.method = S256` obrigatório; `implicitFlowEnabled`, `directAccessGrantsEnabled` e `serviceAccountsEnabled` desligados; `redirectUris` e `webOrigins` enumerados por ambiente (nunca `*`); `fullScopeAllowed = false`, com escopo restrito aos papéis `user` e `admin`; mapper *Audience* que inclui `crypto-api` no `aud` do access token |
| `crypto-api` | resource server | não inicia login (todos os fluxos desligados, sem segredo usado); existe só para ser o `aud` esperado pela API |
| `crypto-api-service` | confidencial, só *service account* | usado pela API para o Admin API do Keycloak (convite, bloqueio, exclusão de conta); papéis de cliente `realm-management`: **só** `manage-users` e `view-users`; segredo em env validado no boot (`KEYCLOAK_SERVICE_CLIENT_SECRET`), nunca em log |

**Papéis de realm:** `user` e `admin`. O papel padrão do realm (`default-roles-crypto-paper-trader`)
contém `user`; `admin` é atribuído só à mão no Keycloak (nunca pela API na etapa 1). Os papéis somam:
uma conta com `admin` e `user` usa o produto como qualquer usuário e, além disso, acessa `/v1/admin/*`.

**Segundo fator**

- `admin`: fluxo de navegador próprio (`browser-with-conditional-otp`) com *Condition – User Role* =
  `admin` → *OTP Form* `REQUIRED`; ação obrigatória `CONFIGURE_TOTP` atribuída na criação do admin.
- Quem cadastrar chave de corretora (spec 002): a API exige **step-up** — o access token precisa
  trazer `acr` de nível 2 (mapa `acr.loa.map = {"password":1,"mfa":2}` no realm, OTP no nível 2). A rota
  de chave responde `403 MFA_REQUIRED` sem esse `acr`; o painel refaz o login com `acr_values=2`. O
  realm já nasce com o mapa de níveis; a checagem na rota é da spec 002.
- TOTP: `HmacSHA256`, 6 dígitos, período 30 s, janela 1.

**Política de senha:** `length(12) and maxLength(128) and notUsername and notEmail and passwordHistory(5)`.
Hash padrão do Keycloak (argon2 na série 26). **Brute force detection** ligada: `failureFactor 5`,
`waitIncrementSeconds 60`, `maxFailureWaitSeconds 900`, `maxDeltaTimeSeconds 43200`, bloqueio
temporário (não permanente, para não virar negação de serviço contra a vítima).

**Conta:** `registrationAllowed = false` (cadastro só por convite), `verifyEmail = true`,
`resetPasswordAllowed = true`, `loginWithEmailAllowed = true`, `duplicateEmailsAllowed = false`,
`editUsernameAllowed = false`, `rememberMe = false`. SMTP do realm aponta para um servidor de e-mail
local de teste em dev (definido na T0.6) e para o provedor real só quando publicado.

**Tokens e sessão**

| Parâmetro | Valor |
|---|---|
| `accessTokenLifespan` | 300 s (5 min; teto de RF00 é 15) |
| `ssoSessionIdleTimeout` | 1800 s |
| `ssoSessionMaxLifespan` | 36000 s (10 h) |
| `revokeRefreshToken` | `true`, `refreshTokenMaxReuse = 0` (refresh rotativo; reuso de um refresh antigo derruba a sessão) |
| `offline_access` | removido do papel padrão; ninguém recebe refresh offline |

**Claims usadas pela API:** `sub` (identidade estável), `email` (só em memória, ver §c), `email_verified`
(precisa ser `true`), `realm_access.roles`, `iss`, `aud`, `azp` (precisa ser `crypto-panel`), `exp`,
`iat`, `typ` (precisa ser `Bearer` — ID token e refresh token apresentados como bearer são recusados)
`auth_time` (só em `DELETE /v1/me`, §h) e, só na spec 002, `acr`.

**`issuer`:** `${KEYCLOAK_PUBLIC_URL}/realms/crypto-paper-trader`. **`audience`:** `crypto-api`. Os dois
e a URL da JWKS (`${KEYCLOAK_INTERNAL_URL}/realms/crypto-paper-trader/protocol/openid-connect/certs`)
vêm do env validado no boot; a API **não** usa descoberta (`.well-known`) em tempo de execução, para que
um issuer trocado não seja aceito por engano.

**Refresh em cookie `HttpOnly` (implementação na Fase 5, contrato fechado aqui).** O navegador nunca vê
o refresh token. A API faz o papel de *token handler* para o cliente público:

1. O painel gera `code_verifier`/`code_challenge` (S256) e `state`, guarda o verifier em
   `sessionStorage` só até o retorno, e redireciona ao Keycloak.
2. No retorno, o painel envia `{ code, codeVerifier, redirectUri }` para `POST /v1/session`. A API troca
   o código no endpoint de token do Keycloak (cliente `crypto-panel`, sem segredo, com PKCE), devolve
   **só o access token** no corpo e grava o refresh em cookie
   `__Host-crypto_refresh; HttpOnly; Secure; SameSite=Strict; Path=/` com validade igual à da sessão.
3. O access token vive só em memória no painel. Expirado (ou ao recarregar a página), o painel chama
   `POST /v1/session/refresh`; a API lê o cookie, renova no Keycloak, regrava o cookie com o refresh
   novo (rotação) e devolve o access token novo.
4. `DELETE /v1/session` faz logout no Keycloak e apaga o cookie.
5. As três rotas de sessão exigem `Origin` na lista de origens permitidas e o cabeçalho
   `X-Requested-With: crypto-panel` (defesa de CSRF além do `SameSite=Strict`), e nunca registram o
   corpo nem o cookie em log.

### b) Validação do JWT na API

**Biblioteca:** [`jose`](https://github.com/panva/jose) de Filip Skokan (panva), **versão 6.2.12**
(última publicada, 2026-09-05), declarada como `"jose": "^6.2.12"` com lockfile congelado. Instalação na
T0.7 — é o único pacote novo previsto para a Fase 0b.

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
| `requiredClaims` | `['sub', 'exp', 'iat', 'iss', 'aud']`; depois do `jwtVerify`, um schema Zod valida `typ = 'Bearer'`, `azp = 'crypto-panel'`, `email` (string), `email_verified = true` e `realm_access.roles` (array de strings) |

**Respostas de erro** (envelope `{ error: { code, message } }`, mensagem genérica, sem detalhe da causa):

| Situação | Status | `code` |
|---|---|---|
| Sem `Authorization: Bearer …` ou formato inválido | 401 | `AUTHENTICATION_REQUIRED` |
| Token expirado (`ERR_JWT_EXPIRED`) | 401 | `ACCESS_TOKEN_EXPIRED` (+ `WWW-Authenticate: Bearer error="invalid_token"`) |
| Assinatura, `alg`, `iss`, `aud`, `azp`, `typ` ou claim inválidos; `kid` desconhecido | 401 | `INVALID_ACCESS_TOKEN` |
| `email_verified` falso | 403 | `EMAIL_NOT_VERIFIED` |
| Token válido sem o papel exigido pela rota (nenhum de `user`/`admin`, ou rota admin sem `admin`) | 403 | `FORBIDDEN` |
| Conta apagada (§d) | 401 | `ACCOUNT_DELETED` |
| Conta bloqueada pelo admin (§d) | 403 | `ACCOUNT_BLOCKED` |
| JWKS inalcançável ou timeout | 503 | `AUTHENTICATION_UNAVAILABLE` (não 401: falha de infraestrutura não desloga ninguém) |

O token, o cabeçalho `authorization` e a causa detalhada da falha nunca vão para log; o log leva só o
`code` e o `traceId`.

### c) Contexto autenticado

```ts
type AuthenticatedUser = {
  readonly userId: UserId;          // uuid interno de users.id, tipo nominal
  readonly keycloakSubject: string; // sub
  readonly email: string;           // do token; só em memória
  readonly roles: readonly UserRole[]; // 'user' | 'admin'
};
```

- **Onde nasce:** no middleware de autenticação da API (T0.7), depois do `jwtVerify` e do upsert em
  `users` (§d). Objeto congelado (`createAuthenticatedUser`), inclusive o array de papéis.
- **Como chega ao use case:** parâmetro explícito. A rota recebe `authenticatedUser` do middleware e
  chama o use case com `createOwnerScope(authenticatedUser.userId)` (recurso de usuário) ou com o
  próprio `authenticatedUser` (perfil, sessão, admin). **Proibido** global, singleton por requisição,
  `AsyncLocalStorage` ou leitura implícita de contexto.
- **`userId` vem só do token.** `UserId` é tipo nominal e só é cunhado por `userIdFromDatabase`, usado
  exclusivamente no mapeamento de linha de `packages/database` (o `id` devolvido pelo upsert de
  `users` e o `user_id` lido de uma linha pelo worker). Um `string` de payload, query ou path não vira
  `UserId` sem um cast — e o contrato `test/ownership.contract.test.ts` reprova `userIdFromDatabase`,
  `as UserId` e `as OwnerScope` em qualquer `src/` fora de `packages/database`. Nenhum schema de
  entrada declara campo `userId`; o `.strict()` dos schemas Zod faz um `userId` no corpo virar `400`.
- **E-mail é dado pessoal:** não é gravado em `users` (o Keycloak é a fonte), não vai para log, não vai
  para evento de WebSocket nem para payload de `NOTIFY`.
- **Local do código:** `packages/database/src/ownership/` (sem pacote novo). Justificativa: a garantia
  depende de que só a camada de persistência cunhe `UserId`; API e worker já dependem de
  `@crypto/database`; um pacote `packages/auth` teria de reexportar a cunhagem para o `database`, o que
  abriria exatamente a porta que o tipo quer fechar. A verificação do JWT (com `jose`) fica em
  `apps/api-crypto`, porque só a API recebe token.

### d) Tabela `users` e criação no primeiro acesso

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | `uuid` PK (v7) | o `UserId` |
| `keycloak_sub` | `varchar(64)` `NOT NULL` | **índice único total** (não parcial: a linha apagada continua bloqueando a recriação) |
| `display_name` | `varchar(120)` nulo | |
| `display_currency` | `varchar(3)` `NOT NULL` default `'BRL'` | `BRL`/`USD`, sem ENUM nativo |
| `timezone` | `varchar(64)` `NOT NULL` default `'America/Sao_Paulo'` | |
| `telegram_chat_id` | `varchar(32)` nulo | dado pessoal; nunca em log |
| `limits` | `jsonb` `NOT NULL` | `{ "maxActiveLivePaperRuns": 5, "maxConcurrentWalkForwards": 1, "maxActivePriceAlerts": 50 }`, validado por Zod |
| `created_at`, `updated_at` | `timestamptz` | |
| `blocked_at` | `timestamptz` nulo | bloqueio pelo admin; a API responde `403 ACCOUNT_BLOCKED` |
| `deleted_at` | `timestamptz` nulo | marca de exclusão (§h) |

E-mail não é coluna. **Upsert atômico no primeiro acesso:**

```sql
INSERT INTO users (id, keycloak_sub) VALUES ($uuidv7, $sub)
ON CONFLICT (keycloak_sub) DO UPDATE SET keycloak_sub = EXCLUDED.keycloak_sub
RETURNING id, deleted_at, blocked_at;
```

Dois primeiros acessos simultâneos do mesmo `sub` resolvem no índice único e devolvem a mesma linha
(contrato da T0.7: `Promise.all` de duas requisições → `count(*) = 1`). Se a linha voltar com
`deleted_at`, a resposta é `401 ACCOUNT_DELETED` e **nada é recriado**: um access token ainda válido
(até 5 min) de uma conta apagada não ressuscita a conta. A linha marcada é removida de vez por rotina do
cron 24 h depois (§h); a essa altura o usuário já foi apagado no Keycloak, então não existe token válido
para aquele `sub`.

### e) Isolamento por dono (D11)

**Tipos** (`packages/database/src/ownership/`, materializados nesta task):

- `UserId` — `string` com marca nominal; só `userIdFromDatabase` cunha (UUID em minúsculas, senão
  `InvalidUserIdError`).
- `OwnerScope` — `{ readonly ownerUserId: UserId }` com marca nominal; só `createOwnerScope(userId)` cria,
  congelado. Um objeto montado à mão não é `OwnerScope`, mesmo com `UserId` legítimo.
- `ownerCondition(scope, tabela.userId)` — devolve o `SQL` `"tabela"."user_id" = $1` do Drizzle.

**Regras do repositório de recurso de usuário** (toda tabela da lista de §h):

1. Todo método recebe `scope: OwnerScope` como **primeiro** parâmetro. Chamar sem escopo, com objeto
   forjado ou com `string` crua é erro de compilação (provado por `@ts-expect-error` no contrato).
2. Toda leitura usa `where(and(ownerCondition(scope, t.userId), …))`. Toda alteração é
   `UPDATE/DELETE … WHERE id = $id AND user_id = $owner RETURNING id`; zero linhas → `null`, e o use case
   lança o erro de domínio `*_NOT_FOUND` → `404`. Nunca "busca por id e depois compara o dono" em código.
3. Inserção grava `user_id = scope.ownerUserId`; o tipo de entrada do repositório não tem campo de dono.
4. Recurso que referencia outro (ex.: `POST /v1/runs` com `strategyVersionId`) carrega o referenciado
   com o mesmo escopo antes; de outro dono → `404` do referenciado.
5. Toda tabela de usuário leva `user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT`,
   **inclusive as filhas** (`strategy_versions`, `fills`, `walk_forward_windows`, `telegram_link_codes`),
   para que o filtro nunca dependa de join. Filha referencia o pai por FK composta
   `(parent_id, user_id) → parent(id, user_id)` (o pai declara `UNIQUE (id, user_id)`): o banco recusa
   uma linha cujo dono diverge do dono do pai. Índices começam por `user_id`.
6. **`404`, nunca `403`,** para recurso de outro usuário — mesmo `code` e mesma mensagem de recurso
   inexistente, mesma consulta (sem caminho de tempo diferente).
7. O worker opera em nome do dono com `createOwnerScope(run.userId)`, onde `run.userId` veio da linha
   lida (`userIdFromDatabase`). Não existe "escopo de sistema" que enxergue todos os donos dentro de um
   repositório de recurso; a leitura que lista as simulações ativas de um par é uma consulta própria do
   worker, que devolve `(runId, userId)` e não expõe dados de usuário.

**WebSocket (`/v1/stream`):** o navegador não manda cabeçalho no handshake, e token em query é proibido.
O painel pede `POST /v1/stream/tickets` (Bearer) e recebe um ticket aleatório de 32 bytes, uso único,
válido por 30 s, guardado em memória da API com o `userId` (só o hash do ticket). O handshake
`/v1/stream?ticket=…` consome o ticket e liga a conexão a `ws.data.userId`. A conexão assina **só** o
tópico `user:<userId>`; o cliente não escolhe tópico. Eventos do worker chegam por `NOTIFY` com
`{ userId, runId, kind }` (sem dado pessoal) e são publicados em `user:<userId>`. A conexão é fechada
(código `4401`) no `exp` do token que gerou o ticket; o painel pede ticket novo e reconecta.

**Como se testa:**

- Harness `expectOtherUserGetsNotFound(contract)` em `test/fixtures/cross-owner-access.fixture.ts`. Para
  cada tentativa (`read`, `rename`/`update`, `stop`, `export`, …) num recurso novo: o dono vê o
  recurso; o outro usuário não vê; a tentativa do outro devolve `not_found`; o estado visto pelo dono
  não mudou (pega escrita silenciosa antes da checagem); e a mesma tentativa do dono devolve `granted`
  (prova que a tentativa está ligada de verdade).
- O próprio harness é provado contra um repositório em memória correto e contra três defeitos
  (leitura sem filtro, alteração sem filtro, escrita antes da checagem) — os três reprovam.
- Rotas HTTP (a partir da T0.8): o adaptador da tentativa mapeia **só** `404` com `RESOURCE_NOT_FOUND`
  → `not_found` e `2xx` → `granted`; qualquer outro status (inclusive `403`) lança e reprova. Cada rota
  com recurso de usuário nasce com seu contrato (critério de aceite 6).
- WebSocket: dois usuários conectados; evento do run de A é publicado; o socket de B não recebe nada
  dentro de 1 s e o de A recebe (critério 7, Fase 3/5).

### f) Papel `admin`

**Pode:** ver saúde do sistema (`/v1/admin/health`: filas, último candle por par, atraso do stream,
contagem agregada de simulações ativas — números, sem dono); convidar usuário
(`POST /v1/admin/invitations { email }` → API cria o usuário no Keycloak pelo `crypto-api-service`,
`emailVerified = false`, e dispara `execute-actions-email` com `VERIFY_EMAIL` e `UPDATE_PASSWORD`,
link válido por 72 h); bloquear e desbloquear conta (Keycloak `enabled = false` + `users.blocked_at`);
listar contas com dados mínimos (e-mail do Keycloak, estado, datas).

**Não pode:** ler, listar, alterar ou exportar estratégias, versões, execuções, sinais, ordens,
carteiras, alertas, metas, alertas de preço, ativos ou o Telegram de outro usuário; não existe rota
admin que receba `userId` e devolva recurso de usuário, e não existe factory de `OwnerScope` a partir
de identificador vindo de requisição. Não atribui papel `admin` (só à mão no Keycloak). Toda ação admin
grava trilha de auditoria (ator, alvo, ação, IP, data) — tabela `audit_events` na T0.8.

### g) Rate limit e tetos de uso

- **Onde vive:** middleware da API, depois da autenticação, em memória (token bucket por chave). Etapa 1
  roda uma instância da API; mais de uma instância exige mover para o Postgres ou Redis (ADR novo).
- **Chaves e limites iniciais:** autenticado → por `userId`, 120 req/min; criação de execução
  (`POST /v1/runs`, `POST /v1/goals/evaluate`) → por `userId`, 20/min; rotas de sessão
  (`/v1/session*`) e tickets de stream → por IP, 10/min; sem token → por IP, 30/min. Excedido →
  `429 RATE_LIMITED` com `Retry-After`.
- **Login:** a senha é digitada no Keycloak, não na API; o limite duro do login é o *brute force
  detection* do realm (§a) mais o limite de 10/min por IP nas rotas de sessão.
- **Tetos de RF00b:** valores em `users.limits`. Cobrança no use case que cria a execução, dentro de uma
  transação: `SELECT … FROM users WHERE id = $owner FOR UPDATE`, conta as execuções `live_paper`
  ativas (ou `walk_forward` em andamento) do dono e insere; acima do teto → `409 LIVE_RUN_LIMIT_REACHED`
  / `409 WALK_FORWARD_LIMIT_REACHED`. O lock na linha do dono serializa criações concorrentes do mesmo
  usuário sem travar os outros. A fila de `worker_thread` do walk-forward também recusa um segundo job
  do mesmo dono (defesa em profundidade). Alertas de preço: mesmo padrão, `409 PRICE_ALERT_LIMIT_REACHED`.

### h) LGPD — exportar e apagar a conta

**Tabelas de usuário** (registro único `OWNED_TABLES` em `packages/database/src/ownership/`, criado na
primeira migration com tabela de dono):

| Tabela | Exporta | Apaga | Observação |
|---|---|---|---|
| `strategies` | sim | sim | |
| `strategy_versions` | sim | sim | `user_id` denormalizado |
| `runs` | sim | sim | |
| `walk_forward_windows` | sim | sim | `user_id` denormalizado |
| `signals` | sim | sim | |
| `orders` | sim | sim | |
| `fills` | sim | sim | `user_id` denormalizado |
| `positions` | sim | sim | |
| `equity_points` | sim | sim | |
| `alerts` | sim | sim | |
| `goals` | sim | sim | |
| `price_alerts` | sim | sim | |
| `user_assets` | sim | sim | dado financeiro pessoal |
| `telegram_link_codes` | não (segredo transitório) | sim | |
| `audit_events` | sim (as do próprio usuário como ator ou alvo) | pseudonimiza (ator/alvo viram `null`, ação e data ficam) | obrigação de rastreabilidade |
| `users` | sim (preferências) | marca `deleted_at`, anula colunas pessoais; remoção física em 24 h | §d |

Compartilhadas, sem dono: `candles`, `sentiment_daily`.

**Exportar** (`GET /v1/me/export`): JSON em fluxo, uma seção por tabela do registro com `export = sim`,
mais o e-mail do token; tudo filtrado pelo escopo do dono; limite de 1 exportação por hora por usuário.

**Apagar** (`DELETE /v1/me`, exige reautenticação recente: `auth_time` ≤ 5 min):

1. `users.deleted_at = now()` (a partir daqui toda requisição do usuário dá `401 ACCOUNT_DELETED`);
   para as simulações ativas do dono.
2. Apaga o usuário no Keycloak pelo `crypto-api-service` (derruba sessões e refresh).
3. Numa transação: `DELETE` em cada tabela do registro, das filhas para os pais, sempre
   `WHERE user_id = $owner`; anula `display_name`, `telegram_chat_id` e `limits` volta ao padrão.
4. Cron remove a linha de `users` 24 h depois. Se alguma tabela de dono tiver ficado com linha, a FK
   `ON DELETE RESTRICT` faz esse `DELETE` falhar alto (alerta), em vez de deixar dado órfão.

Falha no passo 2 deixa a conta marcada e é refeita pelo cron; os passos são idempotentes.

**Mecanismo contra tabela esquecida:** contrato `test/ownership-registry.contract.test.ts` (nasce com a
primeira tabela de dono) lê todas as tabelas do schema Drizzle (`getTableConfig`) e reprova se:
(1) existe tabela com coluna `user_id` fora de `OWNED_TABLES`; (2) existe tabela que não está nem em
`OWNED_TABLES` nem em `SHARED_TABLES` (`candles`, `sentiment_daily`, `users`); (3) uma tabela de
`OWNED_TABLES` não tem `user_id NOT NULL` com FK para `users`. O teste de integração da T0.9 apaga a
conta de A e confere, para cada tabela do registro, `count(*) WHERE user_id = A` = 0 e as linhas de B
intactas.

## Alternativas rejeitadas

| Alternativa | Por que não |
|---|---|
| Autenticação própria (senha na API) | Reimplementar hash, recuperação, verificação de e-mail, TOTP e bloqueio; D9 já decidiu Keycloak |
| Refresh token no `localStorage` ou em memória do SPA | Proibido por RF00 e pela regra de segurança; XSS roubaria sessão longa |
| BFF com sessão própria (cookie de sessão opaco, tokens só no servidor) | Mais seguro contra XSS do access token, mas exige armazenamento de sessão no servidor e muda o modelo de autenticação do WebSocket; o *token handler* cobre RF00 com menos peça. Reavaliar antes de abrir para clientes externos |
| `userId` no contexto via `AsyncLocalStorage` | Implícito: um use case pode rodar sem dono e ninguém percebe; o parâmetro explícito faz o compilador cobrar |
| Row Level Security do Postgres como mecanismo principal | Exige `SET` de variável de sessão por transação com `Bun.SQL` em pool, fácil de vazar entre conexões; fica como defesa em profundidade a avaliar depois, não substitui o tipo |
| `403` para recurso de outro usuário | Revela que o recurso existe (RF00b) |
| Pacote `packages/auth` | Teria de exportar a cunhagem de `UserId` para o `database` usar, abrindo a porta que o tipo fecha (§c) |
| Web Crypto puro em vez de `jose` | §b |

## Consequências

- Toda rota nova com recurso de usuário nasce com: método de repositório com `OwnerScope`, contrato
  negativo pelo harness e entrada no registro `OWNED_TABLES` se criar tabela. Revisão de código bloqueia
  sem os três.
- As tabelas filhas ganham `user_id` e FK composta (ajuste no modelo de dados do `plan.md` §3, a ser
  refletido quando a T0.7/Fase 2 criar as tabelas).
- A API passa a ter três rotas de sessão (`/v1/session`) e uma de ticket do stream, ausentes do `plan.md`
  §6 — entram no plano junto com a Fase 5.
- O env da API ganha `KEYCLOAK_PUBLIC_URL`, `KEYCLOAK_INTERNAL_URL`, `KEYCLOAK_REALM`,
  `KEYCLOAK_AUDIENCE`, `KEYCLOAK_SERVICE_CLIENT_ID` e `KEYCLOAK_SERVICE_CLIENT_SECRET` (T0.6/T0.7).
- O teste do `@ts-expect-error` e o contrato de cunhagem prendem o tipo; mudar a assinatura de
  `OwnerScope` ou `UserId` para algo mais frouxo reprova o `typecheck`.

## Riscos e o que ficou para depois

| Risco / pendência | Tratamento |
|---|---|
| Cast `as UserId` dentro de `packages/database` fora do mapeamento | Revisão de código; o contrato só vigia fora do pacote |
| Rate limit e tickets do stream em memória | Válido com uma instância; escalar exige ADR (Postgres/Redis) |
| Access token roubado por XSS vale até 5 min | CSP sem `unsafe-inline`, token só em memória, vida curta; BFF reavaliado antes de abrir a clientes |
| Keycloak fora do ar | Rotas respondem `503` enquanto a JWKS em cache expirar; login indisponível |
| `crypto-api-service` comprometido gerencia usuários | Escopo mínimo (`manage-users`, `view-users`), segredo só em env, rotação documentada na T0.6 |
| Rotação de chave do Keycloak | Coberta pelo cooldown da JWKS; testar na T0.7 com JWKS falso servindo duas chaves |
| Step-up `acr` para chave de corretora | Mapa de níveis nasce no realm; a checagem é da spec 002 |
| Row Level Security como segunda camada | Avaliar depois da Fase 2 |
| Exportação de dados do Keycloak (logs de login) | Fora da etapa 1; a exportação traz o e-mail e as preferências |
| Critério de aceite da T0.5 dizia "contrato negativo vermelho" | Substituído por harness verde com mutação embutida: teste vermelho não é commitado; o contrato de cada rota real nasce vermelho na task da própria rota |
