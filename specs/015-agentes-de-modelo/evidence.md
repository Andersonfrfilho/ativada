# Evidência — Spec 015

## Fase 0

### T0.1 — Conferência na documentação oficial (2026-10-17)

| Fato | Fonte (URL) | Data | Observação |
|---|---|---|---|
| Id do Haiku 5.5 = `claude-haiku-5-5`; Sonnet 5.5 = `claude-sonnet-5-5` | https://platform.claude.com/docs/en/about-claude/models/overview | 2026-10-17 | Confirmado. O id segue configurável por env (sem padrão no código) |
| Preço Sonnet 5.5 US$ 2 / 10; Haiku 5.5 "a partir de" US$ 0,10 / 0,50 por MTok | mesma página | 2026-10-17 | Bate com o spec §8. O "a partir de" indica faixa por contexto; o preço real fica no env |
| Campo de raciocínio do Gemini no REST `generateContent`: `generationConfig.thinkingConfig.thinkingLevel` (`low`/`medium`/`high`; o 3.1 Pro não aceita `minimal` e não desliga) | resumo de busca sobre https://ai.google.dev/gemini-api/docs/gemini-3 e /docs/generate-content/thinking | 2026-10-17 | **Parcial:** a página `api/generate-content` veio truncada no fetch e não mostrou o `GenerationConfig`; o nome saiu do resumo da busca sobre as páginas oficiais. O adaptador lê o nível do env e o fixture falso copia essa forma; confirmar no teste manual T5.2 (um 400 `bad_request` revela divergência) |
| `responseMimeType` + `responseSchema` em `generationConfig` | https://ai.google.dev/api/generate-content | 2026-10-17 | Confirmado (exemplos camelCase). O esquema aceita `type`, `properties`, `required`, `enum`, `minimum`, `maximum`, `additionalProperties`; `maxLength` NÃO consta (https://ai.google.dev/gemini-api/docs/structured-output) |
| `usageMetadata`: `promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, `totalTokenCount` | https://ai.google.dev/api/generate-content | 2026-10-17 | Confirmado; `totalTokenCount` = prompt + ferramenta + raciocínio + candidatos |
| `gemini-3.1-pro-preview` aceita `low/medium/high`, padrão `high`, sem desligar | https://ai.google.dev/gemini-api/docs/thinking | 2026-10-17 | Confirmado; o id continua só por env (preview) |
| `generateContent` aparece como "Legacy"; a API nova é `interactions` (`generation_config.thinking_level`, `usage.total_thought_tokens`) | https://ai.google.dev/gemini-api/docs/thinking | 2026-10-17 | Risco registrado: se o Google desligar `generateContent`, o adaptador troca de endpoint atrás da mesma porta (RF01) |
| Próxima migration livre = `0027` | `packages/database/drizzle/` (última `0026_candles_display_timeframes`) | 2026-10-17 | Conferido |
| `worker_heartbeats`: PK `instance_id` varchar, `started_at`, `last_beat_at`, `version` | `packages/database/src/schema/worker-heartbeats.schema.ts` | 2026-10-17 | A coluna `model_agents jsonb NULL` do plan D6 se aplica sem ajuste |
| `users.id` é `uuid` PK | `packages/database/src/schema/users.schema.ts` | 2026-10-17 | A FK do plan D6 está correta |

Divergências com o plan, corrigidas nele: id do Haiku 5.5 e campo/limites do Gemini. Nenhuma outra.

### T0.2 — Adendo ao ADR 0002 (2026-10-17)

Seção "Agentes de modelo (spec 015)" em `docs/adr/0002-contrato-do-motor-de-estrategias.md` (M1 a M11), copiada do plan D2 a D9
e dos RF05 a RF16; nenhuma decisão nova. Pendência: revisão do adendo por `architect` (opus) não rodou nesta sessão.

## Fase 1 — Domínio puro (`packages/model-agents`)

Gates no WSL, espelho próprio `~/gates/ativada-spec15`.

### T1.1 — Pacote, catálogo, esquemas e resultado da porta (2026-10-17)

- Pacote `@ativada/model-agents` (workspace, `zod` 4.6.5 exato como o motor, sem dependência nova de fora; `bun.lock` ganhou só a entrada do pacote).
- `model-agent-catalog.constant.ts`, `model-opinion.schema.ts`, `prompt-input.schema.ts`, `model-call-result.types.ts`.
- Testes: `test/model-agents-schemas.contract.test.ts` (bordas 0/100, 160/161, chave a mais, `userId` e outras chaves recusadas) e `test/model-agents-boundary.contract.test.ts` (só `zod`, `node:crypto` e os dois pacotes da casa; sem relógio, I/O, `console`, `as`, `export default` nem regex com lookahead; sondas).
- Gates: `bun run typecheck` OK; `bun run lint` OK; `bun run format:check` OK; 33 testes passam (2 arquivos).

### T1.2 — Prompt, higiene do motivo e frases da tela (2026-10-17)

- `prompt-template.ts` (`prompt-1`, `renderPrompt`, `hashPrompt` SHA-256 via `node:crypto`, bloco de dados em ordem fixa de chaves), `prompt-privacy.ts` (varredura de UUID, `@`, palavras sensíveis e chave fora da lista), `reason-hygiene.ts` (RF08), `model-agents-messages.ts` (catálogo fechado, RF17/RNF07) e `provider-state.constant.ts`.
- Decisões de borda, sem mudar o spec: motivo que fica vazio depois da limpeza (só controle) vira a frase fixa; a busca da palavra proibida roda no texto limpo inteiro, antes do corte de 160; quebra de linha e tabulação viram espaço, os demais controles somem; `renderPrompt` lança se a entrada tiver chave de fora.
- Testes: `test/model-agents-prompt.contract.test.ts` (prompt dourado literal, hash `717b3563...027d` conferido contra `node:crypto`, ordem de chaves, privacidade) e `test/model-agents-hygiene.contract.test.ts` (cada palavra proibida, controle, corte, par substituto, varredura das frases da tela).
- Gates: typecheck OK; lint OK; format:check OK; 72 testes passam (4 arquivos do pacote).

## Revisão 2 do desenho (2026-10-17): equipes de modelo

O usuário corrigiu o desenho: cada I.A. (Gemini, Claude, OpenAI) é uma EQUIPE que indica compras e vendas e participa da
simulação com carteira fictícia própria. `spec.md`, `plan.md` e `tasks.md` foram reescritos; as Fases 0 e 1 da revisão 1
(commits `6dd45ff`, `184a6de`, `a11fd1a`) ficam como base e são retrabalhadas pelas tasks T0.1b, T0.2b, T1.1b a T1.5. O
código de custo, teto e circuito (T1.3) está no working tree sem commit, esperando a T1.3b. Nada de banco, API, worker ou
painel foi tocado.

### T0.1b — Fatos da OpenAI e do motor (2026-10-17)

| Fato | Fonte (URL) | Data | Observação |
|---|---|---|---|
| Responses API: `text.format = { type: "json_schema", name, strict: true, schema }` | https://developers.openai.com/api/docs/guides/structured-outputs | 2026-10-17 | Confirmado |
| Esquema estrito: todos os campos em `required`; `additionalProperties: false` em todo objeto; `enum`, `minimum`, `maximum` e união com `null` aceitos; `minLength`/`maxLength` NÃO aceitos | mesma página (seção de esquemas aceitos) | 2026-10-17 | Confirmado; limites de texto valem no Zod da casa |
| Recusa = item de conteúdo `{ type: "refusal", refusal }`, que não segue o esquema | mesma página | 2026-10-17 | Mapeia para `refused` |
| Raciocínio: `reasoning.effort` (Responses) / `reasoning_effort` (Chat Completions); valores variam por modelo (`gpt-6-astra` recusa `none`; `gpt-6.1-sol` não aceita `none` nem `minimal`, padrão `medium`) | https://developers.openai.com/api/docs/guides/reasoning e /api/docs/models | 2026-10-17 | Nível por env; recusa do modelo vira `bad_request` |
| Tokens de raciocínio em `usage.output_tokens_details.reasoning_tokens`, cobrados como saída; `max_output_tokens` INCLUI o raciocínio; estouro = `status: incomplete`, `incomplete_details.reason = max_output_tokens` | mesma página | 2026-10-17 | `incomplete` = `invalid_output` |
| Modelos e preços (US$ por 1M, entrada / saída, ≤ 272k): `gpt-6-astra` 10/50, `gpt-6.1-sol` 2/10, `gpt-6-sol` 2/10, `gpt-6-luna` 0,10/0,50, `gpt-5.6-sol` 4/20, `gpt-5.6-terra` 2/12, `gpt-5.4` 2,50/15 | https://developers.openai.com/api/docs/pricing e /api/docs/models | 2026-10-17 | A página não rotula mini/nano; id e preço ficam no env, nenhum id presumido |
| Gemini 3.1 Pro Preview: US$ 2 / 12 (≤ 200k), "incluindo tokens de raciocínio" | https://ai.google.dev/gemini-api/docs/pricing | 2026-10-17 | Confirmado |
| Stop e alvo da posição vêm da configuração de risco da estratégia, não do sinal; comandos externos só `halt`/`resume`/`exit_position`; `STRATEGY_FAMILY` fechado; `STRATEGY_RULES_SCHEMA` `min(1)`; `walletStep` avulso confere `configHash` | `packages/strategy-engine/src/{wallet,engine-vocabulary.constant.ts,strategy-rule.schema.ts}` e `packages/risk-analyst/src/analyst-commands.ts` | 2026-10-17 | Base do plan D9: sem mudança de motor na opção A; níveis do modelo comandando a ordem = mudança de motor (opção B, Fase 7) |
| Endpoint e cabeçalho da OpenAI: `POST /v1/responses`, `Authorization: Bearer` | página de structured outputs/reasoning (exemplos) | 2026-10-17 | Cabeçalho confirmado pelo padrão da API; o falso de teste copia a forma, e o teste manual T6.2 revela divergência |

### Pendências da revisão 2

- Validação do plan D9 por `architect` (opus): não rodou nesta sessão; é pré-requisito da T3.1.
- Autorizações pendentes (spec §9): migration `0027_model_teams`; mudança de API e de worker (D9); mudança de motor (só opção B).
- O `spec.md` §8 recalcula o custo: 3 equipes ≈ US$ 138,82/mês a 15 min e ≈ US$ 34,70/mês a 60 min por par (tetos padrão propostos: US$ 6/dia e US$ 150/mês).

### T0.1b e T0.2b — Fatos da OpenAI e adendo do ADR (2026-10-17)

- T0.1b: a tabela de fatos da OpenAI e do motor já está acima ("Revisão 2 do desenho", commit `4f301f2`).
- T0.2b: a seção "Agentes de modelo (spec 015)" do ADR 0002 foi substituída por "Equipes de modelo (spec 015)" (M1 a M12: decisão gravada como entrada, execução em `t + 1`, DT1 a DT12 e a opção A × B). Nenhuma decisão fora do plan. Pendente: validação do D9 por `architect` (opus), pré-requisito da T3.1.

### T1.1b — Equipes, relatório e coerência dos preços (2026-10-17)

- Catálogo `nina` (Google), `lucas` (Anthropic), `olivia` (OpenAI), papéis `trend`/`risk`/`decision` (`model-team-catalog.constant.ts`); `team-report.schema.ts` (`strictObject`, três preços sempre presentes e nulos quando não se aplicam, a forma do esquema estrito da OpenAI); `team-levels.ts` (`stop < entrada < alvo`, entrada a no máximo X% do fechamento, proteção a no mínimo Y% da entrada, bordas inclusivas, decimal exato); `team-prompt-input.schema.ts`; `model-call-result.types.ts` com `team` e `report`.
- Renomeações nos arquivos da T1.2 (agente → equipe) só para compilar; a mudança de comportamento é a T1.2b.
- Testes: `model-agents-schemas.contract.test.ts` (bordas 0/100, 160/161 nos três textos, chave a mais em todo nível, preço nulo em `sell`/`hold` e obrigatório em `buy`, bordas exatas da tolerância e da proteção, `userId`/`position` recusados), fronteira.
- Gates: typecheck OK; lint OK; format:check OK; 84 testes passam (4 arquivos).

### T1.2b — Prompt `team-prompt-1`, higiene dos três textos e frases da equipe (2026-10-17)

- `prompt-template.ts` (`team-prompt-1`, instrução da equipe de três papéis, hash `2f207d45...b368` conferido contra `node:crypto`), `reason-hygiene.ts` (`sanitizeReport` limpa tendência, risco e gestor e acusa os papéis escondidos), `model-agents-messages.ts` (selos comprar/vender/esperar/pensando/desligada, estados do provedor, `TEAM_NOTICE`, `DUEL_NOTICE`, motivos "equipe sem leitura", "ignorada: já comprada" e "ignorada: sem posição").
- Removidos os textos do modo sombra e do governar (não existem mais na revisão 2).
- A varredura de linguagem das frases da tela usa as quatro palavras do RNF07; a lista de sete palavras vale só para o texto livre do modelo (a frase fixa da equipe diz "compra, venda ou espera").
- Gates: typecheck OK; lint OK; format:check OK; 88 testes passam (4 arquivos).

### T1.3b — Custo, teto e circuito (2026-10-17)

- `model-cost.ts` (custo e reserva em decimal, para cima a 8 casas, raciocínio cobrado como saída), `budget-policy.ts` (teto do dia e do mês em decimal exato, igual ao teto ainda cabe), `provider-circuit.ts` (máquina de estados com relógio por parâmetro; 3 falhas abrem 10 min, uma prova por vez, 429 com teto de 15 min, chave recusada e modelo inexistente 1 h, resposta do provedor fecha).
- Contas da spec §8 conferidas por teste: Nina 0,0214, Lucas 0,0109, Olívia 0,0159 por chamada (0,0482 juntas, US$ 4,6272 por dia, US$ 138,816 por mês a 15 min); Nina em raciocínio alto 0,0478; Haiku 5.5 0,000545 e GPT-6 Luna 0,000795.
- Decisão de borda, sem mudar o spec: `refused` e `bad_request` fecham o circuito como `ok` e `invalid_output` (o provedor respondeu).
- Gates: typecheck OK; lint OK; format:check OK; 48 testes passam (3 arquivos: custo/teto, circuito, fronteira).

### T1.4 — Tradução da decisão gravada em sinal (`team-signal.ts`) (2026-10-17)

- `toTeamSignal({ record, hasPosition, candleOpenTime })`: função pura, tipos próprios do pacote (não importa o motor). Matriz do plan D9: compra sem posição → BUY (+100); venda com posição → SELL (−100); compra com posição → HOLD "ignorada: já comprada"; venda sem posição → HOLD "ignorada: sem posição"; espera → HOLD com o motivo do gestor; sem linha, pendente, falha ou pulo → HOLD "equipe sem leitura" com o código da falha. O sinal leva o id da linha gravada e os níveis da equipe (opção A: exibidos e medidos).
- Testes: `test/model-agents-team-signal.contract.test.ts` (matriz completa, quatro casos sem leitura com e sem posição, a vela do sinal é a de decisão, determinismo byte a byte, entrada não alterada).
- Gates: typecheck OK; lint OK; format:check OK; 22 testes passam (sinal e fronteira).

### T1.5 — Auditor de acertos, oráculo `bigint` e mutantes (2026-10-17)

- `opinion-auditor.ts`: `auditOpinions({ readings, windowStartMilliseconds })`. Conta só `scheduled`, `decided`, com `buy`/`sell`, dentro da janela (início inclusivo); `buy` acerta se a vela seguinte fechou acima, `sell` se fechou abaixo; empate e lacuna à parte; taxa truncada a 4 casas; veredito e limites só por `judgeAgainstCoinFlip` (`@ativada/statistics`); confiança média quando acertou × quando errou, à parte, truncada a 2 casas e fora do veredito.
- Oráculo independente em `test/fixtures/model-agents/auditor-oracle.fixture.ts` (só `bigint`, sem importar o `src`): o veredito bate em TODAS as contagens de 0 a 120 e em 2.000 cenários sorteados (contagens, empates, lacunas, janela, avulsos, falhas e confiança). Bordas: 29 contadas = poucas; 30 com 21 acertos = acima; 20 = igual; 10 = igual; 9 = abaixo.
- Mutantes (`test/model-agents-mutants.contract.test.ts`): 41 mutantes do pacote (auditor 9, sinal 6, preços 6, higiene e esquema 6, dinheiro 6, circuito 7), cada um numa cópia de `packages/model-agents/src` julgada pelos 7 contratos do pacote. Na primeira rodada 4 sobreviveram (taxa arredondada para cima, empate contado como acerto, e igualdade entre proteção/entrada e entrada/alvo, esta última por um teste que falhava por outro motivo); corrigidos com testes novos. Resultado final: o controle passa e os 41 morrem.
- Gates: typecheck OK; lint OK; format:check OK; 201 testes passam (9 arquivos do pacote, incluindo fronteira e mutantes) e mais 60 contratos de fronteira e tamanho do repo.

## Fase 2 — Banco, adaptadores e despachante (worker)

Autorização do usuário (mensagem na thread, 2026-10-17): migration aditiva `0027_model_teams`, API e worker; padrões: opinião a cada 60 min
(`MODEL_TEAM_CADENCE_MINUTES`, configurável) e teto diário de US$ 2 (mensal proporcional: US$ 50). Não autorizados: opção B (motor),
chaves reais, rede a provedor real, `git push`. Gates no WSL, espelho `~/gates/ativada-spec15`, Postgres embutido próprio (porta 56465).

### T2.1 — Migration `0027_model_teams`, repositórios e registro LGPD (2026-10-17)

- `0027_model_teams.sql` (gerada pelo `drizzle-kit`, com snapshot e journal) e `.rollback.sql`: `model_team_reports` (pública, sem `user_id`),
  `user_model_teams` (PK `(user_id, team_key)`), `team_run_inputs` (PK `(run_id, candle_time)`, FK composta `(run_id, user_id)` para `runs`,
  `report_id` NULL com FK `RESTRICT` para o relatório, `failure_code`, `applied_action`; ajuste do architect) e a coluna
  `worker_heartbeats.model_teams jsonb`. Sem ENUM nativo; CHECKs de chaves, estados, `buy` (`stop < entrada < alvo`), coerência de `decided` e
  código de falha. O rollback ABORTA (`restrict_violation`) enquanto existir execução com `signalSource` de equipe.
- Repositórios em `packages/database/src/model-teams/`: `team-report.repository.ts` (enfileirar em transação curta própria, idempotente pela
  chave única parcial e só com dono ativo que ligou a equipe e simulação `live_paper` rodando no par, na grade do ritmo; reivindicar com
  arrendamento e `SKIP LOCKED`, 2 tentativas e `ATTEMPTS_EXHAUSTED`; reserva do teto sob `pg_advisory_xact_lock` com a soma exata do dia e do
  mês UTC; `finish` zera a reserva; leituras públicas do analista; expiração que não apaga relatório referenciado) e
  `user-model-team.repository.ts` (`OwnerScope`).
- Registro: `team_run_inputs` e `user_model_teams` em `OWNED_TABLES`, exportação (`model-team-export-steps.ts`) e ordem de exclusão (a entrada
  gravada antes de `runs`); `model_team_reports` em `UNOWNED_PUBLIC_TABLES`. Tarefa `expire-model-team-reports` no cron (365 dias).
- Proposta (não presumida, para a Fase 3): uma marca para esconder a estratégia `model-team-1` da lista e fora de `STRATEGY_MAX_PER_USER`
  (coluna ou regra por hash). Nenhuma coluna foi criada para isso na 0027.
- Gates: typecheck OK; lint OK; format:check OK; `migration-test` (embutido, 28 migrations aplicadas e desfeitas); `database-test` OK, incluindo
  as checagens novas (`model-team-checks.ts`: enfileirar idempotente e por ritmo, reivindicação concorrente sem repetir, arrendamento e tentativas,
  teto sob trava com duas reservas simultâneas, CHECK dos preços, leituras públicas, interruptor preso ao dono, guarda do rollback) e as de
  exportação/purga LGPD com as duas tabelas novas (`checkPersistenceExport`/`checkPersistencePurge`). `make lgpd-test` (precisa de Docker no WSL)
  não rodou; a cobertura LGPD veio do `database-test`.

### Ajustes do architect ao D9 (2026-10-17)

O `architect` (opus) aprovou a opção A com ajustes, aplicados em `plan.md` (D2, D6, D9, D12 e tabela de peças) e no ADR 0002 (M4, M10):
`team_run_inputs` na 0027; enfileirar em transação curta própria; esperar a decisão = `AWAITING_TEAM`, sem commit e sem dormir, com prazo
pelo `clock_timestamp()` do banco; replay lê `team_run_inputs`; o passo de equipe usa o `signalStep` da `model-team-1` e troca
`action`/`score`/`votes`/`reason`; sem export novo no `run-recording` nem mudança de motor; `goalId` e analista proibidos com `signalSource`;
a marca para esconder a `model-team-1` fica como PROPOSTA para a Fase 3.

### T2.2 — Ambiente, porta e adaptadores dos três provedores (2026-10-17)

- Ambiente do worker (`model-teams/model-team-environment.ts`): chaves opcionais (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`) em
  `secretVariables`; os três `*_BASE_URL` exigem https em produção; chave presente exige id do modelo e os dois preços (sem padrão no código);
  qualquer chave exige os tetos diário e mensal, com o diário ≤ mensal; padrões: ritmo 60 min (autorização do usuário), tempo-limite 30 s, saída 900,
  concorrência 3, consulta 2 s, prazo 45 s, raciocínio `low`. Mensagens de erro citam só o NOME da variável. A variável da API
  (`MODEL_TEAM_ON_DEMAND_PER_USER_PER_DAY`) fica para a Fase 4. Exemplo comentado em `envs/env.dev`, sem chave.
- Porta `ModelProviderPort` (`model-provider.port.ts`, `completeCall` valida a saída pelo Zod da casa) e `provider-http.ts` (`fetch` direto,
  `redirect: 'error'`, tempo-limite, o erro do `fetch` é engolido e vira `timeout`/`unavailable`; 429 com `Retry-After`; 401/403, 404, 5xx e 408, outros 4xx).
- Adaptadores `anthropic-provider.ts` (ferramenta forçada, temperatura 0), `gemini-provider.ts` (`responseSchema` em maiúsculas com `nullable`,
  `thinkingLevel`) e `openai-provider.ts` (Responses API, `text.format` estrito, `reasoning.effort`, `store: false`, `max_output_tokens` somado ao
  teto de raciocínio; o raciocínio sai de `output_tokens` para não ser cobrado duas vezes). Recusa e `incomplete`/`MAX_TOKENS`/`max_tokens` mapeados.
- Provedores falsos locais em `packages/model-agents/test-support/` (`Bun.serve` em 127.0.0.1, porta 0; conferem chave e id do modelo; comportamentos:
  relatório, saída inválida, recusa, truncado, status com `Retry-After`, travado e redirecionamento). Nenhuma chamada de rede real.
- Testes: `test/model-team-adapters.contract.test.ts` (cada código do RF01 contra cada falso; redirecionamento falha; servidor fora do ar; forma do
  pedido de cada provedor; esquema estrito sem `maxLength`; a chave sentinela `sk-test-SENTINEL` só no cabeçalho e ausente de TODO resultado, dos três
  adaptadores) e `test/worker-model-team-environment.contract.test.ts` (boot sem chave, chave sem id/preço/tetos, faixas, produção).
- Pendência de confirmação real (T6.2, com o usuário): o formato do `responseSchema` do Gemini (`nullable`, tipos em maiúsculas), o campo
  `thinkingLevel` e o cabeçalho/endpoint da OpenAI vêm da documentação; um `bad_request` no teste real revelaria divergência.
- Gates: typecheck OK; lint OK; format:check OK; os testes novos e os de ambiente do worker passam.

### T2.3 — Enfileirador, despachante, estado do provedor e ligação no worker, em modo sombra (2026-10-17)

- `apps/worker-ativada/src/model-teams/`: `report-scheduler.ts` (enfileira a última vela de 15 min FECHADA e GRAVADA de cada par, numa transação curta
  PRÓPRIA no início do ciclo; ajuste do architect: fora da transação do passo ao vivo), `report-dispatcher.ts` (reivindica até `MODEL_TEAM_CONCURRENCY`
  linhas com arrendamento e `SKIP LOCKED`; cada linha roda isolada com `allSettled`), `report-processor.ts` + `report-input.ts` + `report-decision.ts` +
  `report-outcome.ts` (STALE, chave, entrada pública das 48 velas + leituras do analista + Fear & Greed, varredura de privacidade do prompt, reserva do
  teto sob trava, circuito, chamada, coerência dos preços, higiene dos três textos, custo pelos tokens), `team-circuits.ts` (circuito por equipe em memória e
  "parado pelo teto"), `provider-status.ts` (resumo só com booleanos, estado e instante, gravado em `worker_heartbeats.model_teams`),
  `model-team-loop.ts` (laço próprio, com a guarda de queda do banco) e `create-model-teams-wiring.ts` (sem chave nenhuma nada sobe e nenhuma chamada sai).
- A permissão do circuito é pedida por último, depois da reserva: o estado meio aberto libera UMA prova e ela precisa chamar de fato. Uma reserva de linha
  pulada por circuito é zerada pelo `finish`.
- **Modo sombra:** nenhuma execução depende das equipes e nenhuma ordem sai. O passo ao vivo (`apps/worker-ativada/src/live/`) NÃO foi alterado
  (`git diff` vazio nessa pasta), então as execuções de regra são idênticas com e sem equipes por construção; o `live-step.ts` não ganhou a chamada
  de enfileirar que o plano original previa. O `main.ts` só liga o laço, passa o resumo ao batimento e dispara o ciclo quando uma vela é gravada.
- Testes: `test/model-team-dispatcher.contract.test.ts` (15: caminho feliz com custo à mão, prompt sem dado de usuário nem chave, palavra proibida
  trocada, preços incoerentes, `hold`, STALE, avulso sem idade, NO_KEY, teto, circuito abrindo na 3ª falha e pulando na 4ª sem chamar, cada código de
  falha com e sem tokens, erro numa linha sem derrubar as outras, enfileirador, resumo do batimento) e, no `database-test` da T2.1, a idempotência do
  enfileirar, a reivindicação concorrente, o arrendamento e o teto com duas reservas simultâneas sob a trava.
- Gates: typecheck OK; lint OK; format:check OK; testes novos e de batimento passam.

### T2.4 — `make model-teams-test` (2026-10-17)

- `scripts/model-teams-test.ts` (+ `scripts/model-teams-test/`): Postgres de teste descartável (banco temporário), migrations, a Binance falsa existente
  (só para o worker subir), TRÊS provedores falsos locais (`Bun.serve` em 127.0.0.1) e o worker REAL em subprocesso (`apps/worker-ativada/src/main.ts`), com
  as chaves `sk-test-SENTINEL-*`. Uma simulação `live_paper` rodando no par e as três equipes ligadas pelo dono (a execução é marcada como de outro worker,
  para o avaliador do worker de teste não a reivindicar; o teste é do despachante, não do motor). Alvo novo no `Makefile` com o mesmo `trap` de `down --volumes`
  dos outros alvos de teste.
- Cenários e resultado (rodado no WSL contra o Postgres embutido próprio, porta 56465, sem Docker; o alvo `make` usa o mesmo script):
  1. o enfileirador achou a última vela gravada e as 3 equipes decidiram UMA vez cada (3 linhas `scheduled`, uma chamada por provedor), com custo à mão
     (Lucas 0,0109; Nina e Olívia 0,0139), latência ≥ 150 ms do falso, hash do prompt, reserva zerada, batimento `ready` das 3, e a chave sentinela AUSENTE de
     todas as linhas, da saída do worker e do batimento; o pedido ao provedor sem dado de usuário;
  2. teto diário (linha de US$ 1,99999 semeada): `BUDGET_EXHAUSTED` sem nenhuma chamada a mais, batimento `budget_exhausted`, nenhuma reserva sobrando;
  3. 5xx em série: 3 falhas `UNAVAILABLE` (3 chamadas), a 4ª vela `CIRCUIT_OPEN` sem chamar o provedor, batimento `circuit_open`;
  4. 429 com `Retry-After`: `RATE_LIMITED` e a vela seguinte `CIRCUIT_OPEN`; 401: `KEY_REJECTED` e batimento `key_rejected`;
  5. SIGTERM: o worker sai com 0 dentro do orçamento.
- A volta do circuito (fechar depois dos 10 min) e o meio aberto estão provados nos testes puros do pacote (`provider-circuit`); aqui não se espera 10 min.
- Gates da Fase 2: typecheck OK; lint OK; format:check OK; `migration-test` e `database-test` OK (T2.1); contratos novos OK (T2.2 e T2.3); `model-teams-test` OK.
- Pendências: `make lgpd-test` (precisa de Docker/Keycloak no WSL; a cobertura LGPD das duas tabelas veio do `database-test`); validação do formato real dos
  provedores só na T6.2, com o usuário; API de equipes (variável `MODEL_TEAM_ON_DEMAND_PER_USER_PER_DAY` e rotas) fica para a Fase 4.

### Regressão da Fase 2 (2026-10-17)

- Suíte `bun test` sem os arquivos de mutantes (336 arquivos, 5.295 testes) no espelho próprio: 8 falhas na primeira rodada. Três eram desta fase e foram
  corrigidas: o arquivo de restrições do esquema (`model-team-report-checks.ts`, nome reservado a código de teste) virou `model-team-report-constraints.ts`;
  a lista de exportações públicas de `@ativada/database` ganhou as novas; e `test/model-agents-boundary.contract.test.ts` (da Fase 1) tinha o texto `export default`
  que o contrato do workspace varre, reescrito sem mudar a sonda.
- Pendências que NÃO são desta fase (as mesmas falham no espelho da spec 017, sem nenhuma mudança minha): 5 testes de cache por candle novo
  (`api-goal-plan`, `api-goal-evaluation`, `api-assets-summary`, `horizon-evaluation`) e `test/risk-analyst-boundary.contract.test.ts`, que contém o texto
  `export default` e reprova o contrato do workspace.
- Mutantes (`*-mutants`) não rodaram nesta fase: ela não toca o passo ao vivo nem o filtro de dono das rotas.

## Fase 3 — A equipe na simulação (worker) e API

Autorização do usuário (2026-10-17): migration 0027 (commitada), mudanças em API e worker, opinião a cada 60 min, teto de US$ 2 por dia. Não autorizados:
opção B (motor / `ENGINE_VERSION`), chaves reais, rede a provedor real, `git push`, aplicar a migration no banco de dev. Gates no WSL (espelho
`~/gates/ativada-spec15`, Postgres embutido próprio, porta 56465).

### T3.1 — Prova de viabilidade do plan D9 (2026-10-17)

- `packages/model-agents/src/model-team-strategy.ts`: a `StrategyVersion` fixa `model-team-1` (RSI de período 2, menor que o ATR de 14; sem regime; entrada a
  mercado; risco 2×ATR de stop, 3×ATR de alvo, 1% por operação), hash preso por teste: `8dad5fe7c154715ff07018b9d6fb7c9711decc25a1acbff9e858fea0585fe289`.
  Mora no pacote puro (que já depende do motor) para a API e o worker lerem a MESMA definição; `packages/strategy-engine` não foi tocado.
- `team-signal-decision.ts` (`applyTeamSignal`, `toHoldProbe`) e `team-signal-source.ts` (`readSignalSource` do `runs.request.signalSource`).
- `test/model-team-wallet-feasibility.contract.test.ts` (7 testes): `signalStep` real da `model-team-1`, decisão trocada por `toTeamSignal` (votos vazios,
  `configHash`, lacuna e ATR mantidos), `walletStep` AVULSO aceita; a compra de `t` cria a ordem em `t` e preenche na ABERTURA de `t + 1`, com stop a 2×ATR e
  alvo a 3×ATR da configuração de risco; nenhuma ordem antes da vela de decisão; a guarda ainda recusa sinal de outra versão. Resultado: a guarda ACEITA, então
  nenhum ajuste aditivo (export no `run-recording` ou relaxar `votes`) é necessário. O desenho do D9 já tinha a validação do `architect` (opus).
- Gates: typecheck, lint, format:check OK; testes do pacote (65) OK.

### T3.2 — O passo da execução de equipe no worker (2026-10-17)

- `apps/worker-ativada/src/live/`: `team-decision.ts` (a decisão da vela: replay da entrada gravada, ou o relatório agendado `(equipe, par, t, team-prompt-1, scheduled)`;
  `awaiting` enquanto `pending` ou ainda não enfileirado e dentro do prazo; fora da grade do ritmo não há o que esperar; prazo vencido, falha, `pending` vencido ou
  decisão tardia = "equipe sem leitura" com o código `MISSING`/`PENDING`/`LATE`/`NOT_SCHEDULED`/o da falha), `team-candle-step.ts` (puro: `signalStep` real da
  `model-team-1`, sonda de posição com "esperar", `toTeamSignal`, `applyTeamSignal`, `walletStep` avulso), `team-step.ts` (`stepTeamOnce`: o commit leva as linhas,
  o checkpoint e a `team_run_inputs` da vela na MESMA transação), `create-team-kit.ts` (recusa em voz alta: sem o ambiente das equipes no worker = `INVALID_RUN_DATA`,
  estratégia diferente da fixa = `HASH_MISMATCH`, antes de ler qualquer vela). `live-step.ts` ganhou UMA linha (`run.team !== undefined` desvia para o passo de
  equipe); a execução de regra não passa por nenhum arquivo novo.
- Nova saída `AWAITING_TEAM` (`LIVE_COMMIT_OUTCOME` e `LIVE_PASS_KIND`): o passo devolve SEM commit e sem dormir; a ronda seguinte (5 s) tenta de novo do mesmo
  candle; as outras execuções da mesma ronda seguem. O prazo (`MODEL_TEAM_DECISION_DEADLINE_SECONDS`) é conferido pelo `clock_timestamp()` do BANCO na mesma consulta
  que lê o relatório (`team-run-input.repository.ts`), e a decisão tardia é a que tem `decided_at` depois do prazo (nunca usada para `t`).
- A posição que a tradução vê é a de DEPOIS das execuções de `t`: uma sonda do `walletStep` com sinal "esperar" a revela (por exemplo, a posição que sai pelo stop em
  `t` não faz a compra de `t` virar "ignorada: já comprada"). Sinal `null` do aquecimento segue `null` e não procura relatório.
- Banco: `RunBatchWriter.appendTeamRunInput` (idempotente por `(execução, vela)`, preso ao dono) e `createTeamRunInputRepository` (`readStoredInput` com `OwnerScope`,
  `readReportById`, `lookupScheduledReport`). `main.ts` passa o prazo e o ritmo do ambiente ao avaliador.
- Limitação conhecida: o `walletStep` avulso confere a contiguidade com o sinal; uma lacuna CONFIRMADA durante o aquecimento (sinal `null`) faria a guarda recusar o
  candle (`CANDLE_GAP_UNCONFIRMED`, a execução falha com código tipado) em vez de seguir como no `step` composto. A lacuna depois do aquecimento ecoa a contagem e passa.
- Testes: `test/live-team-step.contract.test.ts` (17: compra e venda em `t + 1`, motivo do gestor e votos vazios, entrada gravada, compra com posição e venda sem posição
  ignoradas com o motivo, MISSING/falha/PENDING/LATE/NOT_SCHEDULED, `AWAITING_TEAM` sem commit e retomada do mesmo ponto, uma execução à espera não atrasa outra,
  aquecimento sem relatório, candle repetido pulado, recusas) sobre o banco em memória; `make database-test` com as checagens novas (busca do relatório com o prazo
  pelo relógio do banco, entrada gravada idempotente, presa ao dono, CHECK da origem).
- Gates: typecheck, lint, format:check OK; `database-test` OK; 220 testes dos arquivos de ao vivo, worker, banco e pacote OK (1 falha anterior e alheia:
  `test/risk-analyst-boundary.contract.test.ts` contém `export default`, listada na regressão da Fase 2).

### T3.3 — Prova de determinismo da execução de equipe (2026-10-17)

- **Replay byte a byte, sem provedor e sem chave** (`test/live-team-determinism.contract.test.ts`, 10 testes sobre o banco em memória): uma execução de equipe com compra, venda
  e uma falha de provedor; uma execução NOVA com as entradas gravadas copiadas e a consulta do relatório agendado PROIBIDA (lança) dá os mesmos `signals`, `orders`, `fills`,
  `positions`, `equity_points`, o mesmo estado do motor e as mesmas entradas. O relatório gravado manda: com o mundo mudado (outro relatório para a vela) o replay não muda;
  entrada que aponta para relatório que sumiu vira "sem leitura", sem derrubar a execução.
- **Retomada no meio sem duplicar**: queda dentro do passo 1, 30, 100 e 130 (hook `afterAppend`, depois da gravação das linhas e da entrada) e retomada por outra instância dão o
  mesmo resultado da execução contínua (linhas, estado, entradas, número de passos); a queda desfaz a entrada junto com o passo.
- **Execução de REGRA inalterada**: com o ambiente das equipes ligado (e a porta de equipe que lança se tocada), a execução de regra do conjunto real sai igual ao fluxo contínuo e não
  toca a equipe.
- **A posição que a tradução vê é a de depois das execuções de `t`**: a posição que sai pela proteção em `t` não faz a compra de `t` virar "ignorada: já comprada" (teste que derruba
  a proteção numa vela e confere BUY + segunda compra).
- **Contra o Postgres** (`scripts/live-test/check-team.ts`, dentro de `make live-test`; `LIVE_TEST_ONLY=team` roda só ele): o avaliador de PRODUÇÃO com o banco de verdade; compra e
  venda decididas em `t` executam em `t + 1`; MISSING e NOT_SCHEDULED gravados; o aquecimento não grava entrada; o replay a partir das entradas copiadas deixa o mesmo digest de linhas
  e o mesmo estado do motor, MESMO depois de `decided_at` dos relatórios ser empurrado 2 h (quem recalculasse trataria como "tarde"). `make model-teams-test` ganhou a mesma
  prova com o worker REAL em subprocesso (execução de equipe criada com a versão `model-team-1`, relatório decidido semeado, compra em `t + 1`, replay com 31 linhas iguais) e
  continua passando nos cenários da Fase 2 (130 velas semeadas em vez de 48).
- **Mutantes do passo** (`test/live-team-mutants.contract.test.ts`, 19 mutantes + controle, todos reprovados): caminho de regra no lugar do de equipe, entrada não gravada no passo,
  espera que grava, espera tratada como encerrada, aquecimento que pede relatório, ação aplicada sempre `hold`, entrada gravada ignorada no replay, relatório pendente ou ausente que
  nunca espera, decisão tardia aplicada, vela fora do ritmo que espera, código da falha perdido, prazo contado da abertura, relatório pedido de outra equipe, posição vista antes das
  execuções de `t`, sinal da equipe nunca aplicado, lacuna não declarada, execução com outra estratégia ou sem o ambiente aceita, `signalSource` nunca lido. `make live-mutants` (Postgres)
  ganhou 4 mutantes do adaptador do banco (entrada não gravada no passo, lida de outra execução, relatório por id que nunca acha, porta não ligada), todos reprovados contra o
  `live-test` da equipe (o controle e os mutantes de equipe rodam só ele; os 12 antigos seguem contra o `live-test` inteiro).
- Os suítes de mutantes antigos (`live-mutants`, `live-analyst-mutants`, `live-goal-mutants`) não foram reexecutados por inteiro (horas de CPU); conferi que TODA edição deles ainda se aplica
  à fonte (nenhuma ficou velha) e rodei por inteiro os contratos de ao vivo que os julgam (220 testes, todos verdes).
- Gates: typecheck, lint, format:check OK.

### T3.4 — API e banco das equipes (2026-10-17, retomada no Linux em `~/personal/ativada`)

Autorização do usuário (2026-10-17): migration, API e worker; 60 min; teto de US$ 2 por dia. Não autorizados e não usados: opção B (motor / `ENGINE_VERSION`),
chaves reais, rede a provedor real, `git push`, aplicar a migration no banco de dev. Gates num Postgres embutido próprio (`~/pg-scratch/pgctl-015b.sh`, porta 56481,
`fsync=off`); a porta 56465 do agente anterior não foi tocada.

- **Banco (commit `T3.4a`).** Migration `0028_strategies_system_flag` (aditiva, com `.rollback.sql` e snapshot): `strategies.is_system` + índice único parcial por dono.
  `ensureSystemStrategyVersion` acha ou cria a `model-team-1` do dono PELO HASH, travando o usuário numa transação. Fora da lista, da página, das rotas de estratégia e do
  teto `STRATEGY_MAX_PER_USER` (`visibleStrategies`). Repositórios novos: `claimOnDemand` (contador do dia do USUÁRIO, soma das equipes, atômico), `enqueueOnDemandReport`,
  leitura pública do par numa consulta (`model-team-read.repository.ts` + `model-team-read-sql.ts`) e as leituras do duelo presas ao dono. `migration-test` aplica e desfaz 29
  migrations; `database-test` ganhou `model-team-api-checks.ts` (4 checagens) e roda também dentro de `route-isolation-test`.
- **API (commit `T3.4b`).** `POST /v1/runs` aceita `signalSource` (só `live_paper` 15m; `strategyVersionId`, `goalId` e `analyst` juntos = 400
  `not_allowed_with_signal_source`; equipe desligada = 409 `MODEL_TEAM_DISABLED`); `GET/PATCH /v1/me/model-teams`; `GET /v1/runs/:id/model-teams` (+ `/comparison`);
  `POST /v1/runs/:id/model-teams/:teamKey/opinions` (limite diário `MODEL_TEAM_ON_DEMAND_PER_USER_PER_DAY`, política `MODEL_OPINION_REQUEST` de 5 por 10 min); `POST /v1/model-duels`
  (política de 3 por hora) e `GET /v1/model-duels/:id`. Toda rota tem `access: USER` e `documentation`; `live-status`, `projections` e `strategy-layers` desviam a execução de equipe para
  `team_run`. Refatorações só para caber no estilo (função ≤ 40, arquivo ≤ 200): `create-run-version.ts`, `create-live-aware-use-cases.ts`, `model-team-read-sql.ts`, `user-limits-environment.ts`
  recebe o shape do env das equipes.
- **Contratos** (todos verdes): `api-run-signal-source` (10), `api-run-team-run-views` (4), `api-model-teams` (16), `api-model-duels` (17), com contrato negativo entre usuários em cada rota
  (execução/duelo alheio = mesmo 404 byte a byte pelo `expectIndistinguishableNotFound`; equipe ligada de outro usuário não vale; curva de outro usuário nunca entra), 400 sem eco,
  429 de política e de teto diário, ✓/✗ da comparação contra a vela seguinte, ranking recalculado das curvas, esquema documentado conferido contra a resposta real.
- **Mutantes (commit `T3.4c`).** `make api-runs-mutants` (DB, `route-isolation-test`): 43 mutantes de filtro de dono reprovados, +7 novos (estratégia do sistema de qualquer dono, na lista, no teto;
  contador de pedido avulso de qualquer dono; execuções, curvas e operações do duelo de qualquer dono) e 3 edições antigas atualizadas para o texto novo de `strategy-page.ts`/`strategy.repository.ts`.
  `api-routes-mutants` (REST): 95 testes, CONTROL passa e os 17 mutantes novos morrem (meta/analista/versão junto de `signalSource`, equipe desligada, teto diário, rajada, duelo com uma só vaga,
  duelo que não cancela, estado do worker parado, desvios `team_run` etc.); a edição velha `USER_ID_ACCEPTED_IN_THE_RUN_BODY` foi atualizada.
- **Gates.** `typecheck`, `lint` e `format:check` (arquivos versionados; `graphify-out/` é ignorado pelo git mas não pelo prettier) OK; `migration-test` OK; `database-test` OK
  (a medição de gravação em lote oscila nesta máquina, 1,75 a 2,0 s contra a meta de 1,5 s, sem relação com esta mudança: passei a rodada completa com a meta temporariamente em 5 s e a restaurei, sem diff);
  `model-teams-test` OK (worker real, 3 provedores falsos; replay de 37 linhas); suíte `bun test` sem os arquivos de mutantes: 5.372 passam e 7 falham, TODAS alheias a esta mudança
  (as 5 de "candle novo muda a chave" de metas/prazos/ativos e `workspace contract > default export`, de `test/risk-analyst-boundary.contract.test.ts`, as mesmas da regressão da Fase 2)
  mais uma minha, `database.contract` "sem wildcard re-export", corrigida em `packages/database/src/index.ts` (lista nomeada + `export type *`) e verde. `git diff` em `packages/strategy-engine` e
  `packages/run-recording` desde o primeiro commit da spec 015: VAZIO.
- **Pendências.** (1) Aplicar a `0028` no banco de dev (o usuário). (2) `make lgpd-test` (precisa de Docker/Keycloak): a `0028` só adiciona coluna em `strategies`, que já está no registro de exportação/exclusão.
  (3) `opinionIds` do estado são ids aleatórios (uuidv7) devolvidos no `202`; a linha avulsa não guarda o dono, então quem soubesse o id de outro usuário leria aquela recomendação (dado público de mercado, sem
  posição nem saldo). Se quiser fechar isso, é uma coluna `requested_by` aditiva. (4) `make live-mutants`/`queue-mutants` não foram reexecutados (não tocam o passo ao vivo nesta task).

## Fase 5 — Painel das equipes de modelo (2026-10-17)

Autorização (usuário): tela das equipes. Não autorizados e não usados: chaves reais, rede a provedor real, `git push`, mudança de API, banco ou motor. Gates no Linux
(`~/personal/ativada`): `typecheck`, `lint`, `format:check`, `panel-test`. Verificação da UI por texto (`read_page`/`get_page_text`); uma captura só no fim.

### T5.1 — Contratos do painel e consultas (Zod espelhando as rotas)

- `apps/frontend-ativada/src/runs/model-teams/`: `model-teams.constant.ts` (catálogo fechado espelhado), `model-teams.validation.ts` (`GET /v1/me/model-teams`, `GET /v1/runs/:id/model-teams`
  e `/comparison`, `202` do pedido avulso), `model-teams.query.ts` (`useRunModelTeamsQuery` com a chave `['runs', runId, 'model-teams', <pedidos>]` e polling de 2 s SÓ com um relatório
  `pending` à vista; `409`/`404` viram "ausente", sem erro; `useMyModelTeamsQuery`, `useSetModelTeamMutation`, `useRequestOpinionMutation` que passa a acompanhar o `opinionId`).
  `src/runs/duel/duel.validation.ts` (`POST /v1/model-duels`, `GET /v1/model-duels/:id`; as curvas têm o mesmo tamanho de `candleTimes`).
- Dinheiro e preços do relatório ficam em texto decimal (`decimalText`); o contrato `model-teams-queries.contract.tsx` varre os arquivos das pastas `model-teams` e `duel` atrás de `Number(`,
  `parseFloat` e `toFixed`.
- Teste: `test/model-teams-queries.contract.tsx` (5), com `test/support/model-teams-fixtures.ts` (rotas falsas das equipes) na lista explícita do `package.json` do painel.
- Pendências de dado da API (nada mudado aqui): (1) a API não devolve o **id do modelo** (só `modelFamily`, "Gemini Pro" etc.) nem o **teto de custo** do dia/mês: a ficha mostra a família do modelo e o
  custo de hoje e do mês, sem a barra "contra o teto". Se quiser os dois na tela, é campo aditivo em `GET /v1/runs/:id/model-teams` (`modelId`, `budget { dailyUsd, monthlyUsd }`).

### T5.6 — Preferências: interruptor por equipe (feita logo depois da T5.1 para o usuário poder ligar as equipes)

- `src/account/model-teams/ModelTeamsCard.component.tsx` na página Conta (âncora `#equipes`): uma linha por equipe (Nina, Lucas, Olívia) com `role="switch"` DESLIGADO por padrão (vem de `GET /v1/me/model-teams`),
  a palavra "Ligada/Desligada", a família do modelo e a nuvem, o estado do provedor em ícone + palavra ("sem chave configurada", "parada pelo teto de custo", "provedor fora (tentando de novo às HH:MM)"...) e a
  frase de custo ("gasta API na sua instalação"). Marca por equipe sem depender de cor: borda tracejada, pontilhada ou dupla + a inicial/nome.
- `src/runs/model-teams/team-badge.ts`: o selo (ícone + palavra + tom) puro, usado também pela varanda e pela ficha.
- Glossário (RF23): `Equipe de modelo`, `Papel`, `Duelo`, `Custo estimado`, `Teto de custo`, `Pedido avulso` (uma frase de até 120 caracteres; o teste do glossário confere); o exemplo de "Em observação" deixou de citar a Clara.
- Teste: `test/model-teams-preferences.contract.tsx` (3: desligadas por padrão, estado em palavra, PATCH `{enabled}`, foco, nenhuma palavra proibida); `account.contract.tsx` ganhou a rota falsa de `GET /v1/me/model-teams`.
  O teste de tema do `account.contract` só passa depois do `theme-store.contract` (dependência de ordem que já existia; o `package.json` os lista nessa ordem).

### T5.2 — ◆ vivos na varanda e no escritório, estados por ícone + palavra e a ficha da equipe

- Os ◆ "em breve" (Nina/Lucas/Clara) saíram: `BalconyModels.component.tsx` apagado, `BALCONY_MODELS` e `MODEL_NOT_YET` removidos. No lugar, `balcony/ModelTeamChips.component.tsx` (varanda e lista de crachás do escritório) e
  `office/OfficeCorners.component.tsx` (a sala de vidro do palco decorativo), lendo `useModelTeamsView` (contexto `ModelTeamsRunProvider`, uma só consulta `GET /v1/runs/:id/model-teams`).
- Marcação diferente por equipe, sem depender de cor: losango com a INICIAL (N, L, O), moldura tracejada (Nina), pontilhada (Lucas) ou dupla (Olívia), o nome e o provedor (Gemini, Claude, OpenAI).
- Estado SEMPRE ícone + palavra (`team-badge.ts`): desligada, sem chave configurada, parada pelo teto de custo, provedor fora (tentando de novo às HH:MM no fuso do usuário), chave recusada, modelo indisponível,
  pensando (relatório `pending`), comprar/vender/esperar (última recomendação decidida), aguardando a vela. Execução que não é ao vivo (409) diz "só aparecem nas simulações ao vivo".
- Ficha (`ModelTeamSheet`): modelo (família) e onde roda ("nuvem do Google/da Anthropic/da OpenAI"), estado, última recomendação com entrada/alvo/proteção em texto decimal, os TRÊS papéis (tendência, risco, gestor)
  com o motivo (ou a frase fixa quando a higiene o ocultou), acertos de lado "N de M (X%)" com a faixa de Wilson (arredondada para fora) e "poucas previsões (menos de 30)", custo de hoje e do mês (BigInt,
  arredondado PARA CIMA em 4 casas), taxa de falha de 24 h, o rodapé "gerado por modelo … pode errar", o aviso fixo da equipe e o link "Ligar/desligar nas preferências". No celular as três fichas vão dentro de "◆ 3 equipes".
- Termos com tooltip (glossário): Equipe de modelo, Papel, Acertos de lado, Intervalo de confiança, Custo estimado, Em observação.
- Testes: `test/model-teams-room.contract.tsx` (9: estados em palavra, provedor, ficha completa, motivo ocultado, execução ao vivo ausente, selo, custo, placar, falhas); `team-balcony`/`office-stage` atualizados
  (sem "em breve"); `touch-targets` ganhou `.modelButton`, o link da ficha e o interruptor da Conta. `bun run --cwd apps/frontend-ativada test`: 1.515 passam, 0 falham (127 arquivos).

### T5.4 — "Pedir opinião agora" e o cartão "Equipes × regras"

- `model-teams/OnDemandButton.component.tsx` dentro da ficha de cada equipe (varanda, lista de crachás do escritório e a ficha do celular): `POST /v1/runs/:id/model-teams/:teamKey/opinions` → `202 { opinionId }`; o id passa a ir em
  `?opinionIds=` e o polling de 2 s liga SÓ enquanto há relatório `pending` (RF20). Desabilitado, o botão traz a frase do motivo (`aria-describedby`): equipe desligada, provedor indisponível (a palavra do estado:
  "sem chave configurada", "parada pelo teto de custo"...), simulação sem analista (`GET /analyst` → `ANALYST_NOT_ENABLED`) ou parada, ou "Aguardando a resposta da equipe…". Erros do servidor viram frase (429 limite, 409 por código).
  O resultado vem marcado "pedido avulso · não entra no placar" (Term "Pedido avulso"), nunca no placar e nunca comanda ordem.
- `model-teams/TeamComparison.component.tsx` ("Equipes × regras", `<details>` recolhido; só consulta aberto; `LiveChartArea` o põe depois da sala): uma linha por vela fechada, os 4 especialistas de regra (● a favor/contra/neutro/não
  vota), as 3 equipes (◆ comprar/vender/esperar/sem leitura/pensando), ✓ acertou / ✗ errou em palavra para leitor de tela, "↗ subiu / ↘ desceu / = igual / ainda aberta" e a frase fixa "Comparação de acerto do lado da próxima vela; não
  mede lucro e não é recomendação." Paginação por cursor ("Ver velas anteriores"); sem analista as regras dizem "sem analista".
- Testes: `test/model-teams-ondemand.contract.tsx` (6: pede e acompanha até decidir, três motivos de botão desabilitado, 429, tabela com ✓/✗ e "ainda aberta", regras nulas).

### T5.3 — Camada "Equipes ◆" no gráfico

- Botão "Equipes ◆" nas camadas do gráfico (só simulação ao vivo, na vela da execução ou em velas de exibição que a dividem), **desligado por padrão** e lembrado em `localStorage` como as outras (`chart-preferences.ts` ganhou `teams`).
  Dados: `GET /v1/runs/:id/model-teams/comparison` (uma plaquinha por equipe e vela decidida) e `GET /v1/runs/:id/model-teams` (preços das últimas recomendações). Nada é consultado com a camada desligada.
- `candle-chart/team-layer.ts` (puro): **plaquinha** "◆N ↗ comprar" / "◆L — esperar" (inicial + ícone + palavra; forma por ação; cor só o token `--model`), na vela decidida `t` (vela de 15 min) ou na PRIMEIRA vela de 3 min depois do
  fechamento de `t` (`validityStart`, o mesmo do "esperou" da spec 017); **faixa** (entrada, alvo, proteção) da ÚLTIMA compra recomendada de cada equipe, valendo em `[t + 15 min, t + 30 min)`: uma caixa de `t + 15 min` a `t + 30 min`
  (cobre as 5 velas de 3 min como um degrau) e, se ainda vale, vai até a ponta do gráfico. Nunca começa antes do fechamento (teste de propriedade). Contorno tracejado na cor do modelo e rótulos "◆N alvo", "◆N proteção".
- Porta do gráfico: `setTeamPlaques` (nova) e `SurfaceLevelBox.tag`; o tema ganhou `model` (token `--model`, opcional). O balão de valores traz "◆ Nina: ↗ comprar · entrada … · alvo … · proteção …" na vela apontada (mesma chave da decisão da estratégia).
  Frase da camada: "Equipes ◆ … Não é ordem nem recomendação: tendência, não promessa."
- Testes: `test/team-layer.contract.tsx` (8: plaquinhas, sem lookahead em 3 min, faixa em `[t+15, t+30)`, só a última compra, notas do balão, camada desligada sem consulta, ligar/lembrar/desligar, backtest sem a camada);
  `chart-preferences` e `chart-surface-lifecycle` atualizados. Painel inteiro: 1.529 passam, 0 falham (129 arquivos).
- Limite conhecido (não é mudança de API): as plaquinhas cobrem as últimas 24 velas de 15 min (a comparação da API) e a faixa usa as 3 últimas recomendações de cada equipe; mais histórico no gráfico precisaria de rota nova.

### T5.5 — Duelo: criar, gráfico de patrimônio único e ranking com Wilson e custo de API

- Rota `/duelo/:duelId` (`DuelPage`, `ROUTE_PATH.DUEL`) e o cartão "Duelo: equipes × regras" na página Backtests (botão "Montar um duelo" abre o formulário: par, saldo fictício, equipes ◆ ligadas e prontas — as outras
  aparecem desabilitadas com a frase do motivo —, e "Incluir a minha estratégia de regras" com a primeira estratégia na versão mais nova). `POST /v1/model-duels` → navega para o duelo. Erros em frase: sem vaga
  (`LIVE_RUN_LIMIT_REACHED`: "nada foi criado"), equipe desligada/indisponível, 429, 400.
- Gráfico (`duel-chart.ts` puro + `DuelChart`): SVG à mão, UMA linha por execução (vão onde a execução ainda não tem ponto, nada é interpolado), legenda "◆ Nina (Gemini)" / "● Minha estratégia (regras)" e traço próprio por
  execução (sólido, tracejado, pontilhado, traço-ponto — nunca só cor); `role="img"` com a descrição e os rótulos do eixo vêm do texto do servidor.
- Ranking (`duel-ranking.ts`): ordenado pelo retorno em BigInt (sem retorno vai para o fim), retorno arredondado para baixo, perda máxima para cima, operações, acerto de lado "N de M" com a faixa de Wilson e o veredito
  ("poucas previsões (menos de 30)"), custo de API de hoje e do mês por equipe ("sem custo de API" na execução de regras) e o link para a simulação de cada um. Frases fixas: "Mesmo par, mesma vela e mesmo saldo fictício. Período
  curto não prova nada.", "Comparação de acerto do lado da próxima vela; não mede lucro e não é recomendação." e "Retorno e perda máxima: resultado de uma simulação curta, não prova de nada." Atualiza com o aviso do stream.
- Teste: `test/duel.contract.tsx` (9: espelho Zod, gráfico e ranking puros, tela, 404, criação com o corpo exato, sem vaga, saldo inválido). Painel inteiro: 1.538 passam, 0 falham (130 arquivos).

### T5.7 — Execução de equipe (`team_run`) em Backtests e na Visão geral, com o rótulo da equipe e sem régua de regra

- Contratos: a execução ganhou `signalSource` e `duelId` (opcionais; ausente/nulo = execução de regras) nos esquemas de `GET /v1/runs*` e da Visão geral; os esquemas de `live-status` (gatilhos) e de `projections` aceitam o motivo `team_run`
  (sem isso o `live-status` inteiro era recusado e a tela da simulação quebrava para uma execução de equipe).
- Rótulo: `run-source-label.ts` (`◆ Equipe Nina (Gemini)`) no lugar de "model-team-1"/"Estratégia removida" no cartão "Simulação ao vivo" de Backtests (`LiveRunCard`), no cartão da Visão geral (`LiveSimulationCard`), no cabeçalho da
  execução (`RunHeader`, sem o hash da versão) e na barra de troca de execução (`RunSwitcher`). O cabeçalho traz a frase "Esta simulação segue a leitura de uma equipe de modelo ◆: não há placar nem gatilhos de regra para mostrar."
- Sem régua de regra: os gatilhos e a "Próxima vela de perto" mostram a frase do servidor para `team_run`; a varanda (`TeamRunBalcony`) mostra só as equipes ◆ e a explicação, em vez de esperar regras para sempre.
- Teste: `test/team-run.contract.tsx` (5: contratos com e sem `signalSource`, `team_run` em live-status e projeções, rótulo, cabeçalho, varanda). Painel inteiro: 1.543 passam, 0 falham (131 arquivos); `bun run lint` limpo;
  `prettier --check` de `apps/frontend-ativada` e da spec limpo; `test/code-size-limits.contract.test.ts` verde.
- Pendência pequena (só rótulo, sem mudança de API): a lista da barra de troca de execuções ("recentes") ainda nomeia a execução de equipe pelo id da versão fixa (a lista guarda só o id da versão). O título do botão já mostra a equipe.

### Fechamento da Fase 5 (painel das equipes) — como testar, gates e pendências (2026-10-17)

**Gates (Linux, `~/personal/ativada`):** `bun run typecheck` OK; `bun run lint` OK (zero erros); `prettier --check` de `apps/frontend-ativada` e da spec OK (o `format:check` da raiz só reclama de `graphify-out/`, ignorado pelo
git, como já registrado na T3.4); `bun run --cwd apps/frontend-ativada test` (panel-test): **1.543 passam, 0 falham** (131 arquivos, 14 contratos novos ou ampliados desta fase); `test/code-size-limits.contract.test.ts` verde.
Nenhuma mudança em API, banco, worker, `packages/strategy-engine` ou `packages/run-recording`; nenhuma chave, nenhuma rede a provedor real, nenhum `git push`.

**Verificação no navegador do app:** o painel (http://127.0.0.1:56100) abriu na tela de login do Keycloak ("acesso por convite"). Não há usuário de teste no repositório e senha de login não é algo que eu digite, então **não entrei**; a tela foi
verificada pelos contratos (texto literal de cada estado, `getByRole`, `textContent`) e confirmei que o Vite do app serve os módulos novos (`/src/runs/duel/DuelPage.page.tsx`, `ModelTeamChips`, `ModelTeamsCard`, `team-layer`: HTTP 200).
Nenhuma captura de tela (a captura final por tema é da T6.3, que não foi pedida). Não rodei `make panel-e2e` (precisa de Docker/Keycloak, ausentes no WSL).

**Como o usuário testa, passo a passo** (já logado em http://127.0.0.1:56100, com a stack dev de pé):

1. **Conta → "Equipes de modelo"** (`/conta#equipes`): as três equipes (◆ Nina, ◆ Lucas, ◆ Olívia) vêm **Desligadas**; cada uma mostra a família do modelo, a nuvem e o estado do provedor em ícone + palavra
   (sem chaves reais: "sem chave configurada"). Ligue uma (Espaço ou clique no interruptor): a palavra vira "Ligada" e o servidor guarda.
2. **Simulação ao vivo** (Backtests → abra a simulação ao vivo → "Equipe agora", a varanda acima do gráfico, e "Sala da equipe"): a faixa **EQUIPES DE MODELO** mostra os ◆ com a inicial, o nome e o estado em palavra
   ("desligada", "sem chave configurada", "pensando", "parada pelo teto de custo", "comprar/vender/esperar"). Clique num ◆: a **ficha** traz modelo e nuvem, última recomendação com entrada/alvo/proteção, os três papéis
   (tendência, risco, gestor), acertos "N de M" com Wilson e "poucas previsões (menos de 30)", custo de hoje e do mês, taxa de falha de 24 h e o link para as preferências. No celular (375 px) vira "◆ 3 equipes".
3. **"Pedir opinião agora"** (dentro da ficha): desabilitado com a frase do motivo (equipe desligada, sem chave/teto, simulação sem analista). Com uma equipe ligada e com chave (T6.2, manual) o pedido avulso aparece marcado
   "pedido avulso · não entra no placar".
4. **Camada "Equipes ◆" no gráfico** (botão em "Camadas do gráfico", **desligada por padrão** e lembrada): plaquinhas "◆N ↗ comprar" na vela decidida e a faixa de entrada/alvo/proteção da última compra, em `[t+15, t+30)`;
   na vela de 3 min a plaquinha cai na primeira vela depois do fechamento. O balão de valores traz a recomendação da vela.
5. **"Equipes × regras"** (cartão recolhível abaixo da sala): últimas 24 velas com o voto de cada regra, a indicação de cada equipe e ↗/↘/=/"ainda aberta" com ✓ acertou / ✗ errou.
6. **Duelo**: Backtests → "Duelo: equipes × regras" → "Montar um duelo" (só equipes ligadas e prontas entram; sem vaga de simulação ao vivo nada é criado) → `/duelo/:duelId`: gráfico único de patrimônio com legenda ◆/●,
   ranking com retorno, perda máxima, acerto de lado com Wilson e **custo de API**, e as frases "Período curto não prova nada" e "não mede lucro e não é recomendação".
7. **Execução de equipe**: a simulação criada pelo duelo mostra "◆ Equipe Nina (Gemini)" no cartão de Backtests, na Visão geral e no cabeçalho, com a frase de que não há placar nem gatilhos de regra.

**Pendências (nada foi mudado fora do painel):**

- **Dado novo da API** (parado aqui, como combinado): a ficha mostra a FAMÍLIA do modelo, não o id do modelo (`modelId`), e o custo de hoje/mês sem a barra "contra o teto de custo" (`budget { dailyUsd, monthlyUsd }`). A camada do gráfico cobre
  as últimas 24 velas (comparação) e as 3 últimas recomendações por equipe (faixa); mais histórico no gráfico precisa de rota nova.
- Lista de "recentes" da barra de troca de execuções ainda nomeia a execução de equipe pelo id da versão fixa (o título do botão já mostra a equipe).
- T6.1 (E2E `make panel-e2e` com servidor de controle), T6.2 (teste real com chaves, manual com o usuário), T6.3 (revisão de design 375/1280 px nos dois temas e a captura final) e T6.4 (`CLAUDE.md`) ficam abertas.
- A API não expõe a coluna `requested_by` do pedido avulso (pendência (3) da T3.4, inalterada).


### Fase 6 parcial — CLAUDE.md, revisão de código, `requested_by` e revisão de design (2026-10-17)

**T6.4.** `CLAUDE.md` ganhou um parágrafo no Estado e 8 bullets (equipes, pacote `model-agents`, worker/despachante, `team_run`/`team-step`/`model-team-1`, rotas, migrations 0027/0028, privacidade/custo/tetos, tela) mais o bullet "o projeto vive SÓ no Linux".

**Revisão de código** (`code-reviewer`, opus, só leitura, 314 arquivos de `3c7b3c5^..HEAD` e auditoria §15). Sem achado crítico ou alto. Corrigidos (média):

- `report-scheduler.ts`: `Promise.all` por par derrubava o ciclo; agora `Promise.allSettled` (o primeiro erro sobe depois de todos) e o ciclo em `create-model-teams-wiring.ts` captura a falha do enfileirador (log só do nome do erro, `ENQUEUE_FAILED`) e SEMPRE roda `dispatcher.tick()`. Teste novo no `model-team-dispatcher.contract.test.ts`.
- `reason-hygiene.ts`: caracteres invisíveis (zero-width, hífen suave, controles bidi, categoria `Cf`) e formas de compatibilidade (largura cheia) escondiam a palavra proibida; agora `normalize('NFKC')` + remoção de `\p{Cf}` antes da busca. Teste novo em `model-agents-hygiene.contract.test.ts`.

Limpo (verificado pelo revisor): `allSettled` por linha no despachante; logs só com `errorName`; chave só no cabeçalho; 500 genérico; `OwnerScope` em toda leitura de dado de usuário (duelo, sala, comparação, `team_run_inputs`, interruptor, cota); sem `dangerouslySetInnerHTML`/`innerHTML`/`href` vindo do modelo; dinheiro em `EngineDecimal`/`numeric`/BigInt; SQL parametrizado.

**Achados NÃO corrigidos (média/baixa), para decisão:**

1. (média) `analyst_decisions` é lida sem `OwnerScope` em `team-report.repository.ts` (`readPublicReadings`, junta `runs` de qualquer usuário). Só vale se as `readings` dependerem apenas de dado de mercado (premissa do ADR A3); falta um contrato que prove isso, ou calcular as leituras a partir de `candles`.
2. (média) Pedido avulso lido por id sem dono (`onDemandSection`): ver a proposta `requested_by` abaixo.
3. (baixa) Motivo oculto: a tela esconde os TRÊS papéis quando a flag única `reason_hidden` está ligada (`TeamSheetRoles.component.tsx`); o texto já vem higienizado por papel, a tela poderia mostrá-lo.
4. (baixa) Higiene não filtra URL, markdown nem frases de injeção (sem XSS: o React escapa; só chamariz).
5. (baixa) `model-team-environment.ts`: `daily > monthly` compara com `Number` (só validação do env); trocar por `EngineDecimal`.
6. (baixa) O custo de API do ranking/sala é a soma da INSTALAÇÃO por equipe, não do usuário; rotular como tal ou não expor.
7. (baixa) `claimOnDemand` e `enqueueOnDemandReport` em transações separadas: falha do insert consome a cota do dia.
8. (baixa) Sem N+1 real: `createRun` em laço no duelo (≤ 4, intencional), 1 a 2 consultas por vela no replay do `team-step`, 3 leituras independentes do `report-input.ts` poderiam ir em `Promise.all` (latência).
9. (baixa) `run-model-teams-comparison.use-case.ts` detecta analista por substring de JSON; `provider-http.ts` lê o corpo todo antes do teto; conferir que `httpUrlSchema` recusa `http://` fora de teste.

**Proposta `requested_by` (NÃO aplicada; sem migration).** Fatos: o id do pedido avulso é UUIDv7 (74 bits aleatórios), a linha é dado público de mercado (sem saldo, posição ou chave) e a leitura exige antes uma execução do próprio usuário no mesmo par. O risco prático é baixo. Opção A (recomendada para quando houver tempo): `ALTER TABLE model_team_reports ADD COLUMN requested_by uuid NULL REFERENCES users(id) ON DELETE SET NULL` (aditiva, rollback = `DROP COLUMN`), gravada só quando `kind = 'on_demand'`, e `onDemandSection` passa a exigir `requested_by = scope.userId`; a migration traz o custo de LGPD (a coluna vira dado pessoal: exportar, anular na exclusão da conta, hoje `model_team_reports` é `UNOWNED_PUBLIC_TABLES`) e de teste (mutante de dono novo). Opção B: não adicionar e manter o id não adivinhável como a garantia, ajustando o comentário do esquema (`run-model-teams.schema.ts:36`) para dizer isso. Recomendação: B agora, A se o produto passar a mostrar opiniões avulsas a mais de um dono ou se a auditoria exigir. Decisão do usuário.

**T6.3 parcial.** `contrast`, `touch-targets` e `design-review` verdes (180 testes). Três alvos de toque dos componentes novos estavam fora do contrato e entraram (`TeamComparison .summary`, `Duel .link`, `Duel .pick`; todos com 44 px). A varredura por DOM a 375 px (`getBoundingClientRect`) e o tema escuro NÃO foram feitas: o painel (http://127.0.0.1:56100) abre em `/login` ("Entrar com Keycloak", acesso por convite) e a I.A. não digita senha. **Pendente para o usuário:** logado, a 375 e 1280 px nos dois temas, abrir `/conta#equipes`, a sala da simulação (ficha da equipe, "Equipes × regras", camada ◆) e `/duelo/:duelId` e conferir que nenhum alvo interativo mede menos de 44 px e que nada transborda na horizontal; capturas finais (uma por tema) ficam para a T6.3 completa.


### Painel: só as equipes LIGADAS aparecem (2026-10-18)

Pedido do usuário: "quando os agents estiverem desligados não precisa aparecer eles, apenas os ligados". Só painel (`apps/frontend-ativada`); API, banco, worker e motor intactos.

- `useModelTeamsView().teams` devolve só as equipes ligadas (a da execução manda; em backtest/walk-forward valem as preferências de hoje; enquanto não se sabe, nada aparece). `useEnabledTeamKeys(runId, isEnabled)` dá as chaves ligadas à coluna "Equipes × regras", à camada "Equipes ◆" e à `LayerBar`.
- Some quando desligada: personagem e chip da varanda ao vivo, de backtest e de walk-forward (`ModelTeamChips`, `model-agents.ts`, `HistoricalTeam`), crachá do escritório e sala de vidro (`OfficeBadgeList`, `OfficeCorners`), coluna do cartão "Equipes × regras" (o cartão inteiro some sem nenhuma ligada), plaquinhas/faixas/notas da camada "Equipes ◆" (o botão da camada some sem nenhuma ligada) e a linha do seletor do duelo.
- Continua aparecendo, com a palavra: ligada sem chave configurada, parada pelo teto de custo, provedor fora, chave recusada, modelo indisponível; e esperar/comprar/vender/pensando.
- Nenhuma ligada: a seção de equipes some sem espaço vazio e fica só `EnableTeamsLink` ("Equipes de modelo (desligadas) · ligar em Conta", 12 px, alvo de 44 px, uma linha) para `/conta#equipes`. Em Conta todas seguem listadas.
- `useRunModelTeamsQuery` ganhou `placeholderData` (mantém o estado anterior ao pedir opinião avulsa, que muda a chave); sem isso os ◆ piscavam e a ficha aberta se desmontava.
- Contratos: `model-teams-off-hidden.contract.tsx` (novo, na lista do `package.json`), e atualizados `historical-crew`, `model-teams-room`, `model-teams-ondemand` (inclui o cartão) e `duel`.

**Como confirmar na tela:** em Conta → Equipes de modelo, desligue a Nina e deixe a Olívia ligada. Abra uma simulação ao vivo, um backtest e o escritório: só a Olívia aparece (sem "desligada" em lugar nenhum); ligue a Lucas sem chave e ela aparece com "sem chave configurada". Desligue todas: a seção de equipes some e sobra o link pequeno "Equipes de modelo (desligadas) · ligar em Conta", que abre `/conta#equipes`. O botão "Equipes ◆" das camadas e o cartão "Equipes × regras" também somem; o seletor do duelo mostra só esse link.

