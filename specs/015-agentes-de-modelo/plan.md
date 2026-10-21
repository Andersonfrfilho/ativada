# Plano — Spec 015 (revisão 2: equipes de modelo)

## Fatos conferidos em 2026-10-17 (não repetir a busca)

**Código da casa**

- **Nenhum código de LLM no repo.** Não há `anthropic`, `gemini`, `genai` nem `openai` em `apps/` e `packages/`. Nenhuma
  dependência nova é necessária: `fetch` + Zod.
- **Migrations**: em `packages/database/drizzle/` (`NNNN_nome.sql` + `.rollback.sql`); esquemas em
  `packages/database/src/schema/`. A última é `0026_candles_display_timeframes`, a próxima livre é **`0027`**.
  `worker_heartbeats` tem PK `instance_id`, `started_at`, `last_beat_at`, `version`; `users.id` é `uuid`.
- **Env por app**: `apps/worker-ativada/src/environment.ts` e `apps/api-ativada/src/environment.ts`; auxiliares em
  `packages/environment/src/`. Padrão de segredo opcional: `TELEGRAM_BOT_TOKEN: nonEmptyTextSchema.max(...).optional()` em
  `PRODUCTION_PROFILE.secretVariables`; recurso desligado sem a chave: `apps/worker-ativada/src/alerts/create-alert-wiring.ts`.
- **Cliente HTTP com segredo** (modelo a copiar): `apps/worker-ativada/src/alerts/telegram-client.ts` (`fetch` com
  `redirect: 'error'` e `AbortSignal.timeout`, `catch {}` que troca o erro por um código, classificação 2xx/429/5xx/outro).
- **O motor** (conferido para o desenho da §D9):
  - `walletStep` AVULSO existe e é público (`createEngine().walletStep`, usado pelo walk-forward e pelas metas). Entrada:
    `{ strategy, run, state, candle, signal: SignalDecision | null, commands?, executionReports?, entryRiskScale? }`.
  - `SignalDecision` traz `candleOpenTime`, `configHash`, `confirmedGapCandles`, `action` (`BUY | SELL | HOLD`), `score`,
    `regime`, `votes`, `indicators`, `sentiment` e `reason`. O `walletStep` avulso CONFERE `configHash` contra a estratégia e
    a contiguidade do candle (`wallet-guard.ts`).
  - **Stop e alvo NÃO vêm do sinal**: a posição nasce com a distância de stop e de alvo da configuração de risco da
    estratégia (`RISK_SCHEMA`/`ENTRY_SCHEMA`, por ATR), em `wallet/entry-order.ts` e `wallet/protective-exit.ts`. A ordem
    de entrada executa na abertura de `t + 1`.
  - Os comandos externos são só `halt`, `resume` e `exit_position` (`COMMAND_KIND`); `toAnalystCommands` "nunca emite
    comando de entrada". Não há comando de entrada com preço, alvo e proteção.
  - `STRATEGY_FAMILY` é vocabulário FECHADO (`trend`, `reversion`, `volume`, `sentiment`); `STRATEGY_RULES_SCHEMA` exige de
    1 a N regras (`min(1)`).
  - `advanceCandle` (`@ativada/run-recording`) compõe sinal + carteira e alimenta a gravação; `mapSignal`, `mapOrderEvent`,
    `mapFill`, `mapEquityPoint`, `mapCommand` (`run-recording/src/map-decisions.ts`) fazem as linhas, mas só `advanceCandle`,
    `appendDecisions`, `createBatchBuffer` e `toRunResultRows` são exportados no `index.ts`.
- **Passo ao vivo do analista**: `apps/worker-ativada/src/live/analyst-step.ts` e `govern-step.ts` (o analista governa a
  vela refazendo o passo puro com entradas); a linha é gravada na mesma transação (`insertAnalystDecision`).
- **`analyst_decisions`** (0024): uma linha por `(run_id, candle_time)`, `CHECK version in ('analyst-1')`; o ranking da
  varanda é montado no painel a partir de `current.specialists` (`BoardRanking.component.tsx`, `ranking-model.ts`).
- **Wilson**: `packages/statistics/src/wilson-interval.ts`, com `judgeAgainstCoinFlip({ hits, counted })`.
- **Limite de taxa**: `apps/api-ativada/src/rate-limit/rate-limit-policy.constant.ts`.
- **Sala da equipe**: ◆ em `apps/frontend-ativada/src/runs/team-room/balcony/` (`BALCONY_MODELS`, `RANKING_MODELS`); camadas
  do gráfico em `src/runs/candle-chart/` (spec 009/017); preferências da sala só no `localStorage`; no servidor só
  `GET/PATCH /v1/me` e `users.alert_telegram_enabled`.

**Provedores** (documentação oficial)

- **Gemini**: Pro atual `gemini-3.1-pro-preview` (preview, sem rótulo estável; o `gemini-3-pro-preview` já foi desligado).
  `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, cabeçalho `x-goog-api-key`.
  Saída: `generationConfig.responseMimeType = application/json` + `responseSchema` (só `type`, `properties`, `required`,
  `enum`, `minimum`, `maximum`, `additionalProperties`; **sem `maxLength`**). Raciocínio:
  `generationConfig.thinkingConfig.thinkingLevel` = `low | medium | high` (o Pro não aceita `minimal` e não desliga; fonte
  parcial, ver `evidence.md`). Uso em `usageMetadata` (`promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`,
  `totalTokenCount`). Preço do 3.1 Pro: US$ 2 / 12 por 1M (≤ 200k), raciocínio cobrado como saída. A documentação marca
  `generateContent` como "Legacy" ao lado da API Interactions.
- **Anthropic**: `POST https://api.anthropic.com/v1/messages`, cabeçalhos `x-api-key` e `anthropic-version: 2023-06-01`.
  Saída por `tools` + `tool_choice: { type: 'tool', name: 'report_team' }`; uso em `usage.input_tokens` e
  `usage.output_tokens`. Ids: `claude-sonnet-5-5` (US$ 2 / 10), `claude-haiku-5-5` (a partir de US$ 0,10 / 0,50).
- **OpenAI** (conferido hoje em `developers.openai.com`): `POST https://api.openai.com/v1/responses`, cabeçalho
  `Authorization: Bearer <chave>`. Saída estruturada em `text.format = { type: "json_schema", name, strict: true, schema }`;
  o esquema estrito exige TODOS os campos em `required`, `additionalProperties: false` em todo objeto, campo opcional como
  união `["string", "null"]`, e aceita `enum`, `minimum`, `maximum`; **`minLength`/`maxLength` não são aceitos**. Recusa =
  item de conteúdo `{ type: "refusal", refusal }` (não segue o esquema: checar antes de ler). Raciocínio:
  `reasoning.effort` (Responses) com valores `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, e o subconjunto
  varia por modelo (o `gpt-6-astra` recusa `none` com 400; o `gpt-6.1-sol` não aceita `none` nem `minimal`, padrão `medium`).
  Uso em `usage.input_tokens`, `usage.output_tokens` e `usage.output_tokens_details.reasoning_tokens` (cobrados como saída).
  **`max_output_tokens` inclui o raciocínio**; estourar dá `status: incomplete` com
  `incomplete_details.reason = max_output_tokens`, possivelmente sem nenhuma saída visível. Modelos e preços listados hoje
  (US$ por 1M, entrada / saída, ≤ 272k): `gpt-6-astra` 10 / 50, `gpt-6.1-sol` 2 / 10, `gpt-6-sol` 2 / 10, `gpt-6-luna`
  0,10 / 0,50, `gpt-5.6-sol` 4 / 20, `gpt-5.6-terra` 2 / 12, `gpt-5.4` 2,50 / 15. **Nenhum id é presumido no código.**

## D1. Onde mora cada peça

| Peça | Lugar | Por quê |
|---|---|---|
| Domínio puro | **Pacote novo** `packages/model-agents/src/` (`@ativada/model-agents`): `model-team-catalog.constant.ts` (`MODEL_TEAMS`: `nina`/`lucas`/`olivia`, provedor, família, nuvem; `TEAM_ROLES`), `team-report.schema.ts` (Zod do relatório, RF07), `team-levels.ts` (coerência dos preços, RF07), `team-prompt-input.schema.ts` (RF09), `prompt-template.ts` (`team-prompt-1`, `renderPrompt`, `hashPrompt`), `prompt-privacy.ts`, `reason-hygiene.ts` (RF08, nos 3 textos), `model-cost.ts`, `budget-policy.ts`, `provider-circuit.ts`, `team-signal.ts` (decisão gravada → `SignalDecision`, D9), `opinion-auditor.ts`, `model-call-result.types.ts`, `model-agents-messages.ts` | Puro e testável como o `risk-analyst`; worker e API importam a mesma coisa |
| Porta e adaptadores | `apps/worker-ativada/src/model-teams/`: `model-provider.port.ts`, `anthropic-provider.ts`, `gemini-provider.ts`, `openai-provider.ts`, `provider-http.ts` (fetch, timeout, `redirect: 'error'`, classificação) | Só o worker tem a chave (DT11) |
| Despachante | `apps/worker-ativada/src/model-teams/`: `report-dispatcher.ts`, `report-scheduler.ts`, `create-model-teams-wiring.ts` (liga só com chave), `provider-status.ts` (batimento) | Mesmo desenho do despachante de alertas (T4.5) |
| Passo da execução de equipe | `apps/worker-ativada/src/live/team-step.ts` (D9) | Fica ao lado do `analyst-step.ts`, sem tocar `advanceCandle` |
| Enfileirar no passo | `live-step.ts` ganha UMA chamada a `enqueueTeamReports` na transação da vela (só `INSERT ... ON CONFLICT DO NOTHING`) | Fila durável; o passo nunca espera o modelo |
| Banco | `packages/database/src/model-teams/`: `team-report.repository.ts`, `user-model-team.repository.ts` (`OwnerScope` no tipo) + esquemas em `src/schema/` | Filtro de dono num lugar; os mutantes entram ali |
| Rotas | `apps/api-ativada/src/model-teams/` (`me-model-teams.route.ts`, `run-model-teams.route.ts`, `model-opinion-request.route.ts`, `model-duels.route.ts`, `*.docs.ts`, `*.validation.ts`) | Padrão das rotas de `runs` |
| Painel | `apps/frontend-ativada/src/runs/team-room/models/` (ficha, estado, botão, comparação), `src/runs/candle-chart/` (camada "Equipes ◆"), `src/runs/duel/` (gráfico de patrimônio e ranking), `src/account/model-teams/` (interruptores), glossário | A sala e o gráfico já têm o lugar dos ◆ |

## D2. Fluxo de um relatório `scheduled`

1. **Enfileirar.** A ronda do worker fecha a vela `t` de uma `live_paper` que dependa de equipe (execução de equipe, ou
   usuário com a equipe ligada e analista no par). No INÍCIO da ronda, numa transação curta PRÓPRIA (nunca dentro da transação do
   passo, para não travar nem dar deadlock com ele),
   `enqueueTeamReports({ symbol, timeframe: '15m', candleTime: t })` insere uma linha `pending` por equipe que esteja (a)
   ligada por algum dono com simulação `running` naquele par e (b) dentro do ritmo, com
   `(t + d) mod (cadence × 60.000) = 0`. A chave única parcial `(team_key, symbol, timeframe, candle_time, prompt_version)
   WHERE kind = 'scheduled'` impede duplicar.
2. **Montar a entrada.** O despachante, a cada `MODEL_TEAM_POLL_SECONDS` (padrão 2), reivindica até `concurrency` linhas
   `pending` (`FOR UPDATE SKIP LOCKED`, arrendamento `lease_until`). A entrada sai de dado público do banco: as 48 velas
   `≤ t` do par, as leituras da linha de `analyst_decisions` de qualquer simulação do par naquela vela (iguais entre
   simulações, ADR A3) e o Fear & Greed. É validada por `TeamPromptInput` e gravada em `input jsonb` com `prompt_hash`.
3. **Pré-checagens, em ordem**, cada falha grava `skipped` com o código: `STALE` (mais de 2 velas), `NO_KEY`,
   `CIRCUIT_OPEN`, `BUDGET_EXHAUSTED` (reserva sob `pg_advisory_xact_lock`; soma de `cost_usd` gravado e `reserved_usd` em voo
   no dia/mês UTC).
4. **Chamar** `ModelProvider.requestTeamReport`, com tempo-limite.
5. **Gravar.** `ok` → valida o esquema (RF07) → coerência dos preços (`team-levels.ts`, contra o fechamento de `t`) → higiene
   dos três textos (RF08) → `decided`, com tokens, latência e custo real (`reserved_usd` zera). Falha → `failed` + código,
   com o custo pelos tokens se o provedor os devolveu, senão 0. O circuito é atualizado.
6. **Avisar.** `pg_notify('model_team_reports', { symbol })`. O painel consulta por polling só enquanto há `pending` à
   vista; a espera da execução de equipe (D9) lê a tabela, não o aviso.

Retomada: arrendamento vencido volta a `pending` (máximo 2 tentativas); o `STALE` impede chamada atrasada; reiniciar o worker
nunca duplica, por causa da chave única.

## D3. Prompt `team-prompt-1` (template fixo, versionado)

- **Instrução** (fixa, pt-BR): "Você é uma equipe de três papéis: analista de tendência, analista de risco e gestor; leia só
  os dados de velas de 15 min abaixo". Pergunta única ao gestor: a próxima vela de 15 min do par é uma boa entrada de compra
  (`buy`), pede sair ou ficar fora (`sell`) ou esperar (`hold`)? Responder só pela ferramenta/JSON. `buy` exige entrada,
  alvo e proteção com `proteção < entrada < alvo` perto do último fechamento; `sell` e `hold` com os três preços nulos.
  Textos de até 160 caracteres, sem prometer nada e sem recomendar "compre" ou "venda". `neutral`/`hold` quando não houver
  leitura clara.
- **Dados**: um bloco JSON compacto com `symbol`, `timeframe`, `lastCandleCloseTime`, `candles`
  (`[openTime, open, high, low, close, volume]` × 48, texto decimal), `readings` e `fearGreed` ou `null`. Nada de posição,
  saldo ou usuário.
- **Parâmetros**: temperatura 0 na Anthropic; Gemini com `thinkingLevel` do env; OpenAI com `reasoning.effort` do env e
  `store: false`; `maxOutputTokens` = `MODEL_TEAM_MAX_OUTPUT_TOKENS` (padrão 900, mais folga que a versão 1 por causa dos
  três papéis e do raciocínio; no Gemini e na OpenAI soma-se ao orçamento de raciocínio).
- **Mudar o template** exige `team-prompt-2`. A chave única inclui a versão e o placar conta POR versão.

## D4. Custo e teto

- Preço por equipe vem do env (`MODEL_TEAM_<NINA|LUCAS|OLIVIA>_INPUT_USD_PER_MTOK` / `_OUTPUT_USD_PER_MTOK`, texto decimal
  ≤ 8 casas).
- `cost = ceil8((input × pIn + (output + thinking) × pOut) ÷ 1.000.000)`.
- `reserve = ceil8((estimatedInput × pIn + maxOutput' × pOut) ÷ 1.000.000)`, com `estimatedInput = ceil(len(prompt) ÷ 3)` e
  `maxOutput'` = `maxOutputTokens` + o teto do raciocínio (`MODEL_TEAM_NINA_MAX_THINKING_TOKENS` e
  `MODEL_TEAM_OLIVIA_MAX_THINKING_TOKENS`, padrão 2.000, usados SÓ para reservar).
- `budget-policy.ts` decide `allow | deny_day | deny_month` pela soma exata; soma por `SUM` com índice em `(requested_day)`.
- Números da spec §8 (3 equipes, 15 min: ~US$ 4,63/dia, US$ 138,82/mês; 60 min: US$ 1,16/dia, US$ 34,70/mês).

## D5. Circuito por provedor (`provider-circuit.ts`)

- **Estados**: `closed → open(until) → half_open → closed | open`; o relógio entra por parâmetro; o estado vive em memória do
  worker (reiniciar = `closed`) e é publicado no batimento.
- **Transições**: `timeout`/`unavailable` somam falhas seguidas (3 → `open` 10 min; falha na prova reabre 10 min);
  `rate_limited`: `open` até `retryAfter` (teto 15 min); `key_rejected` e `model_not_found`: `open` 60 min; `ok`,
  `invalid_output`, `refused` e `bad_request` fecham (o provedor respondeu).

## D6. Migration PROPOSTA `0027_model_teams` (aditiva, com `.rollback.sql`; exige autorização; NADA aplicado)

```sql
CREATE TABLE model_team_reports (
  id uuid PRIMARY KEY,
  team_key varchar(8) NOT NULL CHECK (team_key IN ('nina','lucas','olivia')),
  provider varchar(16) NOT NULL CHECK (provider IN ('anthropic','google','openai')),
  model_id varchar(80) NOT NULL,
  prompt_version varchar(16) NOT NULL CHECK (prompt_version IN ('team-prompt-1')),
  kind varchar(12) NOT NULL CHECK (kind IN ('scheduled','on_demand')),
  symbol varchar(20) NOT NULL,
  timeframe varchar(4) NOT NULL CHECK (timeframe IN ('15m')),
  candle_time bigint NOT NULL,
  status varchar(8) NOT NULL CHECK (status IN ('pending','decided','failed','skipped')),
  action varchar(4) NULL CHECK (action IN ('buy','sell','hold')),
  entry_price numeric NULL, target_price numeric NULL, stop_price numeric NULL,
  confidence smallint NULL CHECK (confidence BETWEEN 0 AND 100),
  roles jsonb NULL,              -- { trend: { stance, reason }, risk: { level, reason }, decision: { reason } }
  reason_hidden boolean NOT NULL DEFAULT false,
  input jsonb NULL,
  prompt_hash char(64) NULL,
  raw_output text NULL CHECK (char_length(raw_output) <= 2048),
  input_tokens integer NULL, output_tokens integer NULL, thinking_tokens integer NULL,
  latency_ms integer NULL,
  cost_usd numeric(14,8) NOT NULL DEFAULT 0,
  reserved_usd numeric(14,8) NOT NULL DEFAULT 0,
  failure_code varchar(48) NULL,
  attempt smallint NOT NULL DEFAULT 0,
  lease_until timestamptz NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  decided_at timestamptz NULL,
  CHECK (status <> 'decided' OR (action IS NOT NULL AND confidence IS NOT NULL AND roles IS NOT NULL)),
  CHECK (action IS DISTINCT FROM 'buy' OR (entry_price IS NOT NULL AND target_price IS NOT NULL AND stop_price IS NOT NULL
         AND stop_price < entry_price AND entry_price < target_price)),
  CHECK (status NOT IN ('failed','skipped') OR failure_code IS NOT NULL)
);
CREATE UNIQUE INDEX model_team_reports_scheduled_unique
  ON model_team_reports (team_key, symbol, timeframe, candle_time, prompt_version) WHERE kind = 'scheduled';
CREATE INDEX model_team_reports_pending ON model_team_reports (requested_at) WHERE status = 'pending';
CREATE INDEX model_team_reports_audit ON model_team_reports (symbol, team_key, candle_time DESC);
CREATE INDEX model_team_reports_day ON model_team_reports (requested_day);

CREATE TABLE user_model_teams (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  team_key varchar(8) NOT NULL CHECK (team_key IN ('nina','lucas','olivia')),
  enabled boolean NOT NULL DEFAULT false,
  on_demand_day date NULL,
  on_demand_count smallint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, team_key)
);

CREATE TABLE team_run_inputs (
  run_id uuid NOT NULL,
  candle_time bigint NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  report_id uuid NULL REFERENCES model_team_reports (id) ON DELETE RESTRICT,
  failure_code varchar(48) NULL,
  applied_action varchar(4) NULL CHECK (applied_action IN ('buy','sell','hold')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, candle_time),
  FOREIGN KEY (run_id, user_id) REFERENCES runs (id, user_id) ON DELETE RESTRICT,
  CHECK (report_id IS NOT NULL OR failure_code IS NOT NULL)
);

ALTER TABLE worker_heartbeats ADD COLUMN model_teams jsonb NULL;
```

- **Rollback**: `DROP TABLE user_model_teams; DROP TABLE model_team_reports; ALTER TABLE worker_heartbeats DROP COLUMN
  model_teams;` com o aviso de que os relatórios gravados se perdem (e, com eles, a reprodução das execuções de equipe: o
  rollback ABORTA se existir execução com `signalSource` de equipe).
- **Sem ENUM nativo.** `model_team_reports` não tem `user_id`: é pública como `candles`, sem PII. `user_model_teams` e `team_run_inputs`
  (a entrada gravada de cada vela da execução de equipe, do dono) entram no `ownership-registry`, na exportação e na purga, antes de
  `users` e de `runs`. Retenção (DT10): tarefa `expire-model-team-reports` do
  cron, 365 dias, mas **não apaga relatório referenciado por execução de equipe ainda guardada** (a reprodução depende dele).
- **O que NÃO exige migration**: o vínculo da execução de equipe e do duelo mora em `runs.request`
  (`signalSource`, `duel.groupId`), que já é `jsonb` validado na criação; `signals`, `orders`, `fills`, `positions` e
  `equity_points` já gravam o que a carteira produz.

## D7. Rotas (contratos de RF22) — propostas

- **Políticas novas** `MODEL_TEAMS_READ` (60/min por usuário), `MODEL_OPINION_REQUEST` (5 por 10 min) e `MODEL_DUEL_CREATE`
  (3 por hora). Contador diário do pedido avulso em `user_model_teams` (`UPDATE ... SET on_demand_count = CASE WHEN
  on_demand_day = hoje THEN on_demand_count + 1 ELSE 1 END ... WHERE ... AND (on_demand_day <> hoje OR on_demand_count <
  limite) RETURNING`): nenhuma linha devolvida = `429`.
- **Placar em SQL**: UMA consulta com `LEAD`/junção em `candles` por `(symbol, '15m', candle_time + 900000)`, agrupada por
  equipe, devolvendo `hits`, `misses`, `ties` e `counted`; o veredito sai de `judgeAgainstCoinFlip` em TypeScript.
- **Comparação das 24 velas**: UMA consulta com as 24 linhas de `analyst_decisions` da simulação (cursor por `candle_time`) e
  outra com os relatórios `scheduled` daquelas velas.
- **Duelo**: `POST /v1/model-duels` cria as execuções numa transação (cada uma pelo caminho normal de `POST /v1/runs`, com
  o teto `maxActiveLivePaperRuns` conferido ANTES de criar qualquer uma; falta de vaga = `409 LIVE_RUN_LIMIT_REACHED` sem
  criar nada). `GET /v1/model-duels/:duelId` lê as execuções do grupo do dono e as curvas de `equity_points` alinhadas por
  `candle_time` (no máximo 5 consultas, sem cache).
- **Erros novos**: `MODEL_TEAM_DISABLED`, `MODEL_TEAM_UNAVAILABLE`, `MODEL_TEAM_NOT_FOUND` (chave fora do catálogo = `404`),
  `DUEL_NOT_FOUND`.

## D8. Env (worker, salvo onde indicado)

| Variável | Regra |
|---|---|
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY` | opcionais, `secretVariables`; ausente = provedor desligado |
| `ANTHROPIC_BASE_URL` (padrão `https://api.anthropic.com`), `GEMINI_BASE_URL` (padrão `https://generativelanguage.googleapis.com`), `OPENAI_BASE_URL` (padrão `https://api.openai.com`) | `https` em produção; o teste aponta para o falso |
| `MODEL_TEAM_LUCAS_MODEL` (com a chave Anthropic), `MODEL_TEAM_NINA_MODEL` (com a chave Gemini), `MODEL_TEAM_OLIVIA_MODEL` (com a chave OpenAI) | **obrigatórios quando a chave existe, sem padrão**; texto `[a-z0-9.-]{3,80}` |
| `MODEL_TEAM_<EQUIPE>_INPUT_USD_PER_MTOK`, `_OUTPUT_USD_PER_MTOK` | obrigatórios com a chave; decimal ≥ 0, ≤ 8 casas |
| `MODEL_TEAM_NINA_THINKING_LEVEL` | `low` (padrão), `medium` ou `high` |
| `MODEL_TEAM_OLIVIA_REASONING_EFFORT` | `low` (padrão), `medium` ou `high`; valores que o modelo recusar dão `bad_request` na tela, nunca presumidos |
| `MODEL_TEAM_NINA_MAX_THINKING_TOKENS`, `MODEL_TEAM_OLIVIA_MAX_THINKING_TOKENS` | 0 a 32.000, padrão 2.000 (só para a reserva) |
| `MODEL_TEAM_DAILY_BUDGET_USD`, `MODEL_TEAM_MONTHLY_BUDGET_USD` | obrigatórios com qualquer chave; decimal > 0; diário ≤ mensal |
| `MODEL_TEAM_TIMEOUT_SECONDS` | 5 a 90, padrão 30 |
| `MODEL_TEAM_CADENCE_MINUTES` | 15 ou 60, padrão 15 |
| `MODEL_TEAM_MAX_OUTPUT_TOKENS` | 200 a 2.000, padrão 900 |
| `MODEL_TEAM_CONCURRENCY` | 1 a 6, padrão 3 |
| `MODEL_TEAM_POLL_SECONDS` | 1 a 30, padrão 2 |
| `MODEL_TEAM_DECISION_DEADLINE_SECONDS` | 5 a 120, padrão 45 |
| `MODEL_TEAM_ENTRY_TOLERANCE_PERCENT`, `MODEL_TEAM_MIN_STOP_PERCENT` | decimal > 0; padrão 1,5 e 0,2 |
| API: `MODEL_TEAM_ON_DEMAND_PER_USER_PER_DAY` | 0 a 100, padrão 20 (0 desliga o botão) |

Exemplos em `envs/env.dev` comentados (sem chave). A chave real só em `envs/env.dev.local`, que o usuário edita.

## D9. Como a decisão gravada do modelo vira ordem (o desenho central; PROPOSTO, nada aplicado)

**Princípio.** A decisão do modelo é uma **entrada gravada**: o passo da execução de equipe só LÊ a linha de
`model_team_reports`, nunca chama o provedor. O motor continua puro e determinístico; o que entra nele é um sinal que uma
função pura calculou da linha gravada.

**Fluxo da vela `t` numa execução de equipe** (`apps/worker-ativada/src/live/team-step.ts`):

1. A ronda reivindica a execução como toda `live_paper` (`claimLiveRuns`) e fecha a vela `t`.
2. **Espera da decisão** (RF14): lê `(team_key, symbol, '15m', t, team-prompt-1, kind = 'scheduled')`. Se a linha está `pending`
   e o prazo não passou, o passo **devolve sem commit** com a nova saída `AWAITING_TEAM` (a execução fica como está e a ronda
   seguinte tenta de novo): o passo **nunca dorme** nem segura transação. O prazo (`MODEL_TEAM_DECISION_DEADLINE_SECONDS` depois do
   fechamento de `t`) é conferido com `clock_timestamp()` do BANCO, não com o relógio do processo. Passado o prazo, ou com a linha
   `failed`/`skipped` ou ausente, a decisão é **esperar**, com o motivo "equipe sem leitura" e o código da falha. A linha que ficar
   `decided` depois do prazo NÃO é usada para `t`. **O que foi decidido para `t` é gravado em `team_run_inputs`** (`report_id` ou
   `failure_code`, mais a `applied_action`) na MESMA transação do passo.
3. **Tradução pura** (`team-signal.ts` em `@ativada/model-agents`): o passo de equipe roda o `signalStep` da estratégia `model-team-1`
   (a regra de período ≤ ATR existe só para o motor calcular os indicadores; é avaliada e descartada) e SUBSTITUI no sinal resultante
   `action`, `score` (`'100'` | `'-100'` | `'0'`), `votes: []` e `reason` (o motivo do Gestor já higienizado), MANTENDO `indicators`
   (inclui o ATR), `regime`, `configHash`, `confirmedGapCandles` e `candleOpenTime`. Sinal `null` do motor (aquecimento) segue `null`.
   O mapeamento é 1:1: `buy` → `BUY`, `sell` → `SELL`, `hold` ou sem leitura → `HOLD`; o que não cabe (compra com posição, venda sem
   posição) **a política de sinal do motor já ignora**, e a linha de decisão registra "ignorada: já comprada" ou "ignorada: sem
   posição" (a ação aplicada fica em `team_run_inputs.applied_action`). `votes` fica vazio: a família é vocabulário fechado do motor,
   então os papéis ficam em `model_team_reports.roles`.

4. **Carteira existente**: `engine.walletStep({ strategy, run, state, candle, signal, ... })` (avulso, o mesmo do
   walk-forward). A ordem de entrada ou de saída executa na **abertura de `t + 1`**, pela mesma política de preenchimento,
   taxa, slippage e participação no volume de toda execução. Nada de lookahead: o sinal de `t` só enxerga o fechamento de
   `t` e a linha gravada sobre `t`.
5. **Gravação**: as linhas de `signals` (o sinal substituído), `orders`, `fills`, `positions` e `equity_points` saem do `appendDecisions` e do
   `toRunResultRows` que o `run-recording` JÁ exporta (as decisões vêm do `walletStep` avulso), na MESMA transação do passo, com `engine_state`, `last_candle_time` e a linha de
   `team_run_inputs`. **Nenhum export novo no `run-recording` e nenhuma mudança no motor.**
6. **Replay e retomada**: o mesmo passo lê `team_run_inputs` (e o relatório que ela aponta), NUNCA o relógio nem o provedor, e dá
   `fills` e `equity_points` iguais byte a byte, **sem provedor ligado e sem chave**. Reiniciar o worker não repete nem duplica (candle repetido é pulado, como na `live_paper`).

**Estratégia da execução de equipe.** O `walletStep` exige uma `StrategyVersion`. A execução de equipe usa uma versão fixa
`model-team-1` (a mesma estrutura do Placar clássico, com a configuração de risco e de entrada dela e UMA regra qualquer
que nunca é avaliada, porque o sinal vem de fora). Ela é uma estratégia do sistema, não editável, com hash preso por teste
de hash-dourado. O `POST /v1/runs` com `signalSource` cria ou acha a versão `model-team-1` DO USUÁRIO pelo hash (como o exemplo do Placar
clássico), e o worker RECUSA uma versão com `configHash` diferente do preso. A regra de período ≤ ATR é a que o `signalStep` precisa
para calcular os indicadores (inclui o ATR do risco); o sinal dela é descartado (passo 3). **Proibido com `signalSource`:** `goalId`
e analista (`analyst`), com `400`. `live-status`, `projections` e `strategy-layers` devolvem `unavailable`/`team_run` para a execução
de equipe (o placar e as camadas de regra não se aplicam). **Proposta (não presumida):** uma marca que esconda a versão
`model-team-1` da lista de estratégias do usuário e a deixe fora de `STRATEGY_MAX_PER_USER`; a decisão fica para a Fase 3
(a 0027 não cria coluna para isso).

**Opção A × opção B para os níveis (DT5).**

- **A (padrão): a posição usa o stop e o alvo da configuração de risco da execução (ATR).** A equipe indica entrada, alvo e
  proteção, que o painel desenha e o auditor mede à parte (o alvo foi tocado antes da proteção nas velas seguintes?), mas
  quem comanda a ordem é a carteira. Não mexe no motor.
- **B (proposta): os níveis do modelo comandam a ordem.** Exige: um comando de entrada novo no motor
  (`enter_position` com `entryPrice`, `targetPrice`, `stopPrice`), a carteira derivando `riskAmount`/`stopDistance`/
  `targetDistance` desses níveis com os limites de risco por operação já existentes (nunca acima de `riskPerTrade × saldo`),
  `ENGINE_VERSION` novo, dourado regravado, harness de 21 verificações estendido, ADR e mutantes. É mudança de motor e
  fica na Fase 7, só com autorização.

**O que cada parte exige (tudo PROPOSTO):**

| Peça | Exige | Muda o motor? | Migration? |
|---|---|---|---|
| Relatórios das equipes, despachante, adaptadores, teto, circuito | migration `0027`, worker novo (`model-teams/`) | Não | Sim (`0027`) |
| Tradução decisão → sinal (`team-signal.ts`) | só o pacote puro | Não | Não |
| `signalSource` em `runs.request` e o duelo | mudança na API (`POST /v1/runs`, `POST /v1/model-duels`), validação Zod | Não | Não |
| Passo da execução de equipe (`team-step.ts`) | mudança no worker (`live-step.ts` escolhe o caminho pela `signalSource`; saída nova `AWAITING_TEAM`, sem commit e sem dormir; `enqueueTeamReports` numa transação curta própria no início da ronda) | Não | Não |
| Gravar as linhas | `appendDecisions` e `toRunResultRows` já exportados; **sem export novo no `run-recording` e sem mudança no motor** | Não | Não |
| Versão `model-team-1` da estratégia | criada ou achada pelo hash na criação da execução (`POST /v1/runs`); o worker recusa `configHash` diferente | Não | Não |
| Entrada gravada por vela (`team_run_inputs`) | tabela da 0027, FK composta `(run_id, user_id)`; o replay lê dela, nunca do relógio | Não | Sim (`0027`) |
| Níveis do modelo comandando a ordem (opção B) | comando novo no motor, `ENGINE_VERSION`, dourado, ADR | **Sim** | Não |

## D10. Gráfico, duelo e ranking (painel)

- **Camada "Equipes ◆"** no `candle-chart`: dados de `GET /v1/runs/:runId/model-teams` (recomendação por vela). Plaquinha
  na vela de decisão `t`; faixa (entrada, alvo, proteção) da última compra recomendada, em `[t + 15 min, t + 30 min)` e em
  degraus nas velas de 3 min (`expandLayers` da spec 017, sem lookahead visual). Cor só por token `--model` com ◆ e inicial.
- **Duelo**: tela `/duelo/:duelId` com o gráfico de patrimônio (SVG à mão, escala pura em arquivo próprio como o gráfico do
  plano), uma linha por execução, legenda ◆/● com nome, e a tabela de ranking. O ranking reaproveita o modelo da varanda
  (`ranking-model.ts`) com as equipes como linhas novas.
- **Comparação lado a lado**: cartão "Equipes × regras" (RF21) na sala.

## D11. Testes e provas

- **Puros** (`packages/model-agents`): esquema do relatório (bordas 0/100, 160/161, chave a mais, preços nulos e coerência
  `stop < entrada < alvo`, tolerância da entrada); higiene (cada palavra proibida nos três textos); prompt dourado com hash;
  privacidade (UUID, `@`, chaves fora da lista); custo e reserva; teto (bordas exatas); circuito (todas as transições);
  **`team-signal`** (matriz buy/sell/hold × com/sem posição, sem lookahead, determinismo); auditor contra um oráculo `bigint`
  sem importar `src`; mutantes.
- **Adaptadores** contra os três provedores falsos (`test-support/fake-anthropic.ts`, `fake-gemini.ts`, `fake-openai.ts`):
  200 válido, JSON inválido, recusa (`refusal` na OpenAI), `status: incomplete`, 429 com `Retry-After`, 5xx, 401, 404,
  tempo-limite, redirecionamento (deve falhar); sentinela `sk-test-SENTINEL` varrida em logs, erros e linhas.
- **Worker**: enfileirar idempotente (duas execuções no par = uma linha por equipe); o passo não espera o modelo, com p95; as
  execuções de REGRA ficam byte a byte iguais com e sem equipes; execução de equipe: compra/venda em `t + 1`, ignoradas,
  prazo estourado, **replay byte a byte sem provedor**, retomada sem duplicar; despachante com arrendamento, `STALE` e teto
  sob concorrência (duas instâncias, nenhuma passa do teto).
- **Banco**: `make database-test` (fila, unicidade, somas), `make lgpd-test`, alvo novo `make model-teams-test` (Postgres
  descartável, worker real em subprocesso, provedores falsos, API real).
- **API**: contratos de rota com `loadApiApp()`, negativos entre usuários, `400` sem eco, `api-openapi` e mutantes do filtro
  de dono (`make api-runs-mutants` +N).
- **Painel**: ficha, estados, botão, comparação, duelo, camada do gráfico, preferências, contraste do `--model`, 44 px,
  375 px, glossário e E2E (`make panel-e2e`, Edge).
- **Teste real manual** (Fase 6, com as chaves do usuário): um relatório `on_demand` por provedor; tokens, custo e latência
  em `evidence.md`; nada da chave.

## D12. Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| Custo foge (saída maior, raciocínio) | Fatura | Teto dia/mês com reserva antes de chamar, `low`, ritmo de 60 min, corte automático; opções econômicas na spec §8 |
| Modelo preview desligado (Gemini) ou id errado | Equipe para | Id no env; `model_not_found` com frase própria; troca sem deploy de código |
| Leigo lê a recomendação como conselho | Decide com dinheiro real | Higiene (RF08), rodapé "pode errar", aviso fixo, carteira fictícia, placar com Wilson, "período curto não prova nada" |
| Resultado de carteira curta seduz | Conclusão falsa | O veredito é pelo acerto de lado com Wilson; o retorno vem rotulado |
| Vazamento de chave | Conta do provedor | Só no worker, `redirect: 'error'`, código sem texto, sentinela nos testes dos três adaptadores |
| Vazamento de dado do usuário ao provedor | LGPD | `strictObject` só com dado público; relatório por par, sem contexto de usuário nem posição; contrato de varredura por provedor |
| Saída variável do LLM quebra o determinismo | Replay diverge | A decisão é linha gravada; o passo de equipe nunca chama o modelo; prova byte a byte |
| Decisão atrasada aplicada depois | Lookahead | Prazo + a linha tardia nunca usada para `t`; sinal de `t` só com dado até `t` |
| Provedor lento ou fora | Execução de equipe parada | Fila durável, tempo-limite, circuito, `STALE`, "esperar" gravado |
| Injeção de prompt | Saída manipulada | A entrada é só número de fonte pública; saída passa por Zod, coerência de preços e higiene |
| Sinal substituído recusado pela guarda do `walletStep` | Plano D9 não cabe | O sinal mantém `configHash`, `candleOpenTime` e `confirmedGapCandles` do `signalStep` real da `model-team-1`; verificado na T3.1 ANTES do resto da Fase 3; sem export novo nem mudança de motor |
| Passo à espera segura a transação ou dorme | Trava a vela e as outras execuções | `AWAITING_TEAM` devolve sem commit; prazo pelo `clock_timestamp()` do banco; enfileirar em transação curta própria, fora do passo |
| Replay lê o relógio | Resultado diverge | O replay lê `team_run_inputs`, nunca o relógio nem o provedor |
