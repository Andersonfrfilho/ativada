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

## Decisões humanas

| Data | Decisão | Quem |
|---|---|---|
