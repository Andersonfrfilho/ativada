# Evidências — Spec 001

Uma entrada por task fechada: comando rodado, resultado (contagem de testes, tempo), commit.
Escalada de modelo e decisões humanas também entram aqui.

| Task | Data | Comando | Resultado | Commit |
|---|---|---|---|---|
| T0.0 | 2026-10-09 | `git log --oneline`, `git status --short` | 1 commit, árvore limpa | `468a391` |
| T0.1 | 2026-10-09 | `bun run typecheck`, `lint`, `format:check`, `bun test` | verdes; 5 testes, 0 falhas. Mutação: `export default` em `src/` reprovado por 2 testes de contrato e pelo lint | `e4bdc31` |
| T0.2 | 2026-10-09 | `make up`, `make check`, `make down` | verdes; 25 testes. Container `crypto-paper-trader-dev-postgres` em `127.0.0.1:56432`, healthy. Mutação: tirar `127.0.0.1` da porta reprovou 1 teste de contrato | `ba7910f` |
| T0.3 | 2026-10-09 | `make check`, `make migration-test` | verdes; 32 testes; `migration-test: OK (1 migrations aplicadas e desfeitas)`. Mutação: migration com rollback vazio reprovada com "rollback deixou tabelas em public: probe" | `56b57cc` |
| T0.4 | 2026-10-09 | `make check`, `make migration-test`, boot de cada app | verdes; 44 testes. Boot com env vazio: exit 1 e lista `ENV`, `DATABASE_URL`; com `envs/env.dev`: exit 0. Valor secreto não aparece na mensagem. Mutação: `process.env` em `apps/*/src` reprovado pelo lint | `8efe304` |
| T0.4b | 2026-10-09 | `make check`, `make migration-test` | verdes; 47 testes. Schema da URL do Postgres extraído para `@crypto/environment`, removendo 3 cópias | `e1f8545` |
| T0.5 🧠 | 2026-10-09 | `make check` | verde; 56 testes. ADR 0001 (autenticação e isolamento) + tipos `UserId`/`OwnerScope`/`AuthenticatedUser` + harness de contrato negativo. Executor `opus`; validado por `architect` (opus): **APROVADO COM AJUSTES**, 6 obrigatórios | `0439c5e` |
| T0.5b | 2026-10-09 | `make check`, `make migration-test` | verdes; 86 testes. Ajustes obrigatórios do arquiteto: superfície pública de `@crypto/database` fechada, upsert de `users` sem escrita por requisição, `undefined` e 404 idêntico, estados de exclusão de conta, `audit_events` único, obrigações do realm. Mutações: import de `drizzle-orm` e `as UserId` em app reprovados; `LIST_IGNORES_OWNER` reprova o harness | `e21793b`, `4fefbff`, `84b4bed` |
| T0.5c | 2026-10-09 | `make check`, `make migration-test` | verdes; 108 testes. Recheca do arquiteto achou 4 brechas (import dinâmico, `Bun.sql`, overload que devolve `UserId`, extensões `.tsx/.mts/.js`); cada uma fechada com sonda de lint. `createOwnerScope` saiu do índice público. Mutação combinada em app reprovada (5 erros) | `46ee9bc`, `fb3ee8f` |
| T0.6 | 2026-10-09 | `make check`, `make identity-test`, `make up` (dev) | verdes; 160 testes. Keycloak 26.8.0 e Mailpit v1.31.4 com tag fixa, tudo em `127.0.0.1`. `identity-test: OK`: service account mapeando `admin` → **403** e ainda criando/desabilitando/apagando usuário e enviando e-mail de ação; reuso de refresh medido (ver abaixo). Nenhum segredo em claro no realm. Mutações: HmacSHA1→SHA256 e OTP do LoA 2 desligado reprovam o contrato | `3629c3a`, `3afc0d2` |
| T0.7 | 2026-10-09 | `make check`, `make migration-test`, `make database-test`, API real com `curl` | verdes; 288 testes. `jose` 6.2.12 exata. 20 chamadas simultâneas a `resolveUserBySubject` → 1 usuário. API sobe: `/v1/health` 200, `/v1/admin/health` sem token 401, token lixo 401, método errado 405, rota inexistente 404, SIGTERM encerra limpo. Mutações: erro desconhecido→401 (9 falhas), `catch` autenticando (12+), sem `audience` (3), CORS ecoando origem (2), logger sem redação (2), INSERT sem `ON CONFLICT` (database-test falha) | `0da8532`, `bc7e40b`, `1a68c11` |
| T0.7b | 2026-10-09 | `make check`, `make session-test` (Keycloak real) | verdes; 350 testes. `POST /v1/session` troca o código real com o cliente confidencial `crypto-session`; refresh só no cookie `__Host-` HttpOnly; 2 renovações paralelas → 2×200 com UMA troca no Keycloak; `DELETE` revoga (400 no Keycloak, 401 na API); sem `X-Requested-With` → 403; nenhum refresh nos logs. Mutações: sem deduplicação reprova contrato e o teste real (`200/401`); sem checagem de `redirectUri`, refresh no corpo e sem `HttpOnly` reprovados | `4d1fe99`, `2712939` |
| T0.8 | 2026-10-09 | `make check`, `migration-test`, `database-test`, `admin-test` (Keycloak, Postgres e Mailpit reais) | verdes; 484 testes; 5 migrations aplicadas e desfeitas. `/v1/me` nunca devolve chat id, e-mail nem sub. Telegram por código de uso único (só hash no banco). Convite real chega no Mailpit com validade de 86400 s e só `VERIFY_EMAIL`+`UPDATE_PASSWORD`, nunca `admin`. Bloqueio grava no banco ANTES do Keycloak; admin não bloqueia a si nem outro admin (409). 4 ações de admin em `audit_events` sem PII. Integração achou 2 defeitos reais: `jsonb` gravado como string e cursor de listagem repetindo linha. 10 mutações reprovadas | `84d1e9d`, `8a88b56`, `0985beb`, `35a3dc7` |
| T0.9 | 2026-10-09 | `make check`, `migration-test`, `database-test`, `identity-test`, `session-test`, `admin-test`, `lgpd-test` | verdes (contagem final no relatório da task). `lgpd-test` com Postgres, Keycloak 26.8.0 e Mailpit reais: A e B com perfil, chat do Telegram, código pendente e ações de admin; A exporta (só os dados dele, sem hash, sem `keycloak_sub`, sem IP do admin; 2ª exportação → `429`, `Retry-After 3600`); A apaga → `202`, sessão no Keycloak **1 → 0**, token de A → `401 ACCOUNT_DELETED`; cron (`main.ts`, carência de 24 h) apaga A no Keycloak, purga os dados, preenche as duas colunas e mantém a linha; segunda execução vazia; remoção só com a carência zerada pelo parâmetro do teste; `audit_events` com o mesmo número de linhas e nenhuma apontando para A; login de A recusado; B intacto. Mutações reprovadas: pular o passo 2 e o passo 3 (7 e 10 contratos), carência 24 h → 0 (3 contratos e `lgpd-test`: "a carência de 24 h foi ignorada"), apagar `audit_events` (`database-test` "2/4" e `lgpd-test`), exportação sem escopo (`database-test` "códigos de A na exportação: 2" e `lgpd-test`), sem reautenticação (2 contratos), sem rate limit da exportação (1 contrato) | `291d136`, `98e6180`, `7af2cde` e o commit do `lgpd-test` |
| T0.9b | 2026-10-09 | `make check`, `migration-test`, `database-test`, `identity-test`, `session-test`, `admin-test`, `lgpd-test` | verdes; 593 testes. Ajustes das revisões de código e segurança: purga sem starvation (cursor por `(deleted_at, id)`), single-flight do token e lotes de 10, webhook do Telegram sempre 2xx, races 23505 definidas, 404 do Keycloak só vale como "usuário não existe" com o corpo certo, exportação 503 sem gastar a cota, logs de erro de banco só com nome/código, produção exige configuração explícita (`TRUSTED_PROXY_HOPS`, https, `sslmode`, segredos ≥32), rate limiter com LRU por política e IPv6 /64, logout limpa o cookie com o Keycloak fora. Vermelho→verde mostrado em 12 dos 13 itens (o 10 já era correto) | `9da287d`, `81ae934`, `6b9d255`, `1f62134`, `d723895`, `dde8eec` |
| T0.9c | 2026-10-09 | `make check`, `migration-test`, `database-test`, `identity-test`, `session-test`, `admin-test`, `lgpd-test` | verdes; 650 testes. **Achado grave medido e corrigido:** a service account da API conseguia tomar uma conta admin (`PUT /users/{admin}` com e-mail, `reset-password` e `DELETE …/credentials/{totp}` davam 204); agora todas dão 403 (grupo `admins` fora do alcance por permissão negativa FGAP v2). Eventos do Keycloak ligados; e-mail ao titular quando a senha/TOTP muda (medido no Mailpit); console da conta não remove o TOTP só com senha (403); `admin-cli` sem password grant; `crypto-panel` removido; reconciliação de bloqueios e retenção de 730 dias de `audit_events` no cron; alvos `*-test` sem container órfão em Ctrl-C (SIGINT provado) | `956bff9`, `cf4a2fb`, `67ebc36`, `41b67ec`, `cafef75`, `cd656b3`, `403c678` |
| T1.1 | 2026-10-09 | `make check` | verde; 673 testes (23 novos em 2 contratos). Pacote `@crypto/market-data` com cliente REST de klines da Binance (base `data-api.binance.vision`, só market data): Zod em toda resposta, candle aberto descartado, paginação sem duplicar/pular, `Retry-After` respeitado, 418 fatal, backoff com teto, controle de peso. **Fixtures conferidos campo a campo contra a resposta real da Binance: idênticos** (a primeira execução do subagente caiu por erro de conexão da API; o trabalho parcial foi revisado e completado). 11 mutações reprovadas; mutação extra do orquestrador (sem descarte de candle aberto) reprovada | `a210949` |
| T1.2 | 2026-10-09 | `make check`, `make migration-test`, `make database-test` | verdes; 688 testes; 6 migrations aplicadas e desfeitas. Tabelas `candles` (PK composta, CHECKs, sem ENUM) e `sentiment_daily` (0–100), repositórios idempotentes (`DO NOTHING` para candle fechado, que é imutável; `DO UPDATE` para o índice do dia). Banco real prova: reenvio do lote → `inserted = 0`, round trip decimal exato, intervalo semi-aberto, 2.500 candles em lotes de 1000, candle aberto/`high<low`/timeframe inválido rejeitados. Tabelas públicas entram numa lista explícita `UNOWNED_PUBLIC_TABLES`. 5 mutações reprovadas | `dd56042` |
| docs | 2026-10-09 | `bun run format:check` | RF16 (tempo real), T4.7 e T5.8 adicionados após pedido do responsável: o painel deve atualizar preços, plano, ativos, saldo e alertas ao vivo | `0f62262` |

Cada gate foi reexecutado pelo orquestrador (não só lido do relatório do subagente) antes de registrar.

## Resumo da Fase 0

Tasks fechadas: T0.0 a T0.4 (mais a T0.4b, refatoração). 6 commits, 47 testes de contrato, 0 falhas.
Modelo: todas em `executor model=haiku`. **Nenhuma escalada** de modelo foi necessária.

### Desvios e decisões do orquestrador

1. **Dois pacotes novos além do plano:** `packages/database` (Drizzle compartilhado por API, worker e cron) e `packages/environment` (validação Zod compartilhada). `plan.md` e `CLAUDE.md` atualizados.
2. **TypeScript fixado em `^6`:** a versão 7 instalada por padrão quebra o `typescript-eslint`. Reavaliar quando ele suportar o TS 7.
3. **`drizzle.config.ts` usa `export default`:** o `drizzle-kit` só lê a configuração assim. Exceção limitada a esse arquivo por override no ESLint; o contrato continua proibindo `export default` em `src/` e `test/`.
4. **Alvo `migration-test` movido da T0.2 para a T0.3**, que cria o script que ele chama.
5. **Volume do Postgres 18:** a imagem declara `VOLUME /var/lib/postgresql` (o data dir é `/var/lib/postgresql/18/docker`), então o volume monta em `/var/lib/postgresql`.
6. **Driver do banco:** `Bun.sql` nativo via `drizzle-orm/bun-sql`; nenhum `pg` nem `postgres` adicionado.
7. `read-database-url.ts` agora exige URL `postgres://` (antes aceitava qualquer texto): mais estrito, na borda.

### Pendências

- `make down` não apaga os volumes de dados (`-v` é destrutivo). Para limpar: `docker volume rm crypto-paper-trader-dev-postgres-data crypto-paper-trader-test-postgres-data`.
- `import.meta.env` do frontend tipa pelo `@types/bun`; reconferir o tipo quando o Vite entrar (Fase 5).
- Portas em uso por este projeto: Postgres 56432 (dev) e 56433 (test); API reservada 56101 e 56102.
- Próxima fase: **Fase 0b — Contas e login**, com a T0.5 🧠 em `opus`. Não iniciada.

## Resumo da Fase 0b — Contas e login (fechada)

Tasks: T0.5 🧠, T0.5b, T0.5c, T0.6, T0.7, T0.7b, T0.8, T0.9, T0.9b, T0.9c. 39 commits, **650 testes de contrato, 0 falhas**, e seis alvos de integração contra Postgres, Keycloak 26.8.0 e Mailpit reais (`migration-test`, `database-test`, `identity-test`, `session-test`, `admin-test`, `lgpd-test`), todos verdes e sem container órfão.
Modelos: T0.5 em `opus` com validação do `architect` (opus) e recheca; demais em `sonnet`. **Escaladas por falha de gate: nenhuma.**
Revisão de fim de fase: `code-reviewer` e `security-reviewer` (sonnet) — ambos APROVADO COM AJUSTES, sem bloqueantes; os ajustes viraram T0.9b e T0.9c e foram aplicados.

### Desvios de processo (honestos)
- Nas tasks T0.7, T0.7b e T0.9 os contratos nasceram junto da implementação, sem o "vermelho" prévio; a sensibilidade foi provada por mutação. Nas T0.9b e T0.9c o vermelho voltou a ser mostrado.
- Duas tasks novas apareceram para fechar as revisões (T0.9b, T0.9c) e duas surgiram do arquiteto (T0.5b, T0.5c).

### PENDÊNCIAS DE DECISÃO PARA O RESPONSÁVEL (não bloqueiam a Fase 1)
1. O papel `admin` só fica protegido da service account se vier pelo grupo `admins`; quem recebe o papel direto fica sem a proteção e o realm não consegue proibir isso. Alternativa: auditoria periódica de quem tem admin efetivo fora do grupo.
2. A API não bloqueia, desabilita nem apaga um admin. `DELETE /v1/me` de uma conta admin passa o passo 1, mas o cron falha no passo 2 com 403 a cada execução. Decidir: o admin tira o próprio grupo antes de se apagar, ou o cron trata o 403 de admin como pendência manual.
3. Trocar a senha em LoA 1 continua permitido no console da conta (risco aceito: rotas admin exigem `acr ≥ 2`).
4. O link de convite do Keycloak 26.8 não é de uso único; mitigado com o e-mail de aviso ao titular. Reavaliar um SPI antes de abrir a clientes externos.
5. Antes de qualquer deploy: `TRUSTED_PROXY_HOPS` explícito e a API só na rede privada atrás do proxy (já forçado em `ENV=production`).
6. Hoje não há CI no repositório (`.github/` não existe): os alvos `*-test` com Docker só rodam à mão.

### Higiene adiada (menores das revisões, Fase 1)
Funções com 2 parâmetros posicionais (a norma do usuário pede objeto acima de 1), testes de "parede" por texto da fonte em `telegram-primitives`/`database.contract`, `setEnabled` com leitura+PUT da representação inteira, e uma função acima de 40 linhas em `createApplication`/`createRouteTable`.

## Fase 0b — decisões e desvios

1. **Biblioteca JOSE:** `jose` 6.2.12, escolhida no ADR 0001 e agora nomeada em `plan.md` (D9); será instalada na T0.7 com versão exata. Web Crypto puro foi rejeitado (caminho de bypass de autenticação por nossa conta).
2. **Aceite da T0.5:** o `tasks.md` pedia "contrato negativo de exemplo (vermelho)", mas teste vermelho commitado quebraria `make check`. Entregue como harness verde com mutação embutida (o harness reprova 5 repositórios com defeito).
3. **`createOwnerScope` não é público:** o escopo só nasce dentro de `@crypto/database`; a T0.7 entrega `resolveUserBySubject` → `{ userId, scope }`. O lint é segunda camada, com brechas conhecidas e fechadas por sonda; as ainda abertas (`Bun` passado como argumento, `eval`, `require` dinâmico) estão no ADR.
4. **Reuso de refresh, MEDIDO na T0.6:** o refresh antigo reusado dá `400 Maximum allowed refresh token reuse exceeded` e o refresh novo e legítimo, usado em seguida, também dá `400 Session doesn't have required client`: a sessão do cliente é invalidada (a sessão SSO continua). Logo a deduplicação de refresh na API (hash por ~10 s) e uma renovação por vez no painel são obrigatórias, e o painel refaz Code + PKCE depois de um 400.
5. **OTP do admin (desvio da T0.6):** sem subfluxo condicional por papel (ele pedia OTP no login comum sem subir o `acr`). Ficou `CONFIGURE_TOTP` na criação do admin, OTP no LoA 2 e `acr ≥ 2` exigido pela API em `/v1/admin/*`. O claim `acr` não é uniforme (`"password"` no nível 1; no nível 2 repete o valor de `acr_values`): a T0.7 normaliza.
6. `--import-realm` não altera realm existente: mudar o JSON exige apagar o volume (`make down DOWN_FLAGS=--volumes`).
7. **T0.7 — desvios:** (a) no commit 2 a implementação veio antes dos contratos; no lugar do "vermelho" ficou a bateria de mutações acima; (b) rate limit de criação de execução em 20/min por `sub` (ADR §g), não os 10/min do enunciado; (c) `Cache-Control: no-store` em TODA resposta da API, mais restritivo que o ADR; (d) token com mais de 15 min responde `ACCESS_TOKEN_EXPIRED` (o painel renova); (e) `/v1/admin/health` responde 200 com `status: degraded` se o banco cair; (f) `KEYCLOAK_ISSUER` e `KEYCLOAK_JWKS_URL` substituem a composição de URLs do ADR §a.
8. **PENDÊNCIA DE DECISÃO (T0.8):** medido no Keycloak 26.8.0 real, o link de ação do convite **não é de uso único** e reenviar `execute-actions-email` **não invalida** o link anterior. Mitigação implementada: reenvio só para convidado provadamente pendente (a API apaga e recria o usuário; os links antigos morrem); conta ativa responde 409. **Risco residual:** com a conta já ativa, o link do e-mail ainda troca a senha até expirar (24 h). Saídas, nenhuma implementada: (a) ouvinte de eventos do Keycloak que avisa o titular por e-mail quando a senha muda (configuração, sem código); (b) SPI que marque o `jti` como usado; (c) reduzir `actionTokenGeneratedByAdminLifespan` (contraria as 24 h). Recomendação: (a) agora e reavaliar (b) antes de abrir para clientes externos.
9. **Tempo real (pedido do responsável):** RF16. Preços não passam pelo banco: a API mantém um stream de ticker da Binance e publica por pub/sub do `Bun.serve`.

10. **T0.9 — desvios** (detalhe no ADR 0001 §o): (a) os contratos de exportação, exclusão e cron nasceram junto da implementação, não antes; no lugar do "vermelho" ficou a bateria de mutações acima; (b) `REAUTH_REQUIRED` (pedido da task) difere de `REAUTHENTICATION_REQUIRED` do ADR §b: **decisão pendente** antes da spec 002; (c) a exportação é um JSON só, não em fluxo, e precisa virar fluxo quando entrarem tabelas grandes; (d) a retenção de 2 anos da linha de `audit_events` (§i) **não** foi implementada, só a de 90 dias do IP; (e) o `lgpd-test` não exercita `auth_time` antigo contra o Keycloak real (login novo a cada execução); (f) o contrato "o cron sobe e sai 0 com env válido" mudou: ele agora fala com o banco.

## Decisões humanas

| Data | Decisão | Quem |
|---|---|---|
