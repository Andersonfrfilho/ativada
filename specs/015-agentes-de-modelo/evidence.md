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
