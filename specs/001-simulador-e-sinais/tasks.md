# Tasks — Spec 001

Cada task fecha com: `bun run typecheck` + testes da área + commit isolado + evidência em
`evidence.md`. Teste de contrato **antes** da implementação.

## Fase 0 — Fundação

> 🤖 Modelo: `haiku`

| Task | O quê | Aceite |
|---|---|---|
| T0.0 | `git init`, `.gitignore` (node_modules, `.env*`, `envs/*.local`, `.omc/`), commit inicial só com a documentação | `git log` com um commit; `git status` limpo |
| T0.1 | Monorepo Bun com workspaces (`apps/*`, `packages/*`), `tsconfig` estrito (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), ESLint, Prettier | `bun run typecheck` e `bun run lint` verdes |
| T0.2 | `compose.yaml` (Postgres) com bind em 127.0.0.1, `envs/env.dev` e `env.test`, `Makefile` com `PROJECT_NAME` (`bootstrap`, `up`, `down`, `check`, `migration-test`) | `make up && make check` verdes |
| T0.3 | Drizzle + migration inicial vazia + script de rollback | `make migration-test` verde |
| T0.4 | Schema Zod do env em cada app, falha no boot se faltar variável | Teste: boot sem variável falha com mensagem clara |

## Fase 0b — Contas e login

> 🤖 Modelo: `sonnet` (T0.5 é 🧠 — `opus`)

| Task | O quê | Aceite |
|---|---|---|
| T0.5 🧠 | Desenho de autenticação e isolamento: realm Keycloak (clientes, papéis `user`/`admin`, TOTP do admin), formato do contexto autenticado, tipo de repositório com `userId` obrigatório (D11) | Revisão `architect`; contrato negativo de exemplo escrito (vermelho) |
| T0.6 | Keycloak no `compose.yaml`, realm versionado em `realm/`, import idempotente | `make up` sobe com login funcionando |
| T0.7 | Middleware da API: valida JWT pela JWKS, cria `users` no primeiro acesso, rate limit por usuário | Contrato: token inválido/expirado → 401; primeiro acesso cria um usuário só |
| T0.8 | `/v1/me`, preferências, vínculo do Telegram por código, convite pelo admin | Contrato por rota |
| T0.9 | LGPD: exportar e apagar conta | Integração: apagar remove dados do usuário e não toca nos de outro |

## Fase 1 — Dados de mercado

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T1.1 | Cliente REST de klines da Binance com validação Zod da resposta e controle de peso | Teste de contrato com resposta gravada |
| T1.2 | Migration `candles` e `sentiment_daily` + repositório | Teste de integração: upsert idempotente |
| T1.3 | `cron-crypto`: backfill retomável de 2 anos, detecção de lacuna | Integração: lacuna simulada é preenchida; segunda execução não duplica |
| T1.4 | `cron-crypto`: Fear & Greed diário | Contrato com resposta gravada |
| T1.5 | `worker-crypto`: stream WS de kline com reconexão e recuperação de lacuna pelo REST | Integração com servidor WS falso: queda e retomada sem buraco |

## Fase 2 — Motor (`packages/strategy-engine`)

> 🤖 Modelo: `sonnet` (T2.1 é 🧠 — `opus`)

| Task | O quê | Aceite |
|---|---|---|
| T2.1 🧠 | Fechar o contrato do motor: tipos `StepInput`/`StepResult`, modelo de preenchimento (D6), schema Zod da estratégia, regras de regime. Escrever os testes de contrato de lookahead, determinismo e preenchimento (vermelhos) | Testes escritos e falhando pelo motivo certo; revisão `architect` |
| T2.2 | Indicadores: confirmar cobertura do `trading-signals`; envolver numa interface própria; implementar o que faltar | Cada indicador bate com valores de referência externos (tolerância 1e-8) |
| T2.3 | Votos por família, regime ADX e placar com texto de motivo | Contrato: tabela de cenários → voto e motivo esperados |
| T2.4 | Risco: stop/alvo por ATR, tamanho de posição por risco, tetos de exposição | Contrato: casos de borda (saldo pequeno, ATR zero) |
| T2.5 | Corretora simulada em decimal: taxa, slippage, ordem limitada com expiração, stop antes de alvo | Testes da T2.1 verdes |
| T2.6 | Métricas: retorno, anualizado, comprar e segurar, drawdown e duração, Sharpe, Sortino, acerto, profit factor, exposição, taxas | Contrato com série conhecida calculada à mão |

## Fase 3 — Backtest e walk-forward

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T3.1 | Migrations `strategies`, `strategy_versions`, `runs`, `signals`, `orders`, `fills`, `positions`, `equity_points` | `make migration-test` verde |
| T3.2 | Use case de backtest em `worker_thread`, gravando operações e métricas | RNF01: 2 anos em `1h` < 5 s; determinismo |
| T3.3 | Walk-forward com grade limitada, progresso e alerta de overfitting | Contrato: série sintética com overfitting conhecido dispara o alerta |
| T3.4 | Rotas REST da §6 do plano (exceto stream), OpenAPI e Scalar | Contrato por rota + **contrato negativo entre usuários por rota** + teste de que toda rota está no OpenAPI |
| T3.5 | Estratégia de exemplo "Placar clássico" copiada para cada usuário novo (editável, `is_example`) | Usuário novo recebe a cópia uma vez só |
| T3.6 | Fila de backtest/walk-forward com teto por usuário | Contrato: segundo walk-forward do mesmo usuário espera; o de outro usuário roda |

## Fase 4 — Simulação ao vivo e alertas

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T4.1 | Worker avalia simulações ativas no candle fechado, retomando de `last_candle_time` | Integração: reinício no meio não duplica operação |
| T4.2 | Teste de paridade backtest × ao vivo reproduzido | Mesmas operações, uma a uma |
| T4.3 | Sobrevivência do saldo: piso e dobro, com tempo até cada um | Contrato |
| T4.4 | `LISTEN/NOTIFY` → WebSocket `/v1/stream`, autenticado e filtrado pelo dono | Integração: sinal chega ao dono em < 10 s; outro usuário conectado não recebe |
| T4.5 | Alerta no Telegram para o chat vinculado do dono, com motivo, stop, alvo e acerto histórico; sem repetição por candle | Contrato com servidor HTTP falso; token e chat nunca aparecem em log |
| T4.6 | Exportação CSV do registro | Contrato: colunas e decimais |

## Fase 4b — Metas

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T4b.1 | `evaluateGoal` no motor: janelas, saída no alvo e na perda máxima, taxa de chegada, de stop e tempo típico, régua de comprar e segurar | Contrato com série sintética de resultado conhecido; determinismo |
| T4b.2 | Próximo gatilho por família (distância ao limiar) | Contrato por família, comprado e aguardando |
| T4b.3 | Migration `goals` + rotas `/v1/goals*` com cache e contrato negativo entre usuários | Contrato por rota; avaliação < 1 s com 5 pares |
| T4b.4 | Simulação com meta no worker: encerra no alvo, no stop ou no prazo e alerta o dono | Integração: os três desfechos |
| T4b.5 | Plano de operação: preço de compra calculado por família (cruzamento de médias, rompimento, RSI), alvo e stop com taxas, data limite | Contrato: o preço calculado, aplicado como próximo fechamento, dispara exatamente a regra |
| T4b.6 | Migration `price_alerts` (dono, par, direção, valor, origem, ligado, disparado_em) + rotas + contrato negativo | Contrato por rota; teto por usuário |
| T4b.7 | Stream de ticker no worker avalia alertas ligados por par e notifica uma vez | Integração: cruzar o valor dispara uma vez; religar rearma |
| T4b.8 | Migration `user_assets` (dono, par, quantidade, preço médio) + rotas + recálculo do preço médio + regra do dia por ativo | Contrato: preço médio ponderado; B não vê ativos de A; entra no export e na exclusão de conta |

## Fase 5 — Painel

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T5.1 | App React 19 + Vite PWA, layout, tema claro/escuro, aviso permanente de simulação, login pelo Keycloak (PKCE) e sessão | Build verde; aviso presente em todas as rotas; rota sem sessão leva ao login |
| T5.1b | Tela de conta: preferências, vínculo do Telegram, exportar e apagar conta | E2E |
| T5.2 | Visão geral (referência: `docs/preview/dashboard.html`) | Smoke Playwright com dados de seed |
| T5.3 | Backtests: criar, listar, comparar versões | E2E |
| T5.4 | Estratégias: editar parâmetros gera versão nova | E2E |
| T5.5 | Alertas: histórico e tempo real | E2E com WS |
| T5.6 | Tela Nova meta e cartão de meta ativa no painel; lista de moedas com situação e próximo gatilho (referência: preview) | E2E: declarar meta → ranking → simular → cartão no painel |
| T5.7 | Plano de operação com gráfico, quadro de alertas de preço e quadro Seus ativos (referência: preview) | E2E: Avisar no plano cria alerta; cadastrar ativo mostra valor, regra e alvo/stop |

## Fase 6 — Revisão e fechamento

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T6.1 | Revisão de design e usabilidade: tela real lado a lado com o preview aprovado, celular e desktop | Prints em `evidence.md` |
| T6.2 | Auditoria final: N+1, logs sem segredo, input validado, sem stack trace em 500 | Checklist em `evidence.md` |
| T6.3 | Rodar a simulação ao vivo 72 h (critério de aceite 4 da spec) | Relatório em `evidence.md` |
| T6.4 | 🛑 **Gate humano**: responsável pelo produto revisa o walk-forward e a pendência regulatória da spec, e registra se a spec 002 começa | Decisão registrada pelo responsável |

## Prompt de execução

Uma fase por execução do autopilot, aberta numa sessão do Claude Code com cwd em
`~/Documents/personal/crypto-paper-trader`. Ao fim de cada fase o autopilot para; o responsável
valida e roda o prompt da próxima, trocando `<FASE>` e a linha de modelos pela linha da tabela.

| Fase | `<FASE>` | Linha de modelos |
|---|---|---|
| 0 | `Fase 0 — Fundação` (inclui T0.0) | `T0.0–T0.4 → executor model=haiku` |
| 0b | `Fase 0b — Contas e login` | `T0.5 🧠 → opus, validado por architect antes de implementar · T0.6–T0.9 → executor model=sonnet` |
| 1 | `Fase 1 — Dados de mercado` | `todas → executor model=sonnet` |
| 2 | `Fase 2 — Motor` | `T2.1 🧠 → opus, validado por architect · T2.2–T2.6 → executor model=sonnet` |
| 3 | `Fase 3 — Backtest e walk-forward` | `todas → executor model=sonnet` |
| 4 | `Fase 4 — Simulação ao vivo e alertas` | `todas → executor model=sonnet` |
| 4b | `Fase 4b — Metas` | `todas → executor model=sonnet` |
| 5 | `Fase 5 — Painel` | `todas → executor model=sonnet; T5.6 e T5.7 comparam com docs/preview/dashboard.html` |
| 6 | `Fase 6 — Revisão e fechamento` | `T6.1–T6.3 → executor model=sonnet · revisão → code-reviewer model=sonnet e security-reviewer · T6.4 é humana` |

T0.0 (só na Fase 0): `git init`, `.gitignore` (node_modules, .env*, envs/*.local, .omc/), commit
inicial só com a documentação existente.

```text
/oh-my-claudecode:autopilot Execute SOMENTE a <FASE> da spec specs/001-simulador-e-sinais/ no
repositório ~/Documents/personal/crypto-paper-trader. Antes de tocar em código leia CLAUDE.md,
docs/spec/constitution.md, spec.md, plan.md, tasks.md e evidence.md, e confira em git log e
evidence.md quais tasks já fecharam.
Uma task por vez, na ordem do tasks.md. Modelos: <LINHA DE MODELOS>. Delegue cada task ao subagente
indicado com o model= da linha; você só orquestra, confere e registra.
Cada task fecha com: teste de contrato escrito antes da implementação, bun run typecheck, bun run
lint, os testes da área (e make migration-test quando houver migration), commit isolado com
caminhos explícitos, e uma linha em evidence.md com comando, contagem de testes e hash do commit.
Confira o git log antes de registrar: relatório de subagente não é evidência.
Escalada: gate falhou 2x no mesmo modelo → refaça com o próximo (haiku→sonnet→opus) e registre a
escalada em evidence.md.
Proibido para você e para os subagentes: git reset, git commit --amend, git stash, push, deploy,
criar conta ou chave em corretora, enviar ordem de compra ou venda.
Pare e pergunte antes de: migration destrutiva, dependência fora das listadas no plan.md, qualquer
[NEEDS CLARIFICATION], decisão que contrarie a constituição.
Ao terminar a fase: rode o gate completo (make check), escreva em evidence.md o resumo da fase
(tasks fechadas, testes, pendências) e PARE. Não comece a fase seguinte.
```
